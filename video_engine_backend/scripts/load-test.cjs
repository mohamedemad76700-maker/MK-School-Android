const { performance } = require('node:perf_hooks');

const baseUrl = new URL(process.env.LOAD_TEST_BASE_URL || 'http://127.0.0.1:8080');
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
if (!localHosts.has(baseUrl.hostname) && process.env.LOAD_TEST_ALLOW_REMOTE !== 'true') {
  console.error('[FAIL] Remote load targets require LOAD_TEST_ALLOW_REMOTE=true.');
  process.exit(2);
}
if (process.env.LOAD_TEST_CONFIRM !== 'I_UNDERSTAND') {
  console.error('[FAIL] Set LOAD_TEST_CONFIRM=I_UNDERSTAND to acknowledge this sends real requests to the selected server.');
  process.exit(2);
}

const requestCount = Number.parseInt(process.env.LOAD_TEST_REQUESTS || '500', 10);
const concurrency = Number.parseInt(process.env.LOAD_TEST_CONCURRENCY || '500', 10);
const pathname = process.env.LOAD_TEST_PATH || '/health';
if (!Number.isInteger(requestCount) || requestCount < 1 || requestCount > 10000 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 1000 || !pathname.startsWith('/')) {
  console.error('[FAIL] Invalid request count, concurrency, or path.');
  process.exit(2);
}

const token = process.env.LOAD_TEST_BEARER_TOKEN;
const latencies = [];
const statuses = new Map();
let next = 0;
let failures = 0;

async function worker() {
  while (true) {
    const index = next++;
    if (index >= requestCount) return;
    const started = performance.now();
    try {
      const headers = token ? { authorization: `Bearer ${token}` } : undefined;
      const response = await fetch(new URL(pathname, baseUrl), { headers, signal: AbortSignal.timeout(15000) });
      latencies.push(performance.now() - started);
      statuses.set(response.status, (statuses.get(response.status) || 0) + 1);
      await response.arrayBuffer();
    } catch {
      failures++;
      latencies.push(performance.now() - started);
    }
  }
}

function percentile(sorted, fraction) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

async function main() {
  const started = performance.now();
  await Promise.all(Array.from({ length: Math.min(concurrency, requestCount) }, () => worker()));
  const duration = performance.now() - started;
  const sorted = latencies.sort((a, b) => a - b);
  console.log(`Target: ${baseUrl.origin}${pathname}`);
  console.log(`Requests: ${requestCount}; concurrency: ${concurrency}; elapsed: ${(duration / 1000).toFixed(2)}s`);
  console.log(`Throughput: ${(requestCount / (duration / 1000)).toFixed(1)} requests/s`);
  console.log(`Latency ms: p50=${percentile(sorted, 0.50).toFixed(1)} p95=${percentile(sorted, 0.95).toFixed(1)} p99=${percentile(sorted, 0.99).toFixed(1)} max=${(sorted.at(-1) || 0).toFixed(1)}`);
  console.log(`HTTP statuses: ${[...statuses].sort((a, b) => a[0] - b[0]).map(([code, count]) => `${code}=${count}`).join(', ') || 'none'}; network/timeouts=${failures}`);
  if (failures || [...statuses.keys()].some(status => status >= 500)) process.exitCode = 1;
}

main().catch(error => {
  console.error(`[FAIL] load test failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});
