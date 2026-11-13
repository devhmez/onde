// POST /api/track { path, locale, referrer } → 204. Cookie-less page views (no PII; works with navigator.sendBeacon).
import { after } from "next/server";
import { getClientIp, limitRequest } from "@/lib/ratelimit";
import { recordPageView } from "@/server/analytics";
import { isRecord, readBody } from "@/server/http";

export const dynamic = "force-dynamic";

const noContent = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  // Silently drop floods — analytics must never error for the visitor.
  if (!limitRequest(req, "track", 120).ok) return noContent();
  try {
    const body = await readBody(req, 4 * 1024);
    if (!isRecord(body) || typeof body.path !== "string") return noContent();
    const view = {
      path: body.path,
      locale: typeof body.locale === "string" ? body.locale : undefined,
      referrer: typeof body.referrer === "string" ? body.referrer : null,
      userAgent: req.headers.get("user-agent"),
      ip: getClientIp(req.headers),
      host: req.headers.get("x-forwarded-host") ?? req.headers.get("host"),
    };
    after(() => recordPageView(view));
  } catch {
    /* malformed beacon — ignore */
  }
  return noContent();
}
