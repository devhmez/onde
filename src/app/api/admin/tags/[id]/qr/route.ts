// GET /api/admin/tags/[id]/qr?format=svg|png&size=1024&download=1&dark=%23000000&light=%23ffffff
// QR code of the tag's permanent smart link, marked as a QR scan: https://onde.tn/t/CODE?s=qr
// A download (download=1) is a printable copy of that code: it is logged like the print files ("print.file"), so the
// stock view never offers it again as "not printed yet". Inline thumbnails (no download) are not logged.
import type { NextRequest } from "next/server";
import { audit } from "@/server/audit";
import { adminApiGuard } from "@/server/session";
import { errorResponse, json } from "@/server/http";
import { qrPng, qrSvg } from "@/server/qr";
import { getTag, smartLinkQr } from "@/server/tags";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await adminApiGuard(req);
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const tag = /^\d+$/.test(id) ? await getTag(Number(id)) : await getTag(id);
    if (!tag) return json({ error: "not_found" }, 404);

    const sp = req.nextUrl.searchParams;
    const format = sp.get("format") === "png" ? "png" : "svg";
    const text = smartLinkQr(tag.code);
    const disposition = `${sp.get("download") ? "attachment" : "inline"}; filename="onde-${tag.code}.${format}"`;
    const headers = { "Cache-Control": "private, no-store", "Content-Disposition": disposition, "X-Content-Type-Options": "nosniff" };
    if (sp.get("download")) audit("print.file", { code: tag.code, format: `qr-${format}` });

    if (format === "png") {
      const png = await qrPng(text, Number(sp.get("size") ?? 1024));
      return new Response(new Uint8Array(png), { headers: { ...headers, "Content-Type": "image/png" } });
    }
    const svg = await qrSvg(text, {
      dark: sp.get("dark") ?? undefined,
      light: sp.get("light") ?? undefined,
      margin: sp.has("margin") ? Number(sp.get("margin")) : undefined,
    });
    return new Response(svg, { headers: { ...headers, "Content-Type": "image/svg+xml; charset=utf-8" } });
  } catch (err) {
    return errorResponse(err, "GET /api/admin/tags/[id]/qr");
  }
}
