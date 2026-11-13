import "server-only";
// In-memory sliding-window rate limiter (single Node process — fine for one VPS container).
// Keyed by `${route}:${ip}`; state survives HMR via globalThis.

type Store = { hits: Map<string, number[]>; calls: number };
const g = globalThis as unknown as { __ondeRateLimit?: Store };
const store: Store = (g.__ondeRateLimit ??= { hits: new Map(), calls: 0 });

export type RateLimitResult = { ok: boolean; limit: number; remaining: number; retryAfter: number };

function sweep(now: number, windowMs: number) {
  for (const [key, list] of store.hits) {
    const fresh = list.filter((t) => now - t < windowMs);
    if (fresh.length) store.hits.set(key, fresh);
    else store.hits.delete(key);
  }
}

/**
 * Allow at most `limit` hits per `windowMs` for `key` (sliding window). Rejected hits are not counted.
 * `retryAfter` is in seconds.
 */
export function rateLimit(key: string, limit: number, windowMs = 60_000): RateLimitResult {
  const now = Date.now();
  if (++store.calls % 500 === 0 || store.hits.size > 20_000) sweep(now, Math.max(windowMs, 10 * 60_000));
  const list = (store.hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= limit) {
    store.hits.set(key, list);
    const retryAfter = Math.max(1, Math.ceil((windowMs - (now - list[0])) / 1000));
    return { ok: false, limit, remaining: 0, retryAfter };
  }
  list.push(now);
  store.hits.set(key, list);
  return { ok: true, limit, remaining: limit - list.length, retryAfter: 0 };
}

/**
 * Client IP from proxy headers. Caddy (the only ingress in production) overwrites X-Forwarded-For with the real client
 * address, so the first entry is trustworthy there; falls back to X-Real-IP / CF-Connecting-IP.
 */
export function getClientIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  const ip = first || headers.get("x-real-ip")?.trim() || headers.get("cf-connecting-ip")?.trim() || null;
  if (!ip) return null;
  return ip.replace(/^::ffff:/, "").slice(0, 64);
}

/** Rate-limit a request by route + client IP. */
export function limitRequest(req: Request, route: string, limit: number, windowMs = 60_000): RateLimitResult {
  return rateLimit(`${route}:${getClientIp(req.headers) ?? "unknown"}`, limit, windowMs);
}

/** Standard 429 JSON response. */
export function tooManyRequests(r: RateLimitResult): Response {
  return Response.json(
    { error: "rate_limited", retryAfter: r.retryAfter },
    { status: 429, headers: { "Retry-After": String(r.retryAfter), "Cache-Control": "no-store" } },
  );
}
