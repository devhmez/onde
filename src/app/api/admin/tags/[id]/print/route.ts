// GET /api/admin/tags/[id]/print?format=png|pdf[&bleed=1] → the review-stand print file of one smart link
// (owner's 12 × 12 cm design with this link's QR — see src/server/qr-print.ts). `bleed=1` (PDF only) adds 3 mm.
// The design follows the stand colour in the label ("Review stand (black)"); a black stand is refused with
// 400 no_black_design until the black design is installed — never printed on the white one.
import type { NextRequest } from "next/server";
import { standVariant } from "@/lib/business";
import { audit } from "@/server/audit";
import { errorResponse, json } from "@/server/http";
import { printDesignAvailable, renderStandPdf, renderStandPng } from "@/server/qr-print";
import { adminApiGuard } from "@/server/session";
import { getTag } from "@/server/tags";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await adminApiGuard(req);
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const tag = /^\d+$/.test(id) ? await getTag(Number(id)) : await getTag(id);
    if (!tag) return json({ error: "not_found" }, 404);
    const variant = standVariant(tag);
    if (!variant) return json({ error: "not_a_stand" }, 400);
    if (!printDesignAvailable(variant)) return json({ error: "no_black_design", codes: [tag.code] }, 400);

    const sp = req.nextUrl.searchParams;
    const format = sp.get("format") === "pdf" ? "pdf" : "png";
    const bleed = format === "pdf" && sp.get("bleed") === "1";
    const body = format === "pdf" ? await renderStandPdf(tag.code, { bleed, variant }) : await renderStandPng(tag.code, variant);
    const name = `ONDE-${tag.code}${bleed ? "-bleed3mm" : ""}.${format}`;
    // Also the record of what was printed (server/print-log). Inline previews (download=0) are not prints.
    if (sp.get("download") !== "0") audit("print.file", { code: tag.code, format, bleed, variant });
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": format === "pdf" ? "application/pdf" : "image/png",
        "Content-Disposition": `${sp.get("download") === "0" ? "inline" : "attachment"}; filename="${name}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return errorResponse(err, "GET /api/admin/tags/[id]/print");
  }
}
