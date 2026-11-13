import "server-only";
// Web Push (RFC 8030/8291/8292) to the owner's devices: iPhone Home Screen web app (iOS 16.4+), macOS Safari, Chrome,
// Firefox, Edge. Subscriptions live in `push_subscriptions`; the VAPID key pair in `vapid_keys` (or env overrides).
//
// Guarantees:
//   • never throws out of sendToAll / sendToOne, never blocks the caller's work (orders are created before we start);
//   • endpoints are restricted to the real push services (SSRF guard) when saving AND when sending;
//   • the VAPID private key never leaves this module (no export, log, audit entry or client prop carries it);
//   • every payload is built per subscription so its links point to the origin that device installed the app from.
import { createECDH, createHash } from "node:crypto";
import { count, desc, eq, sql } from "drizzle-orm";
import webpush from "web-push";
import { getDb } from "../db";
import { pushSubscriptions, vapidKeys } from "../db/schema";
import { isPublicHostname } from "./admin-host";
import { audit } from "./audit";
import { DataError } from "./errors";
import { warnOnce } from "./session";

// ---------------------------------------------------------------------------------------------------------------
// Types (client components may `import type` these)

/** Safe view of a registered device: no keys, only the push-service host of the endpoint. */
export type PushDevice = {
  id: number;
  label: string;
  origin: string;
  /** Push service host, e.g. "web.push.apple.com". */
  host: string;
  /** sha256(endpoint) prefix — lets a browser recognise "this device" without the server revealing endpoints. */
  fp: string;
  createdAt: number;
  lastSeenAt: number | null;
  lastSuccessAt: number | null;
  failures: number;
  lastError: string | null;
};

/** What a notification says. `path` is made absolute on each subscription's own origin. */
export type PushPayload = {
  title: string;
  body: string;
  path: string;
  /** App icon badge (number of new orders); null = leave the badge alone. */
  badge: number | null;
  data: { kind: "order" | "test" | "client"; orderId?: number; customerId?: number };
};

export type PushTarget = { id: number; origin: string; label: string | null };
export type PushBuild = (target: PushTarget) => PushPayload;

/** delivered = accepted by the push service · removed = subscription expired (404/410), deleted · failed = kept, see error. */
export type PushOutcome = "delivered" | "removed" | "failed";
export type PushResult = { id: number; label: string; outcome: PushOutcome; status?: number; error?: string };

export type SubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  origin: string;
  label?: string | null;
  userAgent?: string | null;
};

// ---------------------------------------------------------------------------------------------------------------
// Constants

const TTL_SECONDS = 24 * 60 * 60; // the push service keeps an undelivered alert for a day (must be > 0 for Apple)
const SEND_TIMEOUT_MS = 10_000;
const MAX_PAYLOAD_BYTES = 3000; // Apple/FCM accept 4 KB after encryption; stay well below
const MAX_DEVICES = 50;
const DEFAULT_SUBJECT = "mailto:contact@onde.tn";

// ---------------------------------------------------------------------------------------------------------------
// Text cutting that never breaks a character: a plain .slice() can split an emoji's surrogate pair (shown as "�" on
// the phone) or a flag / skin-tone / family sequence. Cuts happen between grapheme clusters.

const graphemes = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("en", { granularity: "grapheme" }) : null;

/** The longest prefix of `s` that is at most `max` UTF-16 units and ends on a whole character. */
export function sliceText(s: string, max: number): string {
  if (s.length <= max) return s;
  if (max <= 0) return "";
  if (graphemes) {
    let out = "";
    for (const { segment } of graphemes.segment(s)) {
      if (out.length + segment.length > max) break;
      out += segment;
    }
    return out;
  }
  const t = s.slice(0, max);
  return /[\uD800-\uDBFF]$/.test(t) ? t.slice(0, -1) : t;
}

/** `s` shortened to at most `max` UTF-16 units, ending in "…" when it was cut. */
export function cutText(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${sliceText(s, max - 1).trimEnd()}…`;
}

const SAFE_TEXT = (s: string, max: number) =>
  sliceText(
    s
      .replace(/[\u0000-\u001f\u007f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    max,
  );

// ---------------------------------------------------------------------------------------------------------------
// Endpoint allowlist (SSRF guard)

const PUSH_HOST_SUFFIXES = [".push.apple.com", ".push.services.mozilla.com", ".notify.windows.com"];
const PUSH_HOSTS = new Set(["web.push.apple.com", "fcm.googleapis.com", "updates.push.services.mozilla.com"]);

/** Exact origin allowed in addition to the real push services — set only by the end-to-end tests. */
function testEndpointOrigin(): string | null {
  const raw = process.env.PUSH_TEST_ENDPOINT_ORIGIN?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/** A plain DNS name: dot-separated labels of letters, digits and inner hyphens (at least two labels). */
const DNS_NAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
/** The raw text must start "https://<host>[:port]" followed by "/", "?" or the end — no userinfo, "\", "%", ";", "#"… */
const RAW_ENDPOINT = /^https:\/\/([A-Za-z0-9.-]+)(?::(\d{1,5}))?(?=[/?]|$)/;

/**
 * https only, no credentials, default port, and a host of a known browser push service.
 *
 * web-push sends with Node's legacy url.parse(), which reads some hosts differently from WHATWG URL: for
 * "https://evil.com;.push.apple.com/x" WHATWG says "evil.com;.push.apple.com" (passes a suffix check) but url.parse
 * connects to "evil.com". So the raw text itself must be "https://<plain DNS name>[:port]/…" — then every parser sees
 * the same host and port — before the allowlist is consulted. Used when saving AND before every send.
 */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  if (typeof endpoint !== "string") return false;
  const raw = RAW_ENDPOINT.exec(endpoint);
  if (!raw) return false;
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  const h = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || u.username || u.password || h !== raw[1].toLowerCase() || !DNS_NAME.test(h)) return false;
  const test = testEndpointOrigin();
  if (test && u.origin === test) return true;
  if (raw[2] !== undefined && raw[2] !== "443") return false;
  return PUSH_HOSTS.has(h) || PUSH_HOST_SUFFIXES.some((s) => h.endsWith(s) && h.length > s.length);
}

const endpointHost = (endpoint: string) => {
  try {
    return new URL(endpoint).host;
  } catch {
    return "?";
  }
};

export const endpointFingerprint = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex").slice(0, 16);

// ---------------------------------------------------------------------------------------------------------------
// VAPID keys

type Vapid = { publicKey: string; privateKey: string; subject: string };

function b64urlBytes(s: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(s)) return null;
  try {
    return Buffer.from(s.replace(/=+$/, ""), "base64url");
  } catch {
    return null;
  }
}

/** True when `publicKey` is the uncompressed P-256 point of `privateKey` (both base64url). */
function isKeyPair(publicKey: string, privateKey: string): boolean {
  const pub = b64urlBytes(publicKey);
  const priv = b64urlBytes(privateKey);
  if (!pub || !priv || pub.length !== 65 || pub[0] !== 4 || priv.length !== 32) return false;
  try {
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(priv);
    return ecdh.getPublicKey().equals(pub);
  } catch {
    return false;
  }
}

/** VAPID "sub": mailto: or https: on a real public domain, no spaces / angle brackets (Apple rejects localhost). */
export function isValidVapidSubject(s: string | null | undefined): s is string {
  const v = String(s ?? "");
  if (!v || v.length > 200 || /[\s<>]/.test(v)) return false;
  if (v.startsWith("mailto:")) {
    const m = /^mailto:[^@/?#]+@([^@/?#]+)$/.exec(v);
    return Boolean(m && isPublicHostname(m[1]));
  }
  if (v.startsWith("https://")) {
    try {
      return isPublicHostname(new URL(v).hostname);
    } catch {
      return false;
    }
  }
  return false;
}

function envSubject(): string | null {
  const raw = process.env.VAPID_SUBJECT?.trim();
  if (!raw) return null;
  if (isValidVapidSubject(raw)) return raw;
  warnOnce("VAPID_SUBJECT must be a mailto: address or an https: URL on a public domain — using the default.");
  return null;
}

const g = globalThis as unknown as { __ondeVapid?: Vapid };

function loadVapid(): Vapid {
  if (g.__ondeVapid) return g.__ondeVapid;
  const subjectOverride = envSubject();

  const envPub = process.env.VAPID_PUBLIC_KEY?.trim() ?? "";
  const envPriv = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
  if (envPub || envPriv) {
    if (envPub && envPriv && isKeyPair(envPub, envPriv)) {
      g.__ondeVapid = { publicKey: envPub.replace(/=+$/, ""), privateKey: envPriv.replace(/=+$/, ""), subject: subjectOverride ?? DEFAULT_SUBJECT };
      return g.__ondeVapid;
    }
    warnOnce("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are incomplete or do not form a key pair — using the key pair stored in the database.");
  }

  const db = getDb();
  let row = db.select().from(vapidKeys).where(eq(vapidKeys.id, 1)).get();
  if (!row) {
    // Race-safe: two processes may generate at once; INSERT OR IGNORE keeps the first, both read back the same row.
    const fresh = webpush.generateVAPIDKeys();
    const inserted = db
      .insert(vapidKeys)
      .values({ id: 1, publicKey: fresh.publicKey, privateKey: fresh.privateKey, subject: subjectOverride ?? DEFAULT_SUBJECT, createdAt: Date.now() })
      .onConflictDoNothing()
      .run();
    row = db.select().from(vapidKeys).where(eq(vapidKeys.id, 1)).get();
    if (inserted.changes > 0) audit("push.keys_created");
  }
  if (!row) throw new Error("VAPID key pair could not be stored");
  g.__ondeVapid = {
    publicKey: row.publicKey,
    privateKey: row.privateKey,
    subject: subjectOverride ?? (isValidVapidSubject(row.subject) ? row.subject : DEFAULT_SUBJECT),
  };
  return g.__ondeVapid;
}

/** The public application-server key (base64url) browsers subscribe with. Generates + stores the pair on first use. */
export function getVapidPublicKey(): string {
  return loadVapid().publicKey;
}

// ---------------------------------------------------------------------------------------------------------------
// Subscriptions

type Row = typeof pushSubscriptions.$inferSelect;

function toDevice(r: Row): PushDevice {
  return {
    id: r.id,
    label: r.label || "Device",
    origin: r.origin,
    host: endpointHost(r.endpoint),
    fp: endpointFingerprint(r.endpoint),
    createdAt: r.createdAt,
    lastSeenAt: r.lastSeenAt,
    lastSuccessAt: r.lastSuccessAt,
    failures: r.failures,
    lastError: r.lastError,
  };
}

/**
 * Insert or refresh a subscription (keyed by endpoint; refreshes keys, origin, label and last_seen_at).
 * Throws DataError("validation", { endpoint | keys | origin }) for anything that is not a real browser subscription.
 */
export function upsertSubscription(input: SubscriptionInput): { device: PushDevice; created: boolean } {
  const endpoint = String(input.endpoint ?? "").trim();
  if (endpoint.length > 1000 || !isAllowedPushEndpoint(endpoint)) throw new DataError("validation", { endpoint: "invalid_url" });
  const p256dh = String(input.keys?.p256dh ?? "").trim().replace(/=+$/, "");
  const auth = String(input.keys?.auth ?? "").trim().replace(/=+$/, "");
  const pub = b64urlBytes(p256dh);
  const secret = b64urlBytes(auth);
  if (!pub || pub.length !== 65 || pub[0] !== 4 || !secret || secret.length !== 16) throw new DataError("validation", { keys: "invalid" });
  let origin: string;
  try {
    const u = new URL(input.origin);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("scheme");
    origin = u.origin;
  } catch {
    throw new DataError("validation", { origin: "invalid_url" });
  }
  const label = SAFE_TEXT(String(input.label ?? ""), 60) || "Device";
  const userAgent = input.userAgent ? SAFE_TEXT(input.userAgent, 300) : null;

  const db = getDb();
  return db.transaction((tx) => {
    const existing = tx.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).get();
    if (!existing) {
      const n = tx.select({ n: count() }).from(pushSubscriptions).get()?.n ?? 0;
      if (n >= MAX_DEVICES) throw new DataError("validation", { endpoint: "too_many" });
    }
    const now = Date.now();
    const row = tx
      .insert(pushSubscriptions)
      .values({ endpoint, p256dh, auth, origin, label, userAgent, createdAt: now, lastSeenAt: now, failures: 0 })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          p256dh,
          auth,
          origin,
          label,
          userAgent,
          lastSeenAt: now,
          // New browser keys = a fresh subscription: forget errors recorded against the old ones.
          lastError: sql`case when ${pushSubscriptions.p256dh} = ${p256dh} and ${pushSubscriptions.auth} = ${auth} then ${pushSubscriptions.lastError} else null end`,
          failures: sql`case when ${pushSubscriptions.p256dh} = ${p256dh} and ${pushSubscriptions.auth} = ${auth} then ${pushSubscriptions.failures} else 0 end`,
        },
      })
      .returning()
      .get();
    return { device: toDevice(row), created: !existing };
  });
}

/** Delete by id or by endpoint. Returns the removed device (safe view) or null when it did not exist. */
export function removeSubscription(by: { id: number } | { endpoint: string }): PushDevice | null {
  const db = getDb();
  const where = "id" in by ? eq(pushSubscriptions.id, by.id) : eq(pushSubscriptions.endpoint, String(by.endpoint));
  const row = db.delete(pushSubscriptions).where(where).returning().get();
  return row ? toDevice(row) : null;
}

/** Every registered device, newest first (safe view). */
export function listSubscriptions(): PushDevice[] {
  return getDb().select().from(pushSubscriptions).orderBy(desc(pushSubscriptions.createdAt), desc(pushSubscriptions.id)).all().map(toDevice);
}

// ---------------------------------------------------------------------------------------------------------------
// Sending

/** Absolute URL for `path` on `origin`; anything that would leave the origin or the admin falls back to /admin. */
function navigateUrl(origin: string, path: string): string {
  try {
    const u = new URL(path, `${origin}/`);
    if (u.origin === origin && (u.pathname === "/admin" || u.pathname.startsWith("/admin/"))) return u.href;
  } catch {
    /* fall through */
  }
  return `${origin}/admin`;
}

/**
 * Declarative Web Push message (iOS/iPadOS/macOS 18.4+ show it without running JavaScript) that the service worker
 * (public/admin-sw.js) also understands for older iOS and other browsers. `app_badge` is sent both inside
 * `notification` (first WebKit releases) and at the top level (current WebKit / Push API draft).
 */
export function encodePayload(p: PushPayload, origin: string): string {
  const badge = p.badge == null ? null : Math.max(0, Math.min(9999, Math.trunc(p.badge)));
  const make = (body: string) =>
    JSON.stringify({
      web_push: 8030,
      notification: {
        title: p.title,
        body,
        navigate: navigateUrl(origin, p.path),
        lang: "en",
        silent: false,
        ...(badge == null ? {} : { app_badge: badge }),
      },
      ...(badge == null ? {} : { app_badge: badge }),
      data: p.data,
    });
  let body = p.body;
  let json = make(body);
  while (Buffer.byteLength(json) > MAX_PAYLOAD_BYTES && body.length > 20) {
    body = cutText(body, Math.floor(body.length * 0.8));
    json = make(body);
  }
  return json;
}

function describeFailure(err: unknown): { status?: number; error: string } {
  const e = err as { statusCode?: unknown; body?: unknown; message?: unknown; code?: unknown };
  if (typeof e?.statusCode === "number") {
    let reason = "";
    const raw = typeof e.body === "string" ? e.body : "";
    try {
      const j = JSON.parse(raw) as { reason?: unknown; error?: { message?: unknown } | unknown };
      if (typeof j?.reason === "string") reason = j.reason;
      else if (j && typeof j === "object" && "error" in j) {
        const inner = (j as { error?: { message?: unknown } }).error;
        if (inner && typeof inner.message === "string") reason = inner.message;
      }
    } catch {
      reason = raw;
    }
    reason = SAFE_TEXT(reason, 120);
    return { status: e.statusCode, error: SAFE_TEXT(`HTTP ${e.statusCode}${reason ? ` · ${reason}` : ""}`, 200) };
  }
  const msg = typeof e?.message === "string" ? e.message : String(err);
  const code = typeof e?.code === "string" ? `${e.code}: ` : "";
  return { error: SAFE_TEXT(`Network error · ${code}${msg}`, 200) };
}

async function deliver(sub: Row, build: PushBuild, vapid: Vapid): Promise<PushResult> {
  const db = getDb();
  const label = sub.label || "Device";
  const host = endpointHost(sub.endpoint);
  const fail = (error: string, status?: number, countIt = true): PushResult => {
    db.update(pushSubscriptions)
      .set({ lastError: error, ...(countIt ? { failures: sql`${pushSubscriptions.failures} + 1` } : {}) })
      .where(eq(pushSubscriptions.id, sub.id))
      .run();
    return { id: sub.id, label, outcome: "failed", status, error };
  };

  if (!isAllowedPushEndpoint(sub.endpoint)) return fail("Blocked: not a known push service", undefined, false);

  let payload: string;
  try {
    payload = encodePayload(build({ id: sub.id, origin: sub.origin, label: sub.label }), sub.origin);
  } catch (err) {
    console.error("[onde] push payload could not be built", err);
    return fail("Could not build the notification", undefined, false);
  }

  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
      vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
      TTL: TTL_SECONDS,
      urgency: "high",
      timeout: SEND_TIMEOUT_MS,
      contentEncoding: "aes128gcm",
    });
    db.update(pushSubscriptions).set({ lastSuccessAt: Date.now(), failures: 0, lastError: null }).where(eq(pushSubscriptions.id, sub.id)).run();
    return { id: sub.id, label, outcome: "delivered", status: 201 };
  } catch (err) {
    const { status, error } = describeFailure(err);
    if (status === 404 || status === 410) {
      // Gone for good (app deleted, permission removed, subscription expired): forget it.
      db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id)).run();
      console.warn(`[onde] push subscription #${sub.id} (${host}) expired (HTTP ${status}) — removed`);
      return { id: sub.id, label, outcome: "removed", status, error };
    }
    console.warn(`[onde] push to #${sub.id} (${host}) failed: ${error}`);
    // 400/403/413 = our request or VAPID setup is wrong, not the device: keep it, record why, don't count it as flaky.
    return fail(error, status, !(status === 400 || status === 403 || status === 413));
  }
}

async function deliverAll(rows: Row[], build: PushBuild): Promise<PushResult[]> {
  if (!rows.length) return [];
  const vapid = loadVapid();
  const settled = await Promise.allSettled(rows.map((r) => deliver(r, build, vapid)));
  return settled.map((s, i) =>
    s.status === "fulfilled" ? s.value : { id: rows[i].id, label: rows[i].label || "Device", outcome: "failed" as const, error: "Unexpected error" },
  );
}

/** Push to every registered device. Never throws; resolves to one result per device. */
export async function sendToAll(build: PushBuild): Promise<PushResult[]> {
  try {
    return await deliverAll(getDb().select().from(pushSubscriptions).all(), build);
  } catch (err) {
    console.error("[onde] push sendToAll failed", err instanceof Error ? err.message : err);
    return [];
  }
}

/** Push to one device. Never throws; null when the device does not exist. */
export async function sendToOne(id: number, build: PushBuild): Promise<PushResult | null> {
  try {
    const row = getDb().select().from(pushSubscriptions).where(eq(pushSubscriptions.id, id)).get();
    if (!row) return null;
    return (await deliverAll([row], build))[0] ?? null;
  } catch (err) {
    console.error("[onde] push sendToOne failed", err instanceof Error ? err.message : err);
    return null;
  }
}
