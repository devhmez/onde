// POST /api/admin/logout → 200 { ok: true } and clears the session cookie (form posts get a 303 to /admin/login).
import { destroySession } from "@/lib/auth";
import { errorResponse, isFormPost, json } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await destroySession();
    if (isFormPost(req)) return new Response(null, { status: 303, headers: { Location: "/admin/login", "Cache-Control": "no-store" } });
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err, "POST /api/admin/logout");
  }
}
