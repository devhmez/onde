// Admin session token primitives (pure: env + jose + node:crypto, no next/* imports) so src/proxy.ts can verify
// sessions without pulling request-scoped APIs into the proxy bundle. Cookie handling lives in src/lib/auth.ts.
// Deliberately no `import "server-only"`: this module is part of the proxy bundle; it never touches the DB and
// node:crypto keeps it out of any client bundle anyway.
import { createHash } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "onde_admin";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // seconds
const ISSUER = "onde";
const AUDIENCE = "onde-admin";
const DEV_SECRET = "onde-development-only-secret-do-not-use-in-production";
const BCRYPT_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

const warned = new Set<string>();
export function warnOnce(msg: string) {
  if (!warned.has(msg)) {
    warned.add(msg);
    console.warn(`[onde] ${msg}`);
  }
}

/** HS256 key from SESSION_SECRET (≥32 chars). Production without it → null (admin disabled, fail closed). */
export function sessionKey(): Uint8Array | null {
  const secret = process.env.SESSION_SECRET ?? "";
  if (secret.length >= 32) return new TextEncoder().encode(secret);
  if (process.env.NODE_ENV === "production") {
    warnOnce("SESSION_SECRET is missing or shorter than 32 characters — admin login is disabled.");
    return null;
  }
  warnOnce("SESSION_SECRET not set (≥32 chars) — using an insecure development secret.");
  return new TextEncoder().encode(DEV_SECRET);
}

/** ADMIN_PASSWORD_HASH as a bcrypt string. Accepts the raw hash or "base64:<base64 of the hash>" (Docker-safe, no `$`). */
export function adminPasswordHash(): string | null {
  let raw = process.env.ADMIN_PASSWORD_HASH?.trim() ?? "";
  if (raw.startsWith("base64:")) {
    try {
      raw = Buffer.from(raw.slice(7), "base64").toString("utf8").trim();
    } catch {
      return null;
    }
  }
  return BCRYPT_RE.test(raw) ? raw : null;
}

/** Short fingerprint of the configured password hash, embedded in tokens: changing the password logs everyone out. */
export function passwordVersion(): string {
  return createHash("sha256").update(adminPasswordHash() ?? "none").digest("hex").slice(0, 16);
}

export async function signSessionToken(): Promise<string> {
  const key = sessionKey();
  if (!key) throw new Error("SESSION_SECRET must be set (≥32 characters) to sign admin sessions");
  return new SignJWT({ admin: true, pv: passwordVersion() })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject("admin")
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(key);
}

/** Verify a session token. Never throws. */
export async function verifySessionToken(token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  const key = sessionKey();
  if (!key) return false;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"], issuer: ISSUER, audience: AUDIENCE });
    return payload.admin === true && payload.pv === passwordVersion();
  } catch {
    return false;
  }
}

/** Read + verify the session from a raw Request (Route Handlers). */
export async function isAdminRequest(req: Request): Promise<boolean> {
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return verifySessionToken(m?.[1]);
}

/** Defense in depth for /api/admin/** handlers (the proxy already gates them): a 401 Response, or null when authorized. */
export async function adminApiGuard(req: Request): Promise<Response | null> {
  if (await isAdminRequest(req)) return null;
  return Response.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
}
