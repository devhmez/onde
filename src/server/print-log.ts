import "server-only";
// Which smart links already went out in print files. Every print download is written to the audit log ("print.zip"
// with the codes of the pack, "print.file" for one stand file or one QR image download, "print.sheet" for the A4 QR
// sheet printed from the QR codes page), so that log is the record: no extra column needed.
// A code printed twice means two stands with the same link (customer B's taps would open customer A's page), so the
// Stock view offers "not printed yet" by default and warns before re-printing.
import { and, count, eq, inArray, type SQL } from "drizzle-orm";
import { getDb } from "../db";
import { auditLog, tags } from "../db/schema";
import { standVariant } from "../lib/business";
import { printDesignAvailable } from "./qr-print";
import { stockCondition } from "./tags";
import type { TagKind } from "./types";

export const PRINT_ACTIONS = ["print.zip", "print.file", "print.sheet"] as const;

/** code → time of its last print download. */
export function printedCodes(): Map<string, number> {
  const rows = getDb()
    .select({ ts: auditLog.ts, details: auditLog.details })
    .from(auditLog)
    .where(inArray(auditLog.action, [...PRINT_ACTIONS]))
    .all();
  const out = new Map<string, number>();
  for (const r of rows) {
    let d: { codes?: unknown; code?: unknown } | null = null;
    try {
      d = r.details ? (JSON.parse(r.details) as { codes?: unknown; code?: unknown }) : null;
    } catch {
      continue;
    }
    const codes = Array.isArray(d?.codes) ? d.codes : typeof d?.code === "string" ? [d.code] : [];
    for (const c of codes) if (typeof c === "string" && (out.get(c) ?? 0) < r.ts) out.set(c, r.ts);
  }
  return out;
}

export type StockPrintSummary = {
  /** Stock links (no customer, no destination), for the kind filter. */
  total: number;
  /** Never downloaded in print files, and printable now — what "not printed yet" exports. */
  unprinted: number;
  /** Already in an earlier print download. */
  printed: number;
  /** Stands whose print design is not installed yet (black). */
  missingDesign: number;
};

export function stockPrintSummary(kind?: TagKind): StockPrintSummary {
  const conds: SQL[] = [stockCondition()];
  if (kind) conds.push(eq(tags.kind, kind));
  const db = getDb();
  const total = db.select({ n: count() }).from(tags).where(and(...conds)).get()?.n ?? 0;
  if (!total) return { total: 0, unprinted: 0, printed: 0, missingDesign: 0 };
  const rows = db.select({ code: tags.code, kind: tags.kind, label: tags.label }).from(tags).where(and(...conds)).all();
  const done = printedCodes();
  const missing = new Map<string, boolean>();
  const designMissing = (t: { kind: string; label: string }) => {
    const v = standVariant(t);
    if (!v) return false;
    if (!missing.has(v)) missing.set(v, !printDesignAvailable(v));
    return missing.get(v)!;
  };
  let unprinted = 0;
  let printed = 0;
  let missingDesign = 0;
  for (const r of rows) {
    if (done.has(r.code)) printed++;
    else if (designMissing(r)) missingDesign++;
    else unprinted++;
  }
  return { total, unprinted, printed, missingDesign };
}
