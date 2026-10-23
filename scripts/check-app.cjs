const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const webDir = path.join(root, 'www');
const androidAssets = path.join(root, 'android', 'app', 'src', 'main', 'assets', 'public');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function collectFiles(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(absolute, relative) : [relative];
  }).sort();
}

const capacitor = JSON.parse(read('capacitor.config.json'));
assert.equal(capacitor.appId, 'com.mkschool.mobile', 'Capacitor appId must match Android');
assert.equal(capacitor.webDir, 'www', 'Capacitor webDir must point to www');

const manifest = read('android/app/src/main/AndroidManifest.xml');
assert.match(manifest, /android:allowBackup="false"/, 'Android app data backup must stay disabled');
assert.match(manifest, /android:dataExtractionRules="@xml\/data_extraction_rules"/);
assert.match(manifest, /android:fullBackupContent="@xml\/full_backup_rules"/);
assert.match(manifest, /<uses-permission android:name="android.permission.INTERNET"\s*\/>/);
const backupRules = read('android/app/src/main/res/xml/data_extraction_rules.xml');
for (const domain of ['root', 'file', 'database', 'sharedpref', 'external', 'device_root', 'device_file', 'device_database', 'device_sharedpref']) {
  assert.equal((backupRules.match(new RegExp(`<exclude domain="${domain}" path="\\." \\/>`,'g')) || []).length, 2,
    `both Android backup modes must exclude ${domain}`);
}
const legacyBackupRules = read('android/app/src/main/res/xml/full_backup_rules.xml');
for (const domain of ['root', 'file', 'database', 'sharedpref', 'external', 'device_root', 'device_file', 'device_database', 'device_sharedpref']) {
  assert.equal((legacyBackupRules.match(new RegExp(`<exclude domain="${domain}" path="\\." \\/>`,'g')) || []).length, 1,
    `legacy Android backup rules must exclude ${domain}`);
}

const html = fs.readFileSync(path.join(webDir, 'index.html'), 'utf8');
assert.match(html, /assets\/js\/10-ai-assistant-bubble\.js/, 'student AI bubble must be loaded');
assert.ok(fs.existsSync(path.join(webDir, 'assets', 'js', '10-ai-assistant-bubble.js')));

const sourceFiles = collectFiles(webDir);
const bundledFiles = collectFiles(androidAssets);
const bundledFileSet = new Set(bundledFiles);

const frontendScripts = sourceFiles
  .filter((relative) => relative.startsWith('assets/js/') && relative.endsWith('.js'))
  .map((relative) => fs.readFileSync(path.join(webDir, relative), 'utf8'))
  .join('\n');
const backendSource = read('video_engine_backend/src/main.ts');
const teacherRemovalMigration = read('video_engine_backend/migrations/0020_remove_teacher_accounts.sql');
assert.match(html, /data-mk-click="mkTogglePassword\('loginPass'\)"/, 'login must provide an accessible show-password control');
assert.match(frontendScripts, /function mkSaveExamGameSettings\(/, 'admin must be able to save age-group exam game settings');
assert.match(frontendScripts, /function mkExamGameForGrade\(/, 'exam games must follow the student age group');
assert.match(frontendScripts, /window\.mkVideoQuality=function/, 'video quality selector must change HLS playback quality');
assert.doesNotMatch(frontendScripts, /teacherClasses\(|saveClassTeachers|removeFromClass/, 'classroom system actions must stay removed');
assert.match(frontendScripts, /window\.mkRenderCourseMarket=window\.pages\.courses;/, 'the enhanced course market must remain available');
assert.match(frontendScripts, /window\.mkFilterCourseSubject=function/, 'the course market must retain its subject filter');
assert.match(frontendScripts, /delete platformTabsByRole\.teacher;/, 'the platform must not expose teacher navigation');
assert.match(backendSource, /const ALLOWED_ROLES = new Set\(\['student', 'admin', 'parent'\]\)/, 'the API must reject retired teacher accounts');
assert.match(teacherRemovalMigration, /DELETE FROM video_users WHERE role = 'teacher'/, 'deployment migration must remove retired teacher accounts');
assert.match(backendSource, /app\.get\('\/api\/v1\/videos\/:video_id\/playlist\/:variant'/, 'backend must serve protected HLS quality playlists');
const frontendApiPaths = new Set([...frontendScripts.matchAll(/[\x27\x22\x60](\/api\/v1\/[^\x27\x22\x60\s]*)[\x27\x22\x60]/g)]
  .map((match) => match[1].split('?')[0].replace(/\/$/, '')));
const backendApiRoutes = [...backendSource.matchAll(/app\.(?:get|post|delete)\(\s*[\x27\x22\x60](\/api\/v1\/[^\x27\x22\x60]+)[\x27\x22\x60]/g)]
  .map((match) => match[1]);
assert.ok(backendApiRoutes.length > 0, 'backend API routes must be present in the bundled project');
for (const frontendPath of frontendApiPaths) {
  const matched = backendApiRoutes.some((route) => route === frontendPath
    || route.startsWith(`${frontendPath}/`)
    || frontendPath.startsWith(route.replace(/:\w+/g, '').replace(/\/$/, '')));
  assert.ok(matched, `frontend API path has no backend route: ${frontendPath}`);
}

for (const relative of sourceFiles) {
  assert.ok(bundledFileSet.has(relative), `Android bundle is missing: ${relative}`);
}
const capacitorFiles = bundledFiles.filter((relative) => !sourceFiles.includes(relative));
assert.deepEqual(capacitorFiles, ['cordova.js', 'cordova_plugins.js'], 'unexpected files in Android web bundle');
for (const relative of sourceFiles) {
  const sourceHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(webDir, relative))).digest('hex');
  const bundledHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(androidAssets, relative))).digest('hex');
  assert.equal(bundledHash, sourceHash, `Android bundle is stale: ${relative}`);
}

const jsDirectory = path.join(webDir, 'assets', 'js');
const appScripts = fs.readdirSync(jsDirectory).filter((file) => file.endsWith('.js'));
for (const file of appScripts) {
  const result = spawnSync(process.execPath, ['--check', path.join(jsDirectory, file)], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${file} failed JavaScript syntax check:\n${result.stderr}`);
}

console.log(`App checks passed: ${appScripts.length} JavaScript files; ${sourceFiles.length} Android assets synchronized.`);
