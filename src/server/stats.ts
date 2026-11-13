import "server-only";
// Dashboard metrics. Definitions:
// - productsSold      = number of smart links (tags) = physical ONDE products in the field (manual tags included).
//                       Stock links (made in advance: no customer, no destination) are not sold and never counted.
// - productsSoldWeek  = those created in the last 7 days.
// - activeProducts    = those with status "active"; activePct = share of them (1 decimal).
// - inStock           = stock links waiting for a buyer.
// - taps30d           = taps in the last 30 days; tapsDeltaPct = % change vs the 30 days before (1 decimal).
//                       Taps on stock links are chip tests (they are deleted when the link is sold) and are left
//                       out of every tap figure and series.
// - customers / customersWeek = all customers / created in the last 7 days.
// - revenueMonth      = sum of order totals (millimes) of non-cancelled orders created this calendar month (Tunis time).
// - ordersNew         = orders waiting in status "new".
// Series are per Tunisian calendar day, oldest first, zero-filled, ending today.
import { and, count, countDistinct, desc, eq, gte, ne, not, sql } from "drizzle-orm";
import { getDb } from "../db";
import { customers, orders, pageViews, tags, taps } from "../db/schema";
import { stockCondition } from "./tags";
import type { Tag } from "./types";
import { clampInt, DAY_MS, lastDays, sqlDay, startOfDay, startOfMonth } from "./util";

const pct1 = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

/** A tap on a sold link (not a test tap on a stock link — see stockCondition). */
const soldTap = () => sql`not exists (select 1 from "tags" st where st."id" = ${taps.tagId} and st."customer_id" is null and st."destination_url" = '')`;

export async function getKpis(): Promise<{
  productsSold: number;
  productsSoldWeek: number;
  activeProducts: number;
  activePct: number;
  taps30d: number;
  tapsDeltaPct: number;
  customers: number;
  customersWeek: number;
  revenueMonth: number;
  ordersNew: number;
  inStock: number;
}> {
  const db = getDb();
  const now = Date.now();
  const weekAgo = now - 7 * DAY_MS;
  const d30 = now - 30 * DAY_MS;
  const d60 = now - 60 * DAY_MS;

  const tagAgg = db
    .select({
      total: count(),
      week: sql<number>`coalesce(sum(case when ${tags.createdAt} >= ${weekAgo} then 1 else 0 end), 0)`,
      active: sql<number>`coalesce(sum(case when ${tags.status} = 'active' then 1 else 0 end), 0)`,
    })
    .from(tags)
    .where(not(stockCondition()))
    .get();
  const inStock = db.select({ n: count() }).from(tags).where(stockCondition()).get();
  const tapAgg = db
    .select({
      cur: sql<number>`coalesce(sum(case when ${taps.ts} >= ${d30} then 1 else 0 end), 0)`,
      prev: sql<number>`coalesce(sum(case when ${taps.ts} < ${d30} then 1 else 0 end), 0)`,
    })
    .from(taps)
    .where(and(gte(taps.ts, d60), soldTap()))
    .get();
  const custAgg = db
    .select({
      total: count(),
      week: sql<number>`coalesce(sum(case when ${customers.createdAt} >= ${weekAgo} then 1 else 0 end), 0)`,
    })
    .from(customers)
    .get();
  const revenue = db
    .select({ sum: sql<number>`coalesce(sum(${orders.total}), 0)` })
    .from(orders)
    .where(and(gte(orders.createdAt, startOfMonth(now)), ne(orders.status, "cancelled")))
    .get();
  const ordersNew = db.select({ n: count() }).from(orders).where(eq(orders.status, "new")).get();

  const total = Number(tagAgg?.total ?? 0);
  const active = Number(tagAgg?.active ?? 0);
  const cur = Number(tapAgg?.cur ?? 0);
  const prev = Number(tapAgg?.prev ?? 0);
  return {
    productsSold: total,
    productsSoldWeek: Number(tagAgg?.week ?? 0),
    activeProducts: active,
    activePct: pct1(active, total),
    taps30d: cur,
    tapsDeltaPct: prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : cur > 0 ? 100 : 0,
    customers: Number(custAgg?.total ?? 0),
    customersWeek: Number(custAgg?.week ?? 0),
    revenueMonth: Number(revenue?.sum ?? 0),
    ordersNew: Number(ordersNew?.n ?? 0),
    inStock: Number(inStock?.n ?? 0),
  };
}

function since(days: number): { keys: string[]; from: number } {
  const keys = lastDays(days);
  return { keys, from: startOfDay(Date.now()) - (keys.length - 1) * DAY_MS };
}

export async function getTapSeries(days: number): Promise<{ date: string; taps: number }[]> {
  const { keys, from } = since(days);
  const day = sqlDay(taps.ts);
  const rows = getDb().select({ day, n: count() }).from(taps).where(and(gte(taps.ts, from), soldTap())).groupBy(day).all();
  const map = new Map(rows.map((r) => [r.day, Number(r.n)]));
  return keys.map((date) => ({ date, taps: map.get(date) ?? 0 }));
}

/** Revenue (millimes) and order count per day, non-cancelled orders, by creation day. */
export async function getRevenueSeries(days: number): Promise<{ date: string; revenue: number; orders: number }[]> {
  const { keys, from } = since(days);
  const day = sqlDay(orders.createdAt);
  const rows = getDb()
    .select({ day, revenue: sql<number>`coalesce(sum(${orders.total}), 0)`, n: count() })
    .from(orders)
    .where(and(gte(orders.createdAt, from), ne(orders.status, "cancelled")))
    .groupBy(day)
    .all();
  const map = new Map(rows.map((r) => [r.day, r]));
  return keys.map((date) => {
    const r = map.get(date);
    return { date, revenue: Number(r?.revenue ?? 0), orders: Number(r?.n ?? 0) };
  });
}

export async function getSourceSplit(days: number): Promise<{ nfc: number; qr: number }> {
  const { from } = since(days);
  const rows = getDb().select({ source: taps.source, n: count() }).from(taps).where(and(gte(taps.ts, from), soldTap())).groupBy(taps.source).all();
  const out = { nfc: 0, qr: 0 };
  for (const r of rows) if (r.source in out) out[r.source] = Number(r.n);
  return out;
}

export async function getDeviceSplit(days: number): Promise<{ ios: number; android: number; desktop: number; other: number }> {
  const { from } = since(days);
  const rows = getDb().select({ device: taps.device, n: count() }).from(taps).where(and(gte(taps.ts, from), soldTap())).groupBy(taps.device).all();
  const out = { ios: 0, android: 0, desktop: 0, other: 0 };
  for (const r of rows) if (r.device in out) out[r.device] = Number(r.n);
  return out;
}

/** Most-tapped sold smart links over the last 30 days (ties broken by all-time taps). */
export async function getTopTags(limit: number): Promise<(Tag & { customerName: string | null; taps30d: number })[]> {
  const db = getDb();
  const d30 = Date.now() - 30 * DAY_MS;
  const taps30d = sql<number>`(select count(*) from "taps" tp where tp."tag_id" = "tags"."id" and tp."ts" >= ${d30})`;
  const rows = db
    .select({ tag: tags, customerName: sql<string | null>`coalesce(${customers.businessName}, ${customers.name})`, taps30d })
    .from(tags)
    .leftJoin(customers, eq(tags.customerId, customers.id))
    .where(not(stockCondition()))
    .orderBy(desc(taps30d), desc(tags.tapCount), desc(tags.id))
    .limit(clampInt(limit, 1, 100, 10))
    .all();
  return rows.map((r) => ({ ...r.tag, customerName: r.customerName ?? null, taps30d: Number(r.taps30d) || 0 }));
}

/** Page views and unique visitors (daily-salted hash) per day. */
export async function getTraffic(days: number): Promise<{ date: string; views: number; visitors: number }[]> {
  const { keys, from } = since(days);
  const day = sqlDay(pageViews.ts);
  const rows = getDb()
    .select({ day, views: count(), visitors: countDistinct(pageViews.visitor) })
    .from(pageViews)
    .where(gte(pageViews.ts, from))
    .groupBy(day)
    .all();
  const map = new Map(rows.map((r) => [r.day, r]));
  return keys.map((date) => {
    const r = map.get(date);
    return { date, views: Number(r?.views ?? 0), visitors: Number(r?.visitors ?? 0) };
  });
}

/** Tap series for one tag (tag detail chart). */
export async function getTagTapSeries(tagId: number, days: number): Promise<{ date: string; taps: number }[]> {
  const { keys, from } = since(days);
  const day = sqlDay(taps.ts);
  const rows = getDb()
    .select({ day, n: count() })
    .from(taps)
    .where(and(eq(taps.tagId, tagId), gte(taps.ts, from)))
    .groupBy(day)
    .all();
  const map = new Map(rows.map((r) => [r.day, Number(r.n)]));
  return keys.map((date) => ({ date, taps: map.get(date) ?? 0 }));
}

/** Top pages over a window (Analytics page). */
export async function getTopPages(days: number, limit = 10): Promise<{ path: string; views: number }[]> {
  const { from } = since(days);
  const rows = getDb()
    .select({ path: pageViews.path, views: count() })
    .from(pageViews)
    .where(gte(pageViews.ts, from))
    .groupBy(pageViews.path)
    .orderBy(desc(count()))
    .limit(clampInt(limit, 1, 100, 10))
    .all();
  return rows.map((r) => ({ path: r.path, views: Number(r.views) }));
}

/** Top external referrers (origins) over a window. */
export async function getTopReferrers(days: number, limit = 10): Promise<{ referrer: string; views: number }[]> {
  const { from } = since(days);
  const rows = getDb()
    .select({ referrer: pageViews.referrer, views: count() })
    .from(pageViews)
    .where(and(gte(pageViews.ts, from), sql`${pageViews.referrer} is not null`))
    .groupBy(pageViews.referrer)
    .orderBy(desc(count()))
    .limit(clampInt(limit, 1, 100, 10))
    .all();
  return rows.map((r) => ({ referrer: r.referrer ?? "", views: Number(r.views) }));
}
