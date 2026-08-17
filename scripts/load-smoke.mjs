import { performance } from 'node:perf_hooks';

const baseUrl = process.env.LOAD_BASE_URL ?? 'http://localhost:3000';
const path = process.env.LOAD_PATH ?? '/api/leaderboards?pageSize=20';
const total = Number(process.env.LOAD_REQUESTS ?? 200);
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 20);

if (!Number.isInteger(total) || total < 1 || !Number.isInteger(concurrency) || concurrency < 1) {
  throw new Error('LOAD_REQUESTS and LOAD_CONCURRENCY must be positive integers');
}

let cursor = 0;
const durations = [];
const failures = [];

async function worker() {
  while (cursor < total) {
    const requestNumber = ++cursor;
    const startedAt = performance.now();
    try {
      const response = await fetch(new URL(path, baseUrl), {
        signal: AbortSignal.timeout(10_000),
      });
      await response.arrayBuffer();
      durations.push(performance.now() - startedAt);
      if (!response.ok) failures.push({ requestNumber, status: response.status });
    } catch (error) {
      failures.push({
        requestNumber,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

const startedAt = performance.now();
await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
const elapsedMs = performance.now() - startedAt;
durations.sort((a, b) => a - b);

function percentile(value) {
  if (durations.length === 0) return 0;
  return durations[Math.min(durations.length - 1, Math.ceil(durations.length * value) - 1)];
}

const report = {
  url: new URL(path, baseUrl).toString(),
  requests: total,
  concurrency,
  successes: total - failures.length,
  failures: failures.length,
  requestsPerSecond: Number((total / (elapsedMs / 1000)).toFixed(2)),
  latencyMs: {
    p50: Number(percentile(0.5).toFixed(2)),
    p95: Number(percentile(0.95).toFixed(2)),
    p99: Number(percentile(0.99).toFixed(2)),
    max: Number((durations.at(-1) ?? 0).toFixed(2)),
  },
  firstFailures: failures.slice(0, 5),
};

console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exitCode = 1;
