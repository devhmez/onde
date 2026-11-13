import "server-only";
// New-order alerts: a native notification on every device registered in admin → Settings → Phone notifications
// (Web Push, see ./push.ts). Fire-and-forget: an order is never slowed down or failed by a notification.
import { count, eq } from "drizzle-orm";
import { getDb } from "../db";
import { orders } from "../db/schema";
import { formatDT } from "../lib/business";
import { cutText, sendToAll, sendToOne, type PushPayload, type PushResult } from "./push";
import type { Customer, Order, OrderItem } from "./types";

const ITEMS_MAX_CHARS = 110;
const NAME_MAX_CHARS = 70;
const BUSINESS_MAX_CHARS = 60;
const CITY_MAX_CHARS = 50;

/** Orders still waiting in the "new" status — shown as the app icon badge. */
export function newOrderCount(): number {
  return getDb().select({ n: count() }).from(orders).where(eq(orders.status, "new")).get()?.n ?? 0;
}

const oneLine = (s: string | null | undefined) => String(s ?? "").replace(/\s+/g, " ").trim();

/** "2× Review stand · 1× Card" — same products merged, cut at a whole item with "+N more" when long. */
export function itemsSummary(items: Pick<OrderItem, "productName" | "qty">[]): string {
  const merged = new Map<string, number>();
  for (const i of items) {
    const name = oneLine(i.productName) || "Item";
    merged.set(name, (merged.get(name) ?? 0) + i.qty);
  }
  const parts = [...merged].map(([name, qty]) => `${qty}× ${name}`);
  let out = "";
  for (let k = 0; k < parts.length; k++) {
    const rest = parts.length - k - 1;
    const next = out ? `${out} · ${parts[k]}` : parts[k];
    const suffix = rest > 0 ? ` · +${rest} more` : "";
    if (k > 0 && (next + suffix).length > ITEMS_MAX_CHARS) return `${out} · +${parts.length - k} more`;
    out = next;
  }
  return cutText(out, ITEMS_MAX_CHARS + 40); // one very long product name
}

/** "New order OND-1042 · 118 DT" / "Name (Business) — City" + items. Links to the order on the device's own origin. */
export function newOrderPayload(order: Order, items: OrderItem[], customer: Customer | null, badge: number | null): PushPayload {
  // Each part is cut on its own (whole characters, "…"), so the parentheses always close.
  const name = cutText(oneLine(order.name), NAME_MAX_CHARS);
  const business = cutText(oneLine(customer?.businessName) || oneLine(items.find((i) => i.businessName)?.businessName), BUSINESS_MAX_CHARS);
  const who = business ? `${name} (${business})` : name;
  return {
    title: `New order ${order.number} · ${formatDT(order.total, "en")}`,
    body: `${who} — ${cutText(oneLine(order.city), CITY_MAX_CHARS)}\n${itemsSummary(items)}`,
    path: `/admin/orders/${order.id}`,
    badge,
    data: { kind: "order", orderId: order.id },
  };
}

export function testPayload(badge: number | null): PushPayload {
  return {
    title: "ONDE Admin",
    body: "Test alert — notifications are working.",
    path: "/admin/settings",
    badge,
    data: { kind: "test" },
  };
}

function safeCount(): number | null {
  try {
    return newOrderCount();
  } catch {
    return null;
  }
}

/** Fire-and-forget new-order notification to every registered device. Never throws, never delays the caller. */
export function notifyNewOrder(data: { order: Order; items: OrderItem[]; customer: Customer }): void {
  try {
    setImmediate(() => {
      try {
        const badge = safeCount();
        void sendToAll(() => newOrderPayload(data.order, data.items, data.customer, badge)).then((results) => {
          if (!results.length) return;
          const n = (o: PushResult["outcome"]) => results.filter((r) => r.outcome === o).length;
          console.log(`[onde] push: order ${data.order.number} → ${n("delivered")} delivered, ${n("removed")} removed, ${n("failed")} failed`);
        });
      } catch (err) {
        console.warn("[onde] new-order notification failed", err instanceof Error ? err.message : err);
      }
    });
  } catch (err) {
    console.warn("[onde] could not schedule the new-order notification", err instanceof Error ? err.message : err);
  }
}

/** "Send test" from admin → Settings: one device (id) or all of them. */
export async function sendTestNotification(id?: number): Promise<PushResult[]> {
  const badge = safeCount();
  const build = () => testPayload(badge);
  if (id !== undefined) {
    const r = await sendToOne(id, build);
    return r ? [r] : [];
  }
  return sendToAll(build);
}
