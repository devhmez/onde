import "server-only";
// Retention periods promised in the privacy policy (messages/<locale>/legal.json → privacy › conservation):
// - website page views: 25 months at most (taps already go with their smart link: ON DELETE CASCADE);
// - customers: anonymized 3 years after their last order. Orders keep number, date, governorate, products and amounts
//   for the accounts; name, phone, email, address, city and notes are blanked on the customer and on every order.
// The automatic pass runs at most once a day, piggy-backed on page-view recording (single long-running server).
import { and, eq, lt, notLike, sql } from "drizzle-orm";
import { getDb } from "../db";
import { customers, orders, pageViews } from "../db/schema";
import { audit } from "./audit";
import { NotFoundError } from "./errors";

const DAY = 24 * 60 * 60 * 1000;
export const ANONYMIZED_NAME = "Anonymized customer";
const ANON_PHONE_PREFIX = "anon-";

/** True for a customer (or order) whose personal data was removed. */
export const isAnonymizedPhone = (phone: string) => phone.startsWith(ANON_PHONE_PREFIX);

const monthsAgo = (now: number, months: number) => {
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  return d.getTime();
};

/**
 * Remove a customer's personal data, keeping the accounting side of their orders. The phone becomes a unique
 * placeholder (the column is UNIQUE NOT NULL), so the checkout never recognizes it again.
 */
export function anonymizeCustomer(id: number, reason: "request" | "retention" = "request"): void {
  const db = getDb();
  db.transaction((tx) => {
    const current = tx.select({ id: customers.id }).from(customers).where(eq(customers.id, id)).get();
    if (!current) throw new NotFoundError("customer");
    tx.update(customers)
      .set({ name: ANONYMIZED_NAME, phone: `${ANON_PHONE_PREFIX}${id}`, email: null, businessName: null, city: null, address: null, notes: null, discountAvailable: false })
      .where(eq(customers.id, id))
      .run();
    const res = tx
      .update(orders)
      .set({ name: ANONYMIZED_NAME, phone: "", email: null, city: "", address: "", notes: null })
      .where(eq(orders.customerId, id))
      .run();
    audit("customer.anonymize", { id, orders: res.changes, reason }, tx);
  });
}

/** Anonymize every customer created more than 3 years ago with no order in the last 3 years. Returns the count. */
export function anonymizeInactiveCustomers(now = Date.now()): number {
  const cutoff = monthsAgo(now, 36);
  const stale = getDb()
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        notLike(customers.phone, `${ANON_PHONE_PREFIX}%`),
        lt(customers.createdAt, cutoff),
        sql`not exists (select 1 from "orders" o where o."customer_id" = "customers"."id" and o."created_at" >= ${cutoff})`,
      ),
    )
    .all();
  for (const c of stale) anonymizeCustomer(c.id, "retention");
  return stale.length;
}

/** Delete page views older than 25 months. Returns the number of rows removed. */
export function purgeOldPageViews(now = Date.now()): number {
  return getDb().delete(pageViews).where(lt(pageViews.ts, monthsAgo(now, 25))).run().changes;
}

const state = globalThis as unknown as { __ondeRetentionAt?: number };

/** Daily retention pass (cheap no-op when it already ran in the last 24 h). Never throws. */
export function runRetention(now = Date.now()): void {
  if (state.__ondeRetentionAt && now - state.__ondeRetentionAt < DAY) return;
  state.__ondeRetentionAt = now;
  try {
    const views = purgeOldPageViews(now);
    const anonymized = anonymizeInactiveCustomers(now);
    if (views || anonymized) console.log(`[onde] retention: ${views} old page views deleted, ${anonymized} inactive customers anonymized`);
  } catch (err) {
    console.error("[onde] retention pass failed", err);
  }
}
