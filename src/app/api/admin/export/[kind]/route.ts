// GET /api/admin/export/orders|customers|tags[?sep=semicolon] → CSV download (UTF-8 with BOM for Excel).
// `sep=semicolon` produces ";"-separated values with decimal commas (Excel with French regional settings).
import type { NextRequest } from "next/server";
import { adminApiGuard } from "@/server/session";
import { audit } from "@/server/audit";
import { buildExportCsv, isExportKind } from "@/server/export";
import { errorResponse, json } from "@/server/http";
import { dayKey } from "@/server/util";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ kind: string }> }) {
  const denied = await adminApiGuard(req);
  if (denied) return denied;
  try {
    const { kind: raw } = await ctx.params;
    const kind = raw.replace(/\.csv$/i, "").toLowerCase();
    if (!isExportKind(kind)) return json({ error: "not_found" }, 404);
    const sepParam = req.nextUrl.searchParams.get("sep");
    const separator = sepParam === "semicolon" || sepParam === ";" ? ";" : ",";
    const csv = buildExportCsv(kind, { separator });
    audit("export.csv", { kind });
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="onde-${kind}-${dayKey(Date.now())}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return errorResponse(err, "GET /api/admin/export/[kind]");
  }
}
