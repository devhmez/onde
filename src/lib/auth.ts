import "server-only";
// Super-admin auth: one owner account from env (ADMIN_EMAIL + bcrypt ADMIN_PASSWORD_HASH), stateless session as a
// jose HS256 JWT in the httpOnly cookie `onde_admin` (7 days). Tokens are bound to the current password hash, so
// changing ADMIN_PASSWORD_HASH logs every session out; rotating SESSION_SECRET does too.
// Token primitives live in src/server/session.ts (also used by src/proxy.ts).
import { timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  adminApiGuard,
  adminPasswordHash,
  isAdminRequest,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  signSessionToken,
  verifySessionToken,
  warnOnce,
} from "../server/session";

export { adminApiGuard, isAdminRequest, SESSION_COOKIE, SESSION_MAX_AGE, verifySessionToken };

// bcrypt hash of a random string: compared against when the email is wrong / no hash is configured, so the response
// time does not reveal which part of the credentials was wrong.
const DUMMY_HASH = "$2b$12$OM3KGdL8AoeYozjLV/Tgd.vHQDqfiDp8Ow8co6FrYsmXu1XVP0yEW";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Cookie `secure` flag: on in production; COOKIE_SECURE=false allows plain-HTTP access (e.g. by IP before TLS). */
function cookieSecure(): boolean {
  const v = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (v === "false" || v === "0") return false;
  if (v === "true" || v === "1") return true;
  return process.env.NODE_ENV === "production";
}

export async function verifyAdminCredentials(email: string, password: string): Promise<boolean> {
  const expectedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const hash = adminPasswordHash();
  if (!expectedEmail || !hash) warnOnce("ADMIN_EMAIL / ADMIN_PASSWORD_HASH not configured (or invalid) — admin login is disabled.");
  const emailOk = Boolean(expectedEmail) && safeEqual(String(email ?? "").trim().toLowerCase(), expectedEmail);
  const pw = String(password ?? "").slice(0, 1024);
  const pwOk = await bcrypt.compare(pw, emailOk && hash ? hash : DUMMY_HASH);
  return Boolean(emailOk && hash && pwOk);
}

/** Sign a new session and set the `onde_admin` cookie (Route Handlers / Server Actions only). Returns the token. */
export async function createSession(): Promise<string> {
  const token = await signSessionToken();
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return token;
}

export async function getSession(): Promise<{ admin: true } | null> {
  const store = await cookies();
  return (await verifySessionToken(store.get(SESSION_COOKIE)?.value)) ? { admin: true } : null;
}

/** Guard for admin pages and Server Actions: redirects to /admin/login when there is no valid session. */
export async function requireAdmin(): Promise<void> {
  if (!(await getSession())) redirect("/admin/login");
}

/** Clear the session cookie (Route Handlers / Server Actions only). */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { httpOnly: true, secure: cookieSecure(), sameSite: "lax", path: "/", maxAge: 0 });
}
