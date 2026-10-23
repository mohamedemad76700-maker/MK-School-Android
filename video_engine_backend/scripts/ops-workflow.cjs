const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const net = require('node:net');
const { Pool } = require('pg');
const argon2 = require('argon2');

const baseUrl = new URL(process.env.WORKFLOW_TEST_BASE_URL || 'http://127.0.0.1:8080');
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
if (!localHosts.has(baseUrl.hostname)) {
  console.error('[FAIL] Workflow tests can only run against a loopback server.');
  process.exit(2);
}
if (process.env.WORKFLOW_TEST_CONFIRM !== 'I_UNDERSTAND') {
  console.error('[FAIL] Set WORKFLOW_TEST_CONFIRM=I_UNDERSTAND to allow temporary test accounts in the configured local database.');
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error('[FAIL] DATABASE_URL must be loaded with node --env-file=.env.');
  process.exit(2);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 5000 });
const suffix = randomUUID().replaceAll('-', '');
const workflowClientIp = process.env.WORKFLOW_TEST_CLIENT_IP?.trim() || '';
if (workflowClientIp && !/^192\.0\.2\.(?:[1-9]|[1-9]\d|1\d\d|2[0-4]\d|25[0-4])$/.test(workflowClientIp)) {
  console.error('[FAIL] WORKFLOW_TEST_CLIENT_IP must use a reserved 192.0.2.0/24 documentation address.');
  process.exit(2);
}
const studentId = `codexqa-student-${suffix}`;
const parentId = `codexqa-parent-${suffix}`;
const adminId = `codexqa-admin-${suffix}`;
const videoId = `codexqa-${suffix}`;
const studentEmail = `${studentId}@example.invalid`;
const parentEmail = `${parentId}@example.invalid`;
const adminEmail = `${adminId}@example.invalid`;
const parentPhone = '01012345678';
const password = `Qa-${randomUUID()}-p9`;
const parentDevice = randomUUID();
const smtpCaptureEnabled = process.env.WORKFLOW_SMTP_TEST === 'true';
const smtpCapturePort = Number.parseInt(process.env.WORKFLOW_SMTP_CAPTURE_PORT || '25252', 10);
const smtpMessages = [];
let smtpCaptureServer;
let passed = 0;
let failures = 0;

function startSmtpCapture(port) {
  const server = net.createServer(socket => {
    socket.setEncoding('utf8');
    socket.on('error', () => {});
    socket.write('220 mk-school-test.local ESMTP\r\n');
    let buffer = '';
    let inData = false;
    let messageLines = [];
    socket.on('data', chunk => {
      buffer += chunk;
      while (true) {
        const end = buffer.indexOf('\r\n');
        if (end < 0) break;
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (inData) {
          if (line === '.') {
            smtpMessages.push(messageLines.join('\n'));
            messageLines = [];
            inData = false;
            socket.write('250 2.0.0 queued\r\n');
          } else messageLines.push(line.startsWith('..') ? line.slice(1) : line);
          continue;
        }
        const command = line.split(' ', 1)[0].toUpperCase();
        if (command === 'EHLO' || command === 'HELO') socket.write('250-mk-school-test.local\r\n250 SIZE 10485760\r\n');
        else if (command === 'MAIL' || command === 'RCPT' || command === 'RSET' || command === 'NOOP') socket.write('250 2.0.0 OK\r\n');
        else if (command === 'DATA') { inData = true; socket.write('354 End data with <CR><LF>.<CR><LF>\r\n'); }
        else if (command === 'QUIT') { socket.write('221 2.0.0 Bye\r\n'); socket.end(); }
        else socket.write('500 unsupported SMTP command\r\n');
      }
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(server); });
  });
}

function resetTokenFromMail(rawMessage) {
  const parts = rawMessage.split(/\n--[^\r\n]+(?:--)?\r?\n/);
  for (const part of parts) {
    const separator = part.indexOf('\n\n');
    if (separator < 0) continue;
    const headers = part.slice(0, separator);
    let body = part.slice(separator + 2).replace(/\n--[^\r\n]+--?\s*$/s, '');
    const transferEncoding = headers.match(/content-transfer-encoding:\s*([^\r\n]+)/i)?.[1]?.trim().toLowerCase();
    if (transferEncoding === 'base64') body = Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf8');
    else if (transferEncoding === 'quoted-printable') {
      const clean = body.replace(/=\n/g, '');
      const bytes = [];
      for (let index = 0; index < clean.length; index++) {
        if (clean[index] === '=' && /^[\da-f]{2}$/i.test(clean.slice(index + 1, index + 3))) {
          bytes.push(Number.parseInt(clean.slice(index + 1, index + 3), 16));
          index += 2;
        } else bytes.push(clean.charCodeAt(index) & 0xff);
      }
      body = Buffer.from(bytes).toString('utf8');
    }
    const token = body.match(/reset_token=([A-Za-z0-9_-]{40,50})/)?.[1];
    if (token) return token;
  }
  return '';
}

function check(condition, description, detail = '') {
  if (condition) { passed++; console.log(`[OK] ${description}`); }
  else { failures++; console.error(`[FAIL] ${description}${detail ? ` — ${detail}` : ''}`); }
}

async function api(path, { method = 'GET', body, token, cookie } = {}) {
  const headers = {};
  if (workflowClientIp) headers['x-forwarded-for'] = workflowClientIp;
  const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !multipart) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = cookie;
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers,
    ...(body !== undefined ? { body: multipart ? body : JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  let data = {};
  try { data = await response.json(); } catch { /* response body is not needed */ }
  return { response, data };
}

async function expectStatus(path, expected, options, description) {
  const result = await api(path, options);
  const detail = result.response.status === expected ? '' : `HTTP ${result.response.status}${result.data?.error ? `: ${String(result.data.error).slice(0, 160)}` : ''}`;
  check(result.response.status === expected, description, detail);
  return result;
}

async function cleanup() {
  const mediaRoot = path.resolve(process.env.MEDIA_ROOT || path.join(__dirname, '..', 'media'));
  const videoRows = await pool.query('SELECT input_path FROM video_jobs WHERE video_id=$1', [videoId]);
  for (const row of videoRows.rows) {
    const candidate = String(row.input_path || '');
    const relative = path.relative(mediaRoot, candidate);
    if (relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) await fs.rm(candidate, { force: true }).catch(() => {});
  }
  await pool.query('DELETE FROM video_jobs WHERE video_id=$1', [videoId]);
  const hlsPath = path.join(mediaRoot, 'hls', videoId);
  if (path.basename(hlsPath) === videoId && videoId.startsWith('codexqa-')) await fs.rm(hlsPath, { recursive: true, force: true });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const id of [studentId, parentId, adminId]) {
      await client.query('DELETE FROM parent_link_codes WHERE student_id=$1', [id]);
      await client.query('DELETE FROM parent_student_links WHERE parent_id=$1 OR student_id=$1', [id]);
      await client.query('DELETE FROM account_devices WHERE user_id=$1', [id]);
      await client.query('DELETE FROM password_reset_tokens WHERE user_id=$1', [id]);
      await client.query('DELETE FROM audit_logs WHERE actor_id=$1', [id]);
      await client.query('DELETE FROM video_user_profiles WHERE user_id=$1', [id]);
      await client.query('DELETE FROM video_users WHERE id=$1', [id]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

async function main() {
  let adminToken;
  let parentToken;
  let studentToken;
  let parentCookie;
  try {
    if (smtpCaptureEnabled) {
      if (!Number.isInteger(smtpCapturePort) || smtpCapturePort < 1 || smtpCapturePort > 65535) throw new Error('invalid local SMTP capture port');
      smtpCaptureServer = await startSmtpCapture(smtpCapturePort);
      console.log(`[OK] local-only SMTP capture is listening on 127.0.0.1:${smtpCapturePort}`);
    }
    const studentSignup = await expectStatus('/api/v1/auth/register', 201, {
      method: 'POST', body: { id: studentId, role: 'student', email: studentEmail, password, parent_phone: parentPhone, name: 'Temporary QA Student', profile: { grade: 'أولى ثانوي' } },
    }, 'student registration creates a pending account');
    check(studentSignup.data.active === false && studentSignup.data.approval_required === true, 'student account waits for school approval');

    const blockedLogin = await expectStatus('/api/v1/auth/login', 401, {
      method: 'POST', body: { identifier: studentId, password, parent_phone: parentPhone, device_fingerprint: randomUUID() },
    }, 'pending student cannot log in');
    check(!blockedLogin.data.token, 'pending login issues no access token');

    await expectStatus('/api/v1/auth/register', 201, {
      method: 'POST', body: { id: parentId, role: 'parent', email: parentEmail, password, parent_phone: parentPhone, name: 'Temporary QA Parent' },
    }, 'parent registration creates an active account');

    const adminHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
    await pool.query("INSERT INTO video_users(id,role,email,password,active,parent_phone) VALUES($1,'admin',$2,$3,TRUE,NULL)", [adminId, adminEmail, adminHash]);
    const adminLogin = await expectStatus('/api/v1/auth/login', 200, { method: 'POST', body: { identifier: adminId, password } }, 'administrator login works without device pairing');
    adminToken = adminLogin.data.token;
    check(Boolean(adminToken) && adminLogin.data.max_devices === null, 'administrator receives an unrestricted-device session');
    await expectStatus('/api/v1/admin/audit-logs', 200, { token: adminToken }, 'administrator can read the protected audit log');

    const ffmpeg = await expectStatus('/api/v1/admin/video/ffmpeg-status', 200, { token: adminToken }, 'administrator video health endpoint is protected and reachable');
    check(ffmpeg.data.available === true, 'server resolves FFmpeg');

    const ffmpegPath = process.env.FFMPEG_PATH?.trim() || 'ffmpeg';
    const temporaryVideoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mk-school-qa-'));
    const temporaryVideo = path.join(temporaryVideoDir, 'synthetic-lesson.mp4');
    try {
      const encoded = spawnSync(ffmpegPath, [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:d=1',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-t', '1', '-an', temporaryVideo,
      ], { stdio: 'ignore', windowsHide: true, timeout: 15000 });
      check(encoded.status === 0, 'FFmpeg can encode a synthetic one-second test lesson');
      if (encoded.status === 0) {
        const multipart = new FormData();
        multipart.append('video_id', videoId);
        multipart.append('video', new Blob([await fs.readFile(temporaryVideo)], { type: 'video/mp4' }), 'synthetic-lesson.mp4');
        const upload = await expectStatus('/api/v1/video/upload', 200, { method: 'POST', token: adminToken, body: multipart }, 'administrator can upload a course video');
        const jobId = String(upload.data.job_id || '');
        let job = { data: {}, response: { status: 0 } };
        const deadline = Date.now() + 60000;
        while (jobId && Date.now() < deadline) {
          job = await api(`/api/v1/video/jobs/${encodeURIComponent(jobId)}`, { token: adminToken });
          if (job.data.status === 'completed' || job.data.status === 'failed') break;
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        check(job.data.status === 'completed', 'uploaded video transcodes into completed HLS output');
        if (job.data.status === 'completed') {
          const preview = await api('/api/v1/admin/video/preview-token', { method: 'POST', token: adminToken, body: { video_id: videoId } });
          check(preview.response.status === 200 && Boolean(preview.data.license_key), 'administrator receives a short-lived video preview token');
          if (preview.data.license_key) {
            const playlistResponse = await fetch(new URL(`/api/v1/videos/${encodeURIComponent(videoId)}/playlist?token=${encodeURIComponent(preview.data.license_key)}`, baseUrl));
            const playlistText = await playlistResponse.text();
            check(playlistResponse.status === 200 && playlistText.startsWith('#EXTM3U'), 'HLS playlist streams with its scoped token');
            const segmentPath = playlistText.split(/\r?\n/).find(line => line.startsWith(`/api/v1/videos/${encodeURIComponent(videoId)}/segment/`));
            if (segmentPath) {
              const segmentResponse = await fetch(new URL(segmentPath, baseUrl));
              const segment = await segmentResponse.arrayBuffer();
              check(segmentResponse.status === 200 && segment.byteLength > 0, 'authorized HLS video segment downloads');
            } else check(false, 'playlist references a scoped HLS segment');
          }
        }
      }
    } finally { await fs.rm(temporaryVideoDir, { recursive: true, force: true }); }

    await expectStatus('/api/v1/auth/sync-users', 200, {
      method: 'POST', token: adminToken,
      body: { users: [{ id: studentId, role: 'student', email: studentEmail, active: true, parent_phone: parentPhone, profile: { name: 'Temporary QA Student', grade: 'أولى ثانوي' } }] },
    }, 'administrator approval activates the pending student');

    const parentLogin = await expectStatus('/api/v1/auth/login', 200, {
      method: 'POST', body: { identifier: parentId, password, parent_phone: parentPhone, device_fingerprint: parentDevice },
    }, 'parent login validates the registered guardian phone');
    parentToken = parentLogin.data.token;
    parentCookie = (parentLogin.response.headers.get('set-cookie') || '').split(';', 1)[0];
    check(Boolean(parentToken && parentCookie), 'parent receives an API token and persistent session cookie');
    const session = await expectStatus('/api/v1/auth/session', 200, { cookie: parentCookie }, 'saved parent session restores successfully');
    check(session.data.role === 'parent', 'restored session keeps the correct account role');

    const studentLogin = await expectStatus('/api/v1/auth/login', 200, {
      method: 'POST', body: { identifier: studentId, password, parent_phone: parentPhone, device_fingerprint: randomUUID() },
    }, 'approved student login validates the guardian phone');
    studentToken = studentLogin.data.token;
    const linkCode = await expectStatus('/api/v1/parent-links/code', 201, { method: 'POST', token: studentToken, body: {} }, 'student can create a one-time guardian link code');
    check(typeof linkCode.data.code === 'string' && linkCode.data.code.length === 32, 'guardian link code has the expected format');

    const redeem = await expectStatus('/api/v1/parent-links/redeem', 200, { method: 'POST', token: parentToken, body: { code: linkCode.data.code } }, 'parent can link the student using the one-time code');
    check(redeem.data.student_id === studentId, 'guardian link resolves to the intended student');
    const secondUse = await expectStatus('/api/v1/parent-links/redeem', 400, { method: 'POST', token: parentToken, body: { code: linkCode.data.code } }, 'guardian link code cannot be reused');
    void secondUse;

    const state = await expectStatus('/api/v1/platform/state', 200, { token: parentToken }, 'linked parent can open the student platform view');
    check((state.data.state?.students || []).some(student => student.id === studentId), 'parent view contains the linked student');
    await expectStatus('/api/v1/admin/audit-logs', 403, { token: parentToken }, 'parent cannot access administrator audit data');
    await expectStatus('/api/v1/parent-links/code', 403, { method: 'POST', token: parentToken, body: {} }, 'parent cannot issue student link codes');

    if (smtpCaptureEnabled) {
      const unknownReset = await expectStatus('/api/v1/auth/password-reset/request', 202, { method: 'POST', body: { email: `unknown-${suffix}@example.invalid` } }, 'password recovery hides whether an email belongs to an account');
      const knownReset = await expectStatus('/api/v1/auth/password-reset/request', 202, { method: 'POST', body: { email: parentEmail } }, 'password recovery accepts an active account email');
      check(unknownReset.data.message === knownReset.data.message, 'known and unknown recovery requests return the same message');
      check(smtpMessages.length === 1, 'local SMTP capture receives exactly one recovery email');
      const resetToken = resetTokenFromMail(smtpMessages[0] || '');
      check(resetToken.length >= 40, 'captured recovery email contains a strong single-use reset token');
      const resetPassword = `QaReset-${randomUUID()}-p9`;
      if (resetToken) {
        await expectStatus('/api/v1/auth/password-reset/complete', 200, { method: 'POST', body: { token: resetToken, password: resetPassword } }, 'password recovery updates the password');
        await expectStatus('/api/v1/auth/password-reset/complete', 400, { method: 'POST', body: { token: resetToken, password: `Again-${randomUUID()}-p9` } }, 'a recovery token cannot be reused');
        await expectStatus('/api/v1/platform/state', 401, { token: parentToken }, 'password recovery revokes previously issued access tokens');
        await expectStatus('/api/v1/auth/login', 401, { method: 'POST', body: { identifier: parentId, password, parent_phone: parentPhone, device_fingerprint: parentDevice } }, 'previous password stops working after recovery');
        const recoveredLogin = await expectStatus('/api/v1/auth/login', 200, { method: 'POST', body: { identifier: parentId, password: resetPassword, parent_phone: parentPhone, device_fingerprint: parentDevice } }, 'new password works after recovery');
        parentToken = recoveredLogin.data.token;
        parentCookie = (recoveredLogin.response.headers.get('set-cookie') || '').split(';', 1)[0];
        await expectStatus('/api/v1/auth/session', 200, { cookie: parentCookie }, 'recovered account can create a fresh persistent session');
      }
    }

    const aiStatus = await expectStatus('/api/v1/ai/status', 200, { token: studentToken }, 'student can inspect the AI service mode');
    check(['cloud', 'offline'].includes(aiStatus.data.mode), `AI service reports ${aiStatus.data.mode === 'cloud' ? 'cloud' : 'offline fallback'} mode without sending student content externally`);
    await expectStatus('/api/v1/auth/logout', 200, { method: 'POST', token: parentToken }, 'parent logout succeeds');
    await expectStatus('/api/v1/auth/logout', 200, { method: 'POST', token: studentToken }, 'student logout succeeds');
    await expectStatus('/api/v1/auth/logout', 200, { method: 'POST', token: adminToken }, 'administrator logout succeeds');
  } finally {
    try { await cleanup(); console.log('[OK] temporary workflow accounts and records removed'); }
    catch (error) { console.error(`[FAIL] temporary account cleanup failed: ${error instanceof Error ? error.message : 'unknown error'}`); failures++; }
    await pool.end();
    if (smtpCaptureServer?.listening) await new Promise(resolve => smtpCaptureServer.close(resolve));
  }
  console.log(`\nWorkflow checks: ${passed} passed, ${failures} failed.`);
  if (failures) process.exitCode = 1;
}

main().catch(error => {
  console.error(`[FAIL] workflow test could not complete: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});
