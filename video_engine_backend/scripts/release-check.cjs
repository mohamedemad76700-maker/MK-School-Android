const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const backend = path.join(root, 'video_engine_backend');
const nodeMajor = Number(process.versions.node.split('.')[0]);
let failed = false;

function fail(message) {
  failed = true;
  console.error(`[FAIL] ${message}`);
}

function pass(message) {
  console.log(`[OK] ${message}`);
}

if (nodeMajor < 22) fail(`Node.js 22+ is required; found ${process.version}`);
else pass(`Node.js ${process.version}`);

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const backendMain = fs.readFileSync(path.join(backend, 'src', 'main.ts'), 'utf8');
const scriptSrc = backendMain.match(/scriptSrc:\s*\[([^\]]*)\]/s)?.[1] || '';
if (!scriptSrc || /unsafe-inline/.test(scriptSrc)) fail('CSP script-src must not allow inline scripts');
else pass('CSP blocks inline script elements');
if (!/scriptSrcAttr:\s*\["'unsafe-inline'"\]/.test(backendMain)) fail('CSP inline-handler compatibility directive changed; verify legacy UI event handling before release');
else console.warn('[WARN] CSP still permits inline event-handler attributes; move legacy handlers to external listeners before claiming a strict script policy.');
const localAssets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)]
  .map(match => match[1])
  .filter(value => !/^(?:https?:|data:|#|\/\/)/i.test(value));
for (const asset of localAssets) {
  const localPath = path.resolve(root, asset.split(/[?#]/, 1)[0]);
  if (!localPath.startsWith(`${root}${path.sep}`) || !fs.existsSync(localPath)) fail(`Missing or invalid local page asset: ${asset}`);
}
if (!failed) pass(`Checked ${localAssets.length} local HTML asset references`);

const jsFiles = [
  ...fs.readdirSync(path.join(root, 'assets', 'js'), { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => path.join(root, 'assets', 'js', entry.name)),
  path.join(root, 'electron', 'main.js'),
  path.join(root, 'electron', 'preload.js'),
  path.join(__dirname, 'init-env.cjs'),
  path.join(__dirname, 'reset-admin-password.cjs'),
  path.join(__dirname, 'release-check.cjs'),
  path.join(__dirname, 'ops-smoke.cjs'),
  path.join(__dirname, 'load-test.cjs'),
  path.join(__dirname, 'ops-workflow.cjs'),
  path.join(__dirname, 'verify-db-restore.cjs'),
];
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) fail(`${path.relative(root, file)} syntax check failed\n${result.stderr || result.stdout}`);
}
if (!failed) pass(`JavaScript syntax checked (${jsFiles.length} files)`);

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
for (const script of ['typecheck', 'build', 'test']) {
  const npmArgs = ['--prefix', 'video_engine_backend', 'run', script];
  const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : npm;
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', `npm.cmd ${npmArgs.join(' ')}`]
    : npmArgs;
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0) fail(`Backend ${script} failed${result.error ? `: ${result.error.message}` : ''}`);
  else pass(`Backend ${script}`);
}

if (failed) process.exitCode = 1;
else console.log('\nRelease checks passed. Configure and verify production infrastructure separately; see PRODUCTION-RELEASE.md.');
