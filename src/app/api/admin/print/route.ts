// GET /api/admin/print?ids=12,13,14[&bleed=1]                     → ZIP print pack for these smart links
// GET /api/admin/print?stock=1[&unprinted=1][&kind=stand][&bleed=1] → ZIP print pack for the stock links (no customer,
//     no destination); `unprinted=1` keeps only the ones never downloaded in print files before (see server/print-log)
// Pack contents: see src/server/export-print.ts (stand PNG + PDF per link, chip-sheet.pdf/.csv, README.txt).
// Stands whose print design is missing (black, until the owner supplies it) are never printed on the white design:
// a selection containing one is refused (400 no_black_design); the stock packs leave them out and list them.
import type { NextRequest } from "next/server";
import { audit } from "@/server/audit";
import { assertPrintReady, MAX_PRINT_LINKS, printZipName, printZipStream, splitPrintable } from "@/server/export-print";
import { errorResponse, json } from "@/server/http";
import { printedCodes } from "@/server/print-log";
import { adminApiGuard } from "@/server/session";
import { listTags, listTagsByIds } from "@/server/tags";
import { TAG_KINDS, type TagKind } from "@/server/types";

export const dynamic = "force-dynamic";

type PrintRow = Awaited<ReturnType<typeof listTagsByIds>>[number];

export async function GET(req: NextRequest) {
  const denied = await adminApiGuard(req);
  if (denied) return denied;
  try {
    const sp = req.nextUrl.searchParams;
    const kindParam = sp.get("kind") ?? "";
    const kind = (TAG_KINDS as readonly string[]).includes(kindParam) ? (kindParam as TagKind) : undefined;
    let rows: PrintRow[];
    let skipped: PrintRow[] = [];
    if (sp.get("stock") === "1") {
      const res = await listTags({ stock: true, kind, limit: 1000 });
      let stock = res.rows;
      if (sp.get("unprinted") === "1") {
        const done = printedCodes();
        stock = stock.filter((t) => !done.has(t.code));
      }
      const { printable, missing } = splitPrintable(stock);
      rows = printable.sort((a, b) => a.code.localeCompare(b.code));
      skipped = missing.sort((a, b) => a.code.localeCompare(b.code));
      if (!rows.length && skipped.length) return json({ error: "no_black_design", codes: skipped.map((t) => t.code) }, 400);
    } else {
      const ids = (sp.get("ids") ?? "")
        .split(",")
        .map((v) => Number.parseInt(v.trim(), 10))
        .filter((n) => Number.isInteger(n) && n > 0);
      if (ids.length > MAX_PRINT_LINKS) return json({ error: "too_many", max: MAX_PRINT_LINKS }, 400);
      rows = await listTagsByIds(ids);
      const { missing } = splitPrintable(rows);
      if (missing.length) return json({ error: "no_black_design", codes: missing.map((t) => t.code) }, 400);
    }
    if (!rows.length) return json({ error: "empty" }, 400);
    if (rows.length > MAX_PRINT_LINKS) return json({ error: "too_many", max: MAX_PRINT_LINKS }, 400);

    await assertPrintReady(rows);
    const bleed = sp.get("bleed") === "1";
    // This entry is also the record of what was printed (server/print-log reads its codes).
    audit("print.zip", { count: rows.length, bleed, codes: rows.map((r) => r.code), ...(skipped.length ? { skipped: skipped.map((r) => r.code) } : {}) });
    return new Response(printZipStream(rows, { bleed, skipped }), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${printZipName(rows.length)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return errorResponse(err, "GET /api/admin/print");
  }
}
