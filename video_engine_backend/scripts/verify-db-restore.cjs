const { spawn, spawnSync } = require('node:child_process');
const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { once } = require('node:events');
const { Pool } = require('pg');

const sourceUrl = new URL(process.env.DATABASE_URL || '');
const pgBin = process.env.PG_BIN;
const scratchRoot = path.resolve(process.env.RESTORE_TEST_ROOT || '');
if (process.env.RESTORE_TEST_CONFIRM !== 'I_UNDERSTAND') {
  console.error('[FAIL] Set RESTORE_TEST_CONFIRM=I_UNDERSTAND to allow an isolated temporary PostgreSQL restore test.');
  process.exit(2);
}
if (!process.env.DATABASE_URL || !pgBin || !scratchRoot.startsWith(path.resolve(require('node:os').tmpdir()) + path.sep)) {
  console.error('[FAIL] A local DATABASE_URL, PG_BIN, and a protected temporary directory are required.');
  process.exit(2);
}
if (!['localhost', '127.0.0.1', '[::1]'].includes(sourceUrl.hostname)) {
  console.error('[FAIL] This verification refuses to dump a remote database.');
  process.exit(2);
}

const portServer = require('node:net').createServer();
const sourcePool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { windowsHide: true, timeout: 120000, stdio: 'ignore', ...options });
  if (result.error || result.status !== 0) {
    throw new Error(`${path.basename(command)} failed${result.status === null ? '' : ` with exit code ${result.status}`}`);
  }
}

function clientEnvironment(url, extras = {}) {
  return {
    ...process.env,
    PGHOST: url.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, '')),
    PGSSLMODE: url.searchParams.get('sslmode') || 'disable',
    PGCLIENTENCODING: 'UTF8',
    ...extras,
  };
}

async function makeEncryptedDump(file, environment) {
  const pgDump = path.join(pgBin, 'pg_dump.exe');
  const child = spawn(pgDump, ['--format=custom', '--no-owner', '--no-privileges', '--compress=0'], {
    env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  const chunks = [];
  let size = 0;
  let stderr = '';
  child.stdout.on('data', chunk => {
    size += chunk.length;
    if (size > 128 * 1024 * 1024) child.kill();
    else chunks.push(Buffer.from(chunk));
  });
  child.stderr.on('data', chunk => { if (stderr.length < 2000) stderr += chunk.toString(); });
  const [code] = await once(child, 'close');
  if (code !== 0) throw new Error(`pg_dump failed${stderr ? `: ${stderr.trim().slice(-500)}` : ''}`);

  const plaintext = Buffer.concat(chunks);
  if (!plaintext.length) throw new Error('pg_dump returned an empty archive');
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  plaintext.fill(0);
  const header = Buffer.from('MKSR1');
  const payload = Buffer.concat([header, iv, cipher.getAuthTag(), encrypted]);
  await fs.writeFile(file, payload, { flag: 'wx', mode: 0o600 });
  return key;
}

async function restoreEncryptedDump(file, key, port, database, user) {
  const payload = await fs.readFile(file);
  if (payload.length < 33 || payload.subarray(0, 5).toString() !== 'MKSR1') throw new Error('encrypted archive header is invalid');
  const iv = payload.subarray(5, 17);
  const tag = payload.subarray(17, 33);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(payload.subarray(33)), decipher.final()]);
  payload.fill(0);

  const pgRestore = path.join(pgBin, 'pg_restore.exe');
  const child = spawn(pgRestore, [
    '--host=127.0.0.1', `--port=${port}`, `--username=${user}`, `--dbname=${database}`,
    '--no-owner', '--no-privileges', '--exit-on-error',
  ], { env: { ...process.env, PGPASSWORD: '' }, stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
  let stderr = '';
  child.stderr.on('data', chunk => { if (stderr.length < 4000) stderr += chunk.toString(); });
  const closePromise = once(child, 'close');
  try {
    await new Promise((resolve, reject) => {
      child.stdin.once('error', reject);
      child.stdin.end(plaintext, resolve);
    });
  } catch (error) {
    child.kill();
    plaintext.fill(0);
    await closePromise;
    throw error;
  }
  plaintext.fill(0);
  const [code] = await closePromise;
  if (code !== 0) throw new Error(`pg_restore failed${stderr ? `: ${stderr.trim().slice(-1000)}` : ''}`);
}

async function tableNames(pool) {
  const { rows } = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name");
  return rows.map(row => String(row.table_name));
}

async function main() {
  const root = await fs.realpath(scratchRoot);
  const tempParent = await fs.realpath(require('node:os').tmpdir());
  if (!root.startsWith(tempParent + path.sep) || !path.basename(root).startsWith('mkschool-restore-check-')) throw new Error('temporary restore path failed safety validation');
  const size = await sourcePool.query('SELECT pg_database_size(current_database()) AS bytes');
  if (Number(size.rows[0].bytes) > 256 * 1024 * 1024) throw new Error('source database is over the 256 MiB safe local verification limit');

  const pgCtl = path.join(pgBin, 'pg_ctl.exe');
  const initDb = path.join(pgBin, 'initdb.exe');
  const dataDir = path.join(root, 'data');
  const logFile = path.join(root, 'postgres.log');
  const encryptedDump = path.join(root, 'database.dump.mksr');
  const dbUser = `restore_${randomBytes(5).toString('hex')}`;
  const database = `restore_${randomBytes(5).toString('hex')}`;
  let port;
  let started = false;
  let key;
  try {
    await new Promise((resolve, reject) => portServer.listen(0, '127.0.0.1', resolve).once('error', reject));
    port = portServer.address().port;
    await new Promise(resolve => portServer.close(resolve));
    run(initDb, ['--username', dbUser, '--auth-local=trust', '--auth-host=trust', '--no-sync', '--encoding=UTF8', '-D', dataDir]);
    run(pgCtl, ['-D', dataDir, '-l', logFile, '-o', `-h 127.0.0.1 -p ${port} -c listen_addresses=127.0.0.1`, '-w', 'start']);
    started = true;
    run(path.join(pgBin, 'createdb.exe'), ['--host=127.0.0.1', `--port=${port}`, `--username=${dbUser}`, database]);

    const environment = clientEnvironment(sourceUrl);
    key = await makeEncryptedDump(encryptedDump, environment);
    await restoreEncryptedDump(encryptedDump, key, port, database, dbUser);

    const restoredPool = new Pool({ connectionString: `postgresql://${dbUser}@127.0.0.1:${port}/${database}`, max: 1, connectionTimeoutMillis: 5000 });
    try {
      await restoredPool.query('SELECT 1');
      const restoredTables = await tableNames(restoredPool);
      const sourceTables = await tableNames(sourcePool);
      const requiredTables = ['video_users', 'platform_state', 'exam_submissions', 'course_lesson_watch_progress'];
      const missing = requiredTables.filter(name => !restoredTables.includes(name));
      if (missing.length || restoredTables.length !== sourceTables.length) throw new Error('restored schema does not match the source table inventory');
      console.log(`[OK] encrypted temporary PostgreSQL dump restored into an isolated local cluster (${restoredTables.length} tables)`);
    } finally { await restoredPool.end(); }
  } finally {
    key?.fill(0);
    await sourcePool.end();
    await new Promise(resolve => { if (portServer.listening) portServer.close(resolve); else resolve(); });
    if (started) run(pgCtl, ['-D', dataDir, '-m', 'fast', '-w', 'stop']);
    await fs.rm(encryptedDump, { force: true }).catch(() => {});
    await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch(error => {
  console.error(`[FAIL] isolated DB restore check failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});
