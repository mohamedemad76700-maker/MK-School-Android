const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const baseUrl = new URL(process.env.SMOKE_BASE_URL || 'http://127.0.0.1:8080');
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
if (!localHosts.has(baseUrl.hostname) && process.env.SMOKE_ALLOW_REMOTE !== 'true') {
  console.error('[FAIL] Remote smoke targets require SMOKE_ALLOW_REMOTE=true.');
  process.exit(2);
}

let failures = 0;
let passed = 0;
function check(condition, label, detail = '') {
  if (condition) { passed++; console.log(`[OK] ${label}`); }
  else { failures++; console.error(`[FAIL] ${label}${detail ? ` — ${detail}` : ''}`); }
}

async function request(pathname, options) {
  return fetch(new URL(pathname, baseUrl), { redirect: 'manual', signal: AbortSignal.timeout(10000), ...options });
}

async function main() {
  const live = await request('/health/live');
  check(live.status === 200 && (await live.json()).status === 'ok', 'process liveness');

  const ready = await request('/health/ready');
  check(ready.status === 200 && (await ready.json()).status === 'ok', 'PostgreSQL and Redis readiness');

  const legacyHealth = await request('/health');
  check(legacyHealth.status === 200, 'legacy health endpoint compatibility');

  const page = await request('/');
  const html = await page.text();
  check(page.status === 200 && /text\/html/i.test(page.headers.get('content-type') || ''), 'frontend is served');

  const csp = page.headers.get('content-security-policy') || '';
  const scriptSrc = csp.split(';').map(value => value.trim()).find(value => /^script-src\s/.test(value)) || '';
  check(Boolean(scriptSrc) && !scriptSrc.includes("'unsafe-inline'"), 'CSP blocks inline script elements', scriptSrc || 'script-src missing');
  check(/<form[^>]+id=["']loginForm["']/i.test(html), 'login form is present');

  const scriptTags = [...html.matchAll(/<script\b([^>]*)>/gi)];
  check(scriptTags.every(([, attrs]) => /\bsrc\s*=\s*["'][^"']+["']/i.test(attrs)), 'HTML has no inline script blocks');
  const localAssets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)]
    .map(([, value]) => value)
    .filter(value => !/^(?:https?:|data:|#|\/\/)/i.test(value));
  let assetsOk = localAssets.length > 0;
  for (const asset of localAssets) {
    const pathname = `/${asset.replace(/^\.\//, '').split(/[?#]/, 1)[0]}`;
    const response = await request(pathname);
    if (!response.ok) assetsOk = false;
  }
  check(assetsOk, `local page assets load (${localAssets.length})`);

  const session = await request('/api/v1/auth/session');
  check(session.status === 401, 'saved-session endpoint rejects unauthenticated requests');

  const login = await request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: `smoke-${randomUUID()}@invalid.example`, password: randomUUID(), device_fingerprint: randomUUID() }),
  });
  check(login.status === 401, 'login rejects unknown account without creating one');

  const deniedOrigin = await request('/api/v1/auth/session', { headers: { origin: 'https://not-allowed.invalid' } });
  check(deniedOrigin.status === 403, 'CORS rejects unapproved browser origins');

  console.log(`\nSmoke checks: ${passed} passed, ${failures} failed.`);
  if (failures) process.exitCode = 1;
}

main().catch(error => {
  console.error(`[FAIL] smoke check could not complete: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});
