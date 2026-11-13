// POST /api/admin/login {email, password} → 200 { ok: true } + `onde_admin` cookie | 401 { error: "invalid_credentials" }
// Rate-limited 5/min/IP. Also accepts a classic HTML form post (fields email, password, next): it then answers with a
// 303 redirect to `next` (an /admin path) or back to /admin/login?error=1.
import { createSession, verifyAdminCredentials } from "@/lib/auth";
import { limitRequest, tooManyRequests } from "@/lib/ratelimit";
import { audit } from "@/server/audit";
import { errorResponse, isFormPost, isRecord, json, readBody } from "@/server/http";

export const dynamic = "force-dynamic";

function safeNext(v: unknown): string {
  const s = typeof v === "string" ? v : "";
  return /^\/admin(?:[/?#]|$)/.test(s) && !s.startsWith("//") && !s.includes("\\") ? s : "/admin";
}

/** 303 to a same-origin path (relative Location, so it works behind the reverse proxy whatever the Host). */
function seeOther(_req: Request, path: string): Response {
  return new Response(null, { status: 303, headers: { Location: path, "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const form = isFormPost(req);
  const rl = limitRequest(req, "admin-login", 5);
  if (!rl.ok) return form ? seeOther(req, "/admin/login?error=rate_limited") : tooManyRequests(rl);
  try {
    const body = await readBody(req, 8 * 1024);
    const email = isRecord(body) && typeof body.email === "string" ? body.email : "";
    const password = isRecord(body) && typeof body.password === "string" ? body.password : "";
    const ok = email !== "" && password !== "" && (await verifyAdminCredentials(email, password));
    if (!ok) {
      audit("admin.login_failed", { email: email.slice(0, 120) });
      return form ? seeOther(req, "/admin/login?error=1") : json({ error: "invalid_credentials" }, 401);
    }
    await createSession();
    audit("admin.login");
    return form ? seeOther(req, safeNext(isRecord(body) ? body.next : undefined)) : json({ ok: true });
  } catch (err) {
    return errorResponse(err, "POST /api/admin/login");
  }
}
