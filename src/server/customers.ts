import "server-only";
import { and, count, desc, eq, ne, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "../db";
import { customers, orders, tags } from "../db/schema";
import { GOVERNORATES, normalizePhone } from "../lib/business";
import { audit } from "./audit";
import { DataError, NotFoundError } from "./errors";
import { readSettings } from "./settings";
import type { Customer, FieldErrors, Order, Tag } from "./types";
import { clampInt, contains, optText } from "./util";

/**
 * Correlated aggregates for a query whose FROM is `customers` (fully qualified: drizzle drops table prefixes on
 * single-table selects, which would make the correlation ambiguous).
 */
export function customerAggregates() {
  return {
    orderCount: sql<number>`(select count(*) from "orders" o where o."customer_id" = "customers"."id" and o."status" != 'cancelled')`,
    totalSpent: sql<number>`(select coalesce(sum(o."total"), 0) from "orders" o where o."customer_id" = "customers"."id" and o."status" != 'cancelled')`,
    tagCount: sql<number>`(select count(*) from "tags" t where t."customer_id" = "customers"."id")`,
  };
}

/** "gj-uh pr" → customers owning a smart link whose code contains GJUHPR (null when the input can't be a code). */
function codeTerm(q: string): SQL | undefined {
  const code = q.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length < 4 || code.length > 8 || /^\d+$/.test(code)) return undefined;
  return sql`exists (select 1 from "tags" ct where ct."customer_id" = "customers"."id" and ct."code" like ${`%${code}%`})`;
}

/**
 * Customers with aggregates. `orderCount` and `totalSpent` (millimes) only count non-cancelled orders;
 * `tagCount` = smart links attached to the customer.
 */
export async function listCustomers(f: { q?: string; limit?: number; offset?: number } = {}): Promise<{
  rows: (Customer & { orderCount: number; totalSpent: number; tagCount: number })[];
  total: number;
}> {
  const db = getDb();
  const conds: SQL[] = [];
  const q = f.q?.trim();
  if (q) {
    const digits = q.replace(/\D/g, "");
    const term = or(
      contains(customers.name, q),
      contains(customers.businessName, q),
      contains(customers.city, q),
      contains(customers.governorate, q),
      contains(customers.email, q),
      digits.length >= 3 ? contains(customers.phone, digits) : undefined,
      // the code printed under a stand's QR (case / spaces / dashes ignored)
      codeTerm(q),
    );
    if (term) conds.push(term);
  }
  const where = conds.length ? and(...conds) : undefined;
  const limit = clampInt(f.limit, 1, 1000, 50);
  const offset = clampInt(f.offset, 0, 1_000_000, 0);

  const { orderCount, totalSpent, tagCount } = customerAggregates();
  const rows = db
    .select({ customer: customers, orderCount, totalSpent, tagCount })
    .from(customers)
    .where(where)
    .orderBy(desc(customers.createdAt), desc(customers.id))
    .limit(limit)
    .offset(offset)
    .all();
  const total = db.select({ n: count() }).from(customers).where(where).get()?.n ?? 0;
  return {
    rows: rows.map((r) => ({
      ...r.customer,
      orderCount: Number(r.orderCount) || 0,
      totalSpent: Number(r.totalSpent) || 0,
      tagCount: Number(r.tagCount) || 0,
    })),
    total,
  };
}

export async function getCustomer(id: number): Promise<{ customer: Customer; orders: Order[]; tags: Tag[]; totalSpent: number } | null> {
  const db = getDb();
  const customer = db.select().from(customers).where(eq(customers.id, id)).get();
  if (!customer) return null;
  const orderRows = db.select().from(orders).where(eq(orders.customerId, id)).orderBy(desc(orders.createdAt), desc(orders.id)).all();
  const tagRows = db.select().from(tags).where(eq(tags.customerId, id)).orderBy(desc(tags.createdAt), desc(tags.id)).all();
  const totalSpent = orderRows.filter((o) => o.status !== "cancelled").reduce((s, o) => s + o.total, 0);
  return { customer, orders: orderRows, tags: tagRows, totalSpent };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Admin edit of a customer. Phone is re-normalized and must stay unique (`phone: "taken"`). */
export async function updateCustomer(id: number, patch: Partial<Customer>): Promise<Customer> {
  const db = getDb();
  const current = db.select().from(customers).where(eq(customers.id, id)).get();
  if (!current) throw new NotFoundError("customer");

  const fields: FieldErrors = {};
  const set: Partial<typeof customers.$inferInsert> = {};

  if (patch.name !== undefined) {
    const name = optText(patch.name, 120);
    if (!name) fields.name = "required";
    else set.name = name;
  }
  if (patch.phone !== undefined) {
    const phone = normalizePhone(String(patch.phone ?? ""));
    if (!phone) fields.phone = "invalid_phone";
    else if (phone !== current.phone && db.select({ id: customers.id }).from(customers).where(and(eq(customers.phone, phone), ne(customers.id, id))).get())
      fields.phone = "taken";
    else set.phone = phone;
  }
  if (patch.email !== undefined) {
    const email = optText(patch.email, 200);
    if (email && !EMAIL_RE.test(email)) fields.email = "invalid_email";
    else set.email = email ? email.toLowerCase() : null;
  }
  if (patch.governorate !== undefined) {
    const g = optText(patch.governorate, 60);
    if (g && !(GOVERNORATES as readonly string[]).includes(g)) fields.governorate = "invalid_governorate";
    else set.governorate = g;
  }
  if (patch.businessName !== undefined) set.businessName = optText(patch.businessName, 120);
  if (patch.city !== undefined) set.city = optText(patch.city, 80);
  if (patch.address !== undefined) set.address = optText(patch.address, 300);
  if (patch.notes !== undefined) set.notes = optText(patch.notes, 2000);
  if (patch.discountAvailable !== undefined) set.discountAvailable = Boolean(patch.discountAvailable);

  if (Object.keys(fields).length) throw new DataError("validation", fields);
  if (!Object.keys(set).length) return current;

  const row = db.update(customers).set(set).where(eq(customers.id, id)).returning().get();
  audit("customer.update", { id, fields: Object.keys(set) });
  return row;
}

/** Returning-customer check for the checkout ("Bon retour ! −10 %"). Invalid / unknown phones are simply not eligible. */
export async function checkDiscount(phone: string): Promise<{ eligible: boolean; pct: number }> {
  const s = readSettings();
  const pct = s.returningDiscountPct;
  const normalized = normalizePhone(phone);
  if (!normalized || pct <= 0) return { eligible: false, pct };
  const row = getDb()
    .select({ discountAvailable: customers.discountAvailable })
    .from(customers)
    .where(eq(customers.phone, normalized))
    .get();
  return { eligible: Boolean(row?.discountAvailable), pct };
}
