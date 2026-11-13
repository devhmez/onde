import "server-only";
// CSV exports for the admin (orders, customers, tags). RFC 4180 quoting, UTF-8 BOM so Excel shows accents correctly,
// spreadsheet-formula injection neutralized for text cells, money in dinars with 3 decimals.
import { asc, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../db";
import { customers, orderItems, orders, tags, taps } from "../db/schema";
import { customerAggregates } from "./customers";
import { printedCodes } from "./print-log";
import { productLabel } from "./stands";
import { isStockTag, smartLink } from "./tags";
import { DAY_MS, TZ_OFFSET_MS } from "./util";

export const EXPORT_KINDS = ["orders", "customers", "tags", "register"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];
export const isExportKind = (v: string): v is ExportKind => (EXPORT_KINDS as readonly string[]).includes(v);

export type Cell = string | number | boolean | null | undefined;
type Options = { separator: "," | ";" };

const localTime = (ts: number | null | undefined) => (ts ? new Date(ts + TZ_OFFSET_MS).toISOString().replace("T", " ").slice(0, 16) : "");

function cell(value: Cell, sep: string): string {
  if (value == null) return "";
  if (typeof value === "number") {
    const s = String(value);
    return sep === ";" ? s.replace(".", ",") : s;
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  let s = value;
  // Excel/Sheets would evaluate cells starting with = + - @ (or tab/CR) as formulas — prefix with an apostrophe.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (s.includes('"') || s.includes(sep) || /[\r\n]/.test(s) || /^\s|\s$/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Millimes → dinars with 3 decimals (as a number cell). */
const dt = (millimes: number) => Math.round(millimes) / 1000;

function toCsv(header: string[], rows: Cell[][], opts: Options): string {
  const sep = opts.separator;
  const lines = [header.map((h) => cell(h, sep)).join(sep), ...rows.map((r) => r.map((c) => cell(c, sep)).join(sep))];
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** CSV text (BOM, RFC 4180, formula-safe) for ad-hoc exports such as the print chip sheet. */
export function csvText(header: string[], rows: Cell[][], separator: "," | ";" = ","): string {
  return toCsv(header, rows, { separator });
}

function ordersCsv(opts: Options): string {
  const db = getDb();
  const rows = db.select().from(orders).orderBy(desc(orders.createdAt), desc(orders.id)).all();
  const items = db.select().from(orderItems).orderBy(asc(orderItems.id)).all();
  const byOrder = new Map<number, typeof items>();
  for (const it of items) {
    const list = byOrder.get(it.orderId) ?? [];
    list.push(it);
    byOrder.set(it.orderId, list);
  }
  return toCsv(
    [
      "number", "created_at", "status", "channel", "locale", "name", "phone", "email", "governorate", "city", "address",
      "notes", "items", "units", "business_names", "destinations", "subtotal_dt", "discount_dt", "discount_reason",
      "delivery_dt", "total_dt", "payment",
    ],
    rows.map((o) => {
      const its = byOrder.get(o.id) ?? [];
      return [
        o.number, localTime(o.createdAt), o.status, o.channel, o.locale, o.name, o.phone, o.email, o.governorate, o.city,
        o.address, o.notes,
        its.map((i) => `${i.qty}× ${i.productName}`).join("; "),
        its.reduce((n, i) => n + i.qty, 0),
        [...new Set(its.map((i) => i.businessName).filter(Boolean))].join("; "),
        [...new Set(its.map((i) => i.destinationUrl).filter(Boolean))].join("; "),
        dt(o.subtotal), dt(o.discount), o.discountReason, dt(o.deliveryFee), dt(o.total), o.paymentMethod,
      ];
    }),
    opts,
  );
}

function customersCsv(opts: Options): string {
  const db = getDb();
  const { orderCount, totalSpent, tagCount } = customerAggregates();
  const rows = db.select({ c: customers, orderCount, totalSpent, tagCount }).from(customers).orderBy(desc(customers.createdAt)).all();
  return toCsv(
    ["id", "name", "business", "phone", "email", "governorate", "city", "address", "discount_available", "orders", "total_spent_dt", "tags", "created_at", "notes"],
    rows.map(({ c, orderCount: n, totalSpent: spent, tagCount: t }) => [
      c.id, c.name, c.businessName, c.phone, c.email, c.governorate, c.city, c.address, c.discountAvailable,
      Number(n) || 0, dt(Number(spent) || 0), Number(t) || 0, localTime(c.createdAt), c.notes,
    ]),
    opts,
  );
}

function tagsCsv(opts: Options): string {
  const db = getDb();
  const d30 = Date.now() - 30 * DAY_MS;
  const recent = db
    .select({ tagId: taps.tagId, n: sql<number>`count(*)` })
    .from(taps)
    .where(gte(taps.ts, d30))
    .groupBy(taps.tagId)
    .all();
  const taps30 = new Map(recent.map((r) => [r.tagId, Number(r.n)]));
  const rows = db
    .select({ t: tags, customerName: customers.name, business: customers.businessName, phone: customers.phone, orderNumber: orders.number })
    .from(tags)
    .leftJoin(customers, eq(tags.customerId, customers.id))
    .leftJoin(orders, eq(tags.orderId, orders.id))
    .orderBy(desc(tags.createdAt), desc(tags.id))
    .all();
  return toCsv(
    [
      "code", "smart_link", "label", "kind", "status", "chip_status", "customer", "business", "phone", "order", "destination_type",
      "destination_url", "taps_total", "taps_30d", "last_tap_at", "created_at", "notes",
    ],
    rows.map(({ t, customerName, business, phone, orderNumber }) => [
      t.code, smartLink(t.code), t.label, t.kind, t.status, CHIP_LABEL[t.chipStatus], customerName, business, phone, orderNumber, t.destinationType,
      t.destinationUrl, t.tapCount, taps30.get(t.id) ?? 0, localTime(t.lastTapAt), localTime(t.createdAt), t.notes,
    ]),
    opts,
  );
}

const CHIP_LABEL = { none: "not written", written: "written", tested: "tested", locked: "locked" } as const;

/**
 * Stand register: one row per physical product (smart link) — which code is on which stand, who has it, where it
 * points, chip state, taps and when its print went out (print log). Stock first-class: status "stock" = not sold yet.
 */
function registerCsv(opts: Options): string {
  const db = getDb();
  const d30 = Date.now() - 30 * DAY_MS;
  const recent = db
    .select({ tagId: taps.tagId, n: sql<number>`count(*)` })
    .from(taps)
    .where(gte(taps.ts, d30))
    .groupBy(taps.tagId)
    .all();
  const taps30 = new Map(recent.map((r) => [r.tagId, Number(r.n)]));
  const printed = printedCodes();
  const rows = db
    .select({ t: tags, customerName: customers.name, business: customers.businessName, phone: customers.phone, orderNumber: orders.number })
    .from(tags)
    .leftJoin(customers, eq(tags.customerId, customers.id))
    .leftJoin(orders, eq(tags.orderId, orders.id))
    .orderBy(asc(tags.code))
    .all();
  return toCsv(
    [
      "code", "product", "status", "chip_status", "client", "business", "phone", "destination", "taps_30d", "taps_total",
      "created_at", "printed_at", "smart_link", "destination_type", "order", "last_tap_at", "chip_updated_at", "label", "notes",
    ],
    rows.map(({ t, customerName, business, phone, orderNumber }) => [
      t.code,
      productLabel(t),
      isStockTag(t) ? (t.status === "active" ? "stock" : "stock (disabled)") : t.status !== "active" ? "disabled" : t.destinationUrl ? "live" : "no link yet",
      CHIP_LABEL[t.chipStatus],
      customerName,
      business,
      phone,
      t.destinationUrl,
      taps30.get(t.id) ?? 0,
      t.tapCount,
      localTime(t.createdAt),
      localTime(printed.get(t.code)),
      smartLink(t.code),
      t.destinationUrl ? t.destinationType : "",
      orderNumber,
      localTime(t.lastTapAt),
      localTime(t.chipAt),
      t.label,
      t.notes,
    ]),
    opts,
  );
}

/** Build the CSV text (BOM included) for an export kind. */
export function buildExportCsv(kind: ExportKind, opts: Partial<Options> = {}): string {
  const o: Options = { separator: opts.separator === ";" ? ";" : "," };
  if (kind === "orders") return ordersCsv(o);
  if (kind === "customers") return customersCsv(o);
  if (kind === "register") return registerCsv(o);
  return tagsCsv(o);
}
