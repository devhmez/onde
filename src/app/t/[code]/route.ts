// Smart link: https://onde.tn/t/CODE  →  302 to the tag's current destination (never 301: destinations change).
// `?s=qr` marks a QR scan (default source: nfc). Disabled / unknown / unconfigured links (e.g. stock links not sold
// yet) go to the branded /{locale}/inactive page. Every tap on a known code is logged — redirected or not — so the
// owner sees test taps on fresh chips too. Logging runs after the response is sent and can never block the redirect.
import { after, type NextRequest } from "next/server";
import { DEMO_CODES } from "@/lib/business";
import { getClientIp } from "@/lib/ratelimit";
import { requestLocale } from "@/server/locale";
import { normalizeCode, recordTap, resolveTag } from "@/server/tags";

export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "strict-origin-when-cross-origin",
} as const;

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { ...HEADERS, Location: location } });
}

type Ctx = { params: Promise<{ code: string }> };

async function handle(req: NextRequest, ctx: Ctx, log: boolean): Promise<Response> {
  const { code: raw } = await ctx.params;
  const code = normalizeCode(raw);

  let resolved: Awaited<ReturnType<typeof resolveTag>> = { status: "missing" };
  try {
    resolved = await resolveTag(code);
  } catch (err) {
    console.error("[onde] smart-link lookup failed", err);
  }

  // "Tester" on the client page opens /t/CODE?s=test: same redirect, not counted as a customer tap.
  if (log && resolved.tagId && req.nextUrl.searchParams.get("s") !== "test") {
    const tap = {
      tagId: resolved.tagId,
      source: req.nextUrl.searchParams.get("s") === "qr" ? ("qr" as const) : ("nfc" as const),
      userAgent: req.headers.get("user-agent"),
      referer: req.headers.get("referer"),
      ip: getClientIp(req.headers),
    };
    try {
      after(() => recordTap(tap));
    } catch {
      void recordTap(tap); // outside a request scope (should not happen) — still never blocks
    }
  }

  if (resolved.status === "active" && resolved.url) return redirect(resolved.url);

  const locale = requestLocale(req);
  // A demo code scanned off one of ONDE's videos: show ONDE itself, not the "not activated" page.
  if (resolved.status === "missing" && DEMO_CODES.has(code)) return redirect(`/${locale}`);
  const qs = code ? `?code=${encodeURIComponent(code)}` : "";
  return redirect(`/${locale}/inactive${qs}`);
}

export async function GET(req: NextRequest, ctx: Ctx) {
  return handle(req, ctx, true);
}

export async function HEAD(req: NextRequest, ctx: Ctx) {
  return handle(req, ctx, false);
}
