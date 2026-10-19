// Anomaly guard for the public proxy. Tracks request/failure rates per client
// and globally; when an anomaly trips the threshold, the proxy severs the
// connection and serves a maintenance page for the lockout period.
//
// Note: counters live in the worker isolate's memory, so the lockout is
// per-isolate and resets when the isolate is recycled. This is a fast
// first-line defense, not a persistent audit log.

type Bucket = { hits: number[]; failures: number[] };

const clients = new Map<string, Bucket>();
let globalHits: number[] = [];
let lockedUntil = 0;

const WINDOW_MS = 60_000;
const MAX_PER_CLIENT = 120; // requests per minute per client
const MAX_FAILURES_PER_CLIENT = 40; // 4xx/5xx outcomes per minute per client
const MAX_GLOBAL = 1_500; // requests per minute across all clients
const LOCKOUT_MS = 5 * 60_000;

function prune(arr: number[], now: number) {
  const cutoff = now - WINDOW_MS;
  while (arr.length && arr[0] < cutoff) arr.shift();
}

export function clientKey(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf;
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0].trim() : "unknown";
}

export function checkGuard(
  key: string,
  now = Date.now(),
): { allowed: boolean; retryAfter?: number } {
  if (now < lockedUntil) {
    return { allowed: false, retryAfter: Math.ceil((lockedUntil - now) / 1000) };
  }
  prune(globalHits, now);
  let bucket = clients.get(key);
  if (!bucket) {
    bucket = { hits: [], failures: [] };
    clients.set(key, bucket);
  }
  prune(bucket.hits, now);
  prune(bucket.failures, now);
  globalHits.push(now);
  bucket.hits.push(now);
  if (
    bucket.hits.length > MAX_PER_CLIENT ||
    bucket.failures.length > MAX_FAILURES_PER_CLIENT ||
    globalHits.length > MAX_GLOBAL
  ) {
    lockedUntil = now + LOCKOUT_MS;
    console.error(
      `AzocProxy guard: anomaly detected from "${key}" — proxy connection severed for ${LOCKOUT_MS / 1000}s`,
    );
    return { allowed: false, retryAfter: Math.ceil(LOCKOUT_MS / 1000) };
  }
  return { allowed: true };
}

export function recordOutcome(key: string, status: number, now = Date.now()) {
  if (status < 400) return;
  const bucket = clients.get(key);
  if (!bucket) return;
  prune(bucket.failures, now);
  bucket.failures.push(now);
}

export function guardResponse(retryAfter: number): Response {
  const minutes = Math.max(1, Math.ceil(retryAfter / 60));
  return new Response(
    `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>AzocProxy — 一時停止中</title></head>` +
      `<body style="font-family:sans-serif;background:#0f0a1e;color:#e6e1f5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">` +
      `<div style="text-align:center;max-width:32rem;padding:2rem">` +
      `<h1>一時的に停止しています</h1>` +
      `<p>異常なアクセスを検知したため、安全のためにサイトとサーバーの接続を自動で切断しました。` +
      `約${minutes}分後に自動で復旧します。しばらく待ってから再度お試しください。</p>` +
      `</div></body></html>`,
    {
      status: 503,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "retry-after": String(retryAfter),
        "cache-control": "no-store",
      },
    },
  );
}

export function __resetGuardForTests() {
  clients.clear();
  globalHits = [];
  lockedUntil = 0;
}
