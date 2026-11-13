import "server-only";
import { and, count, desc, eq, inArray, isNotNull, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Executor } from "../db";
import { auditLog, customers, destinationHistory, orderItems, orders, products, tags } from "../db/schema";
import { GOVERNORATES, normalizePhone, priceOrder, standVariant, withStandColour, type StandVariant } from "../lib/business";
import { withSale } from "../lib/sale";
import { audit } from "./audit";
import { DataError, NotFoundError } from "./errors";
import { notifyNewOrder } from "./notify";
import { onTagReassigned } from "./portal-tags";
import { readSettings, rulesFrom } from "./settings";
import { clearTestTaps, guessDestinationType, insertTag, isStockTag, lastPrintedAt, normalizeCode, normalizeDestinationUrl, TAG_KIND_LABELS } from "./tags";
import {
  ORDER_STATUSES,
  type CreateOrderInput,
  type Customer,
  type DestinationType,
  type FieldErrorCode,
  type FieldErrors,
  type Order,
  type OrderItem,
  type OrderStatus,
  type PublicOrderSummary,
  type Tag,
  type TagKind,
} from "./types";
import { clampInt, contains } from "./util";

/** Order-flow failure. `code`: "validation" | "empty" | "closed" | "invalid_status". */
export class OrderError extends DataError {
  constructor(code: "validation" | "empty" | "closed" | "invalid_status", fields?: FieldErrors) {
    super(code, fields);
    this.name = "OrderError";
  }
}

/** Value stored in orders.discountReason when the one-time returning-customer discount is applied. */
export const RETURNING_DISCOUNT_REASON = "returning_10";

const ORDER_PREFIX = "OND-";
const FIRST_ORDER_NUMBER = 1001;
const MAX_UNITS_PER_ORDER = 200;

// ---------------------------------------------------------------------------------------------------------------
// Validation (zod) — error messages are locale-agnostic FieldErrorCodes

const code = (c: FieldErrorCode) => ({ error: c });

const requiredText = (max: number) =>
  z.string(code("required")).trim().min(1, code("required")).max(max, code("too_long"));

const optionalText = (max: number) =>
  z
    .string(code("invalid"))
    .trim()
    .max(max, code("too_long"))
    .nullish()
    .transform((v) => (v ? v : undefined));

const governorateByKey = new Map(
  GOVERNORATES.map((g) => [g.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(), g as string]),
);

const itemSchema = z.object({
  productId: z.coerce.number(code("invalid")).int(code("invalid")).positive(code("invalid")),
  qty: z.coerce.number(code("invalid")).int(code("invalid")).min(1, code("invalid")).max(99, code("too_many")),
  businessName: optionalText(120),
  destinationUrl: z
    .string(code("invalid_url"))
    .nullish()
    .transform((v, ctx) => {
      const url = normalizeDestinationUrl(v ?? "");
      if (url == null) {
        ctx.addIssue({ code: "custom", message: "invalid_url" });
        return z.NEVER;
      }
      return url || undefined;
    }),
});

const customerSchema = z.object({
  name: requiredText(120),
  phone: z
    .string(code("required"))
    .trim()
    .min(1, code("required"))
    .transform((v, ctx) => {
      const p = normalizePhone(v);
      if (!p) {
        ctx.addIssue({ code: "custom", message: "invalid_phone" });
        return z.NEVER;
      }
      return p;
    }),
  email: z
    .string(code("invalid_email"))
    .trim()
    .max(200, code("too_long"))
    .nullish()
    .transform((v, ctx) => {
      if (!v) return undefined;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
        ctx.addIssue({ code: "custom", message: "invalid_email" });
        return z.NEVER;
      }
      return v.toLowerCase();
    }),
  businessName: optionalText(120),
  governorate: z
    .string(code("required"))
    .trim()
    .min(1, code("required"))
    .transform((v, ctx) => {
      const g = governorateByKey.get(v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase());
      if (!g) {
        ctx.addIssue({ code: "custom", message: "invalid_governorate" });
        return z.NEVER;
      }
      return g;
    }),
  city: requiredText(80),
  address: requiredText(300),
  notes: optionalText(1000),
});

const orderSchema = z.object({
  items: z.array(itemSchema, code("required")).min(1, { error: "empty" }).max(50, code("too_many")),
  customer: z.object(customerSchema.shape, code("required")),
  locale: z.enum(["fr", "en"]).catch("fr"),
  channel: z.enum(["web", "whatsapp", "manual"]).optional().catch(undefined),
});

export type ParsedOrderInput = z.output<typeof orderSchema>;

/** Validate + normalize a CreateOrderInput. Throws OrderError("empty" | "validation", fields). */
export function parseOrderInput(input: unknown): ParsedOrderInput {
  const r = orderSchema.safeParse(input);
  if (!r.success) {
    if (r.error.issues.some((i) => i.path.length === 1 && i.path[0] === "items" && i.message === "empty")) throw new OrderError("empty");
    const fields: FieldErrors = {};
    for (const issue of r.error.issues) {
      const key = issue.path.map(String).join(".") || "form";
      if (!fields[key]) fields[key] = (isFieldCode(issue.message) ? issue.message : "invalid") as FieldErrorCode;
    }
    throw new OrderError("validation", fields);
  }
  const units = r.data.items.reduce((n, i) => n + i.qty, 0);
  if (units > MAX_UNITS_PER_ORDER) throw new OrderError("validation", { items: "too_many" });
  return r.data;
}

const FIELD_CODES = new Set<string>([
  "required",
  "invalid",
  "invalid_phone",
  "invalid_email",
  "invalid_url",
  "invalid_governorate",
  "too_long",
  "too_many",
  "unavailable",
  "taken",
]);
const isFieldCode = (m: string) => FIELD_CODES.has(m);

// ---------------------------------------------------------------------------------------------------------------
// Create

function nextOrderNumber(exec: Executor): string {
  const row = exec
    .select({ n: sql<number | null>`max(cast(substr(${orders.number}, ${ORDER_PREFIX.length + 1}) as integer))` })
    .from(orders)
    .where(sql`${orders.number} like ${ORDER_PREFIX + "%"}`)
    .get();
  const last = Number(row?.n ?? 0) || 0;
  return `${ORDER_PREFIX}${Math.max(last + 1, FIRST_ORDER_NUMBER)}`;
}

/**
 * Create an order: validate, normalize phone, upsert the customer by phone, re-price from the DB with priceOrder()
 * + settings rules, apply & consume the one-time returning-customer discount, allocate OND-#### and insert everything
 * in one transaction. Then fires the new-order push notification (fire-and-forget). Throws OrderError(code, fields?).
 * `channel: "manual"` (admin-created) bypasses `storeOpen` and may include inactive products.
 */
export async function createOrder(input: CreateOrderInput): Promise<{ order: Order; items: OrderItem[]; customer: Customer }> {
  const data = parseOrderInput(input);
  const channel = data.channel ?? "web";
  const manual = channel === "manual";
  const db = getDb();

  const result = db.transaction(
    (tx) => {
      const s = readSettings(tx);
      if (!s.storeOpen && !manual) throw new OrderError("closed");

      const ids = [...new Set(data.items.map((i) => i.productId))];
      const prods = tx.select().from(products).where(inArray(products.id, ids)).all();
      // customers pay the price shown right now (time-limited sales included)
      const byId = new Map(prods.map((p) => [p.id, withSale(p)]));
      const fields: FieldErrors = {};
      data.items.forEach((it, i) => {
        const p = byId.get(it.productId);
        if (!p || (!p.active && !manual)) fields[`items.${i}.productId`] = "unavailable";
      });
      if (Object.keys(fields).length) throw new OrderError("validation", fields);

      const now = Date.now();
      const c = data.customer;
      let customer = tx.select().from(customers).where(eq(customers.phone, c.phone)).get();
      if (customer) {
        customer = tx
          .update(customers)
          .set({
            name: c.name,
            email: c.email ?? customer.email,
            businessName: c.businessName ?? customer.businessName,
            governorate: c.governorate,
            city: c.city,
            address: c.address,
          })
          .where(eq(customers.id, customer.id))
          .returning()
          .get();
      } else {
        customer = tx
          .insert(customers)
          .values({
            name: c.name,
            phone: c.phone,
            email: c.email ?? null,
            businessName: c.businessName ?? null,
            governorate: c.governorate,
            city: c.city,
            address: c.address,
            discountAvailable: false,
            createdAt: now,
          })
          .returning()
          .get();
      }

      const rules = rulesFrom(s);
      const lines = data.items.map((it) => ({ unitPrice: byId.get(it.productId)!.price, qty: it.qty }));
      const eligible = customer.discountAvailable && rules.returningDiscountPct > 0;
      const priced = priceOrder(lines, { rules, returningDiscount: eligible });
      const discountApplied = eligible && priced.discount > 0;
      if (discountApplied) {
        customer = tx.update(customers).set({ discountAvailable: false }).where(eq(customers.id, customer.id)).returning().get();
      }

      const order = tx
        .insert(orders)
        .values({
          number: nextOrderNumber(tx),
          customerId: customer.id,
          status: "new",
          channel,
          locale: data.locale,
          name: c.name,
          phone: c.phone,
          email: c.email ?? null,
          governorate: c.governorate,
          city: c.city,
          address: c.address,
          notes: c.notes ?? null,
          subtotal: priced.subtotal,
          discount: priced.discount,
          discountReason: discountApplied ? RETURNING_DISCOUNT_REASON : null,
          deliveryFee: priced.deliveryFee,
          total: priced.total,
          paymentMethod: "cod",
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();

      const items = data.items.map((it) => {
        const p = byId.get(it.productId)!;
        return tx
          .insert(orderItems)
          .values({
            orderId: order.id,
            productId: p.id,
            productName: data.locale === "fr" ? p.nameFr : p.nameEn,
            kind: p.kind,
            unitPrice: p.price,
            qty: it.qty,
            lineTotal: p.price * it.qty,
            businessName: it.businessName ?? c.businessName ?? null,
            destinationUrl: it.destinationUrl ?? null,
          })
          .returning()
          .get();
      });

      audit(
        "order.create",
        { id: order.id, number: order.number, channel, total: order.total, discount: order.discount, customerId: customer.id },
        tx,
      );
      return { order, items, customer };
    },
    { behavior: "immediate" },
  );

  notifyNewOrder(result);
  return result;
}

// ---------------------------------------------------------------------------------------------------------------
// Read

export type OrderListFilter = { status?: OrderStatus; q?: string; limit?: number; offset?: number };

/** Orders, newest first. `itemCount` = number of units (sum of quantities). */
export async function listOrders(f: OrderListFilter = {}): Promise<{ rows: (Order & { itemCount: number })[]; total: number }> {
  const db = getDb();
  const conds: SQL[] = [];
  if (f.status && ORDER_STATUSES.includes(f.status)) conds.push(eq(orders.status, f.status));
  const q = f.q?.trim();
  if (q) {
    const digits = q.replace(/\D/g, "");
    const term = or(
      contains(orders.number, q.toUpperCase()),
      contains(orders.name, q),
      contains(orders.city, q),
      contains(orders.governorate, q),
      contains(orders.email, q),
      digits.length >= 3 ? contains(orders.phone, digits) : undefined,
      // a smart-link code of the order (the code printed under the stand's QR)
      (() => {
        const code = q.toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (code.length < 4 || code.length > 8 || /^\d+$/.test(code)) return undefined;
        return sql`exists (select 1 from "tags" ot where ot."order_id" = "orders"."id" and ot."code" like ${`%${code}%`})`;
      })(),
    );
    if (term) conds.push(term);
  }
  const where = conds.length ? and(...conds) : undefined;
  // Fully qualified on purpose: drizzle drops table prefixes on single-table selects.
  const itemCount = sql<number>`(select coalesce(sum(oi."qty"), 0) from "order_items" oi where oi."order_id" = "orders"."id")`;
  const rows = db
    .select({ order: orders, itemCount })
    .from(orders)
    .where(where)
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(clampInt(f.limit, 1, 1000, 50))
    .offset(clampInt(f.offset, 0, 1_000_000, 0))
    .all();
  const total = db.select({ n: count() }).from(orders).where(where).get()?.n ?? 0;
  return { rows: rows.map((r) => ({ ...r.order, itemCount: Number(r.itemCount) || 0 })), total };
}

function findOrder(exec: Executor, idOrNumber: number | string): Order | undefined {
  if (typeof idOrNumber === "number") return exec.select().from(orders).where(eq(orders.id, idOrNumber)).get();
  const v = String(idOrNumber).trim().toUpperCase();
  if (/^\d+$/.test(v)) {
    return exec.select().from(orders).where(eq(orders.id, Number(v))).get() ?? exec.select().from(orders).where(eq(orders.number, ORDER_PREFIX + v)).get();
  }
  return exec.select().from(orders).where(eq(orders.number, v)).get();
}

/** By numeric id or by number ("OND-1001"; a bare numeric string is tried as id, then as "OND-<n>"). */
export async function getOrder(
  idOrNumber: number | string,
): Promise<{ order: Order; items: OrderItem[]; customer: Customer; tags: Tag[] } | null> {
  const db = getDb();
  const order = findOrder(db, idOrNumber);
  if (!order) return null;
  const items = db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(orderItems.id).all();
  const customer = db.select().from(customers).where(eq(customers.id, order.customerId)).get();
  if (!customer) return null;
  const tagRows = db.select().from(tags).where(eq(tags.orderId, order.id)).orderBy(tags.id).all();
  return { order, items, customer, tags: tagRows };
}

/**
 * Non-PII summary for the public thank-you page (/order/[number]): order numbers are sequential and guessable, so the
 * public page must not show phone/address. Returns null when unknown.
 */
export async function getPublicOrderSummary(number: string): Promise<PublicOrderSummary | null> {
  const v = String(number ?? "").trim().toUpperCase();
  if (!/^OND-\d{1,9}$/.test(v)) return null;
  const db = getDb();
  const order = db.select().from(orders).where(eq(orders.number, v)).get();
  if (!order) return null;
  const items = db
    .select({ productName: orderItems.productName, qty: orderItems.qty, unitPrice: orderItems.unitPrice, lineTotal: orderItems.lineTotal })
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id))
    .orderBy(orderItems.id)
    .all();
  return {
    number: order.number,
    status: order.status,
    locale: order.locale,
    subtotal: order.subtotal,
    discount: order.discount,
    discountReason: order.discountReason,
    deliveryFee: order.deliveryFee,
    total: order.total,
    paymentMethod: order.paymentMethod,
    createdAt: order.createdAt,
    firstName: order.name.trim().split(/\s+/)[0] ?? "",
    items,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Status workflow + returning-customer discount flag

/**
 * Change an order's status and keep the one-time returning-customer discount consistent:
 * - → delivered: the customer earns `discountAvailable = true`, unless they already used the returning discount on a
 *   (non-cancelled) order — it is a one-time benefit.
 * - delivered → anything else (correction): an earned-but-unused discount is revoked if no other delivered order backs it.
 * - → cancelled on an order that consumed the discount: the flag is restored. Un-cancelling consumes it again.
 */
export async function updateOrderStatus(id: number, status: OrderStatus): Promise<Order> {
  if (!ORDER_STATUSES.includes(status)) throw new OrderError("invalid_status");
  return getDb().transaction((tx) => setOrderStatusTx(tx, id, status), { behavior: "immediate" });
}

/** updateOrderStatus inside the caller's transaction (e.g. Return to stock cancelling an in-person sale). */
export function setOrderStatusTx(tx: Executor, id: number, status: OrderStatus): Order {
  if (!ORDER_STATUSES.includes(status)) throw new OrderError("invalid_status");
  const order = tx.select().from(orders).where(eq(orders.id, id)).get();
  if (!order) throw new NotFoundError("order");
  const prev = order.status;
  if (prev === status) return order;
  const now = Date.now();
  const updated = tx.update(orders).set({ status, updatedAt: now }).where(eq(orders.id, id)).returning().get();

  const customer = tx.select().from(customers).where(eq(customers.id, order.customerId)).get();
  if (customer) {
    let flag = customer.discountAvailable;
    const usedDiscount = Boolean(order.discountReason);
    const usedElsewhere = () =>
      Boolean(
        tx
          .select({ id: orders.id })
          .from(orders)
          .where(and(eq(orders.customerId, customer.id), isNotNull(orders.discountReason), ne(orders.status, "cancelled")))
          .get(),
      );

    if (prev === "delivered" && status !== "delivered" && flag && !usedDiscount) {
      const otherDelivered = tx
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.customerId, customer.id), eq(orders.status, "delivered"), ne(orders.id, id)))
        .get();
      if (!otherDelivered && !usedElsewhere()) flag = false;
    }
    if (status === "delivered" && !flag && !usedElsewhere()) flag = true;
    if (usedDiscount && status === "cancelled") flag = true;
    else if (usedDiscount && prev === "cancelled") flag = false;

    if (flag !== customer.discountAvailable) {
      tx.update(customers).set({ discountAvailable: flag }).where(eq(customers.id, customer.id)).run();
      audit("customer.discount", { customerId: customer.id, available: flag, reason: `order ${order.number} ${prev}→${status}` }, tx);
    }
  }
  audit("order.status", { id, number: order.number, from: prev, to: status }, tx);
  return updated;
}

// ---------------------------------------------------------------------------------------------------------------
// Fulfilment: one smart link (tag) per physical unit

/** Physical contents of the packs (per pack unit). */
export const PACK_CONTENTS: Record<string, { kind: TagKind; count: number }[]> = {
  "pack-cafe": [
    { kind: "stand", count: 2 },
    { kind: "sticker", count: 4 },
  ],
  "pack-team": [{ kind: "card", count: 5 }],
};

const PHYSICAL_KINDS = new Set<string>(["stand", "card", "keychain", "sticker"]);

function unitLabel(kind: TagKind, slug: string | null): string {
  // Stands always carry their colour (packs hold white stands): the owner's name put in front never decides it.
  if (kind === "stand") return slug === "stand-black" ? "Review stand (black)" : "Review stand (white)";
  return TAG_KIND_LABELS[kind];
}

/** One physical unit of an order (packs expanded): what its smart link is for. `n` = its number within its kind. */
type Unit = { kind: TagKind; label: string; owner: string; url: string; variant: StandVariant | null; n: number };

/** The physical units of an order, in line order (packs expand via PACK_CONTENTS). */
function orderUnits(exec: Executor, order: Order): Unit[] {
  const customer = exec.select().from(customers).where(eq(customers.id, order.customerId)).get();
  const lines = exec
    .select({ item: orderItems, slug: products.slug })
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, order.id))
    .orderBy(orderItems.id)
    .all();
  const units: Unit[] = [];
  const perKind = new Map<TagKind, number>();
  for (const { item, slug } of lines) {
    const owner = item.businessName?.trim() || customer?.businessName?.trim() || order.name;
    const url = normalizeDestinationUrl(item.destinationUrl) ?? "";
    const contents: { kind: TagKind; count: number }[] =
      slug && PACK_CONTENTS[slug]
        ? PACK_CONTENTS[slug]
        : PHYSICAL_KINDS.has(item.kind)
          ? [{ kind: item.kind as TagKind, count: 1 }]
          : [];
    for (let q = 0; q < item.qty; q++) {
      for (const part of contents) {
        for (let k = 0; k < part.count; k++) {
          const label = unitLabel(part.kind, slug);
          const n = (perKind.get(part.kind) ?? 0) + 1;
          perKind.set(part.kind, n);
          units.push({ kind: part.kind, label, owner, url, variant: standVariant({ kind: part.kind, label }), n });
        }
      }
    }
  }
  return units;
}

/**
 * Which units already have their smart link: each tag of the order covers one unit of its kind — the same stand
 * colour first (a black stock stand covers the black unit, not the first stand of the order), else any.
 */
function coveredUnits(units: Unit[], existing: Pick<Tag, "kind" | "label">[]): Set<Unit> {
  const covered = new Set<Unit>();
  for (const t of existing) {
    const v = standVariant(t);
    const free = units.filter((u) => u.kind === t.kind && !covered.has(u));
    const unit = free.find((u) => u.variant === v) ?? free[0];
    if (unit) covered.add(unit);
  }
  return covered;
}

/** Units of an order still without a smart link, per kind (order page: offer stock links before minting new ones). */
export async function missingUnitsByKind(orderId: number): Promise<Partial<Record<TagKind, number>>> {
  const db = getDb();
  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order) return {};
  const units = orderUnits(db, order);
  const covered = coveredUnits(units, db.select({ kind: tags.kind, label: tags.label }).from(tags).where(eq(tags.orderId, orderId)).all());
  const out: Partial<Record<TagKind, number>> = {};
  for (const u of units) if (!covered.has(u)) out[u.kind] = (out[u.kind] ?? 0) + 1;
  return out;
}

/**
 * Create the smart links for an order: one tag per physical unit (packs expand via PACK_CONTENTS), labelled
 * "<business or customer name> — <kind> #n", destination taken from the order line. Idempotent: units already
 * covered by a tag of this order (created here, or a stock link assigned with assignStockTagToOrder) are skipped, so
 * calling it twice never duplicates. Returns the tags created by this call.
 */
export async function createTagsForOrder(orderId: number): Promise<Tag[]> {
  const db = getDb();
  return db.transaction(
    (tx) => {
      const order = tx.select().from(orders).where(eq(orders.id, orderId)).get();
      if (!order) throw new NotFoundError("order");
      const units = orderUnits(tx, order);
      const existing = tx.select({ kind: tags.kind, label: tags.label }).from(tags).where(eq(tags.orderId, orderId)).all();
      const covered = coveredUnits(units, existing);
      const reserved = new Set<string>();
      const created: Tag[] = [];
      for (const u of units) {
        if (covered.has(u)) continue;
        created.push(
          insertTag(
            tx,
            {
              kind: u.kind,
              label: `${u.owner} — ${u.label} #${u.n}`.slice(0, 120),
              customerId: order.customerId,
              orderId,
              destinationType: guessDestinationType(u.url),
              destinationUrl: u.url,
              notes: null,
            },
            reserved,
          ),
        );
      }
      if (created.length) audit("order.tags", { orderId, number: order.number, created: created.map((t) => t.code) }, tx);
      return created;
    },
    { behavior: "immediate" },
  );
}

/** Why a stock link could not be used for an order (mapped to messages by the admin action). */
export class StockAssignError extends Error {
  constructor(
    readonly reason: "unknown_code" | "not_in_stock" | "no_unit" | "cancelled" | "replace_needed",
    readonly code: string,
    readonly kind?: TagKind,
    /** replace_needed: the code minted for this order (never printed, tapped or written) that the stock link would replace. */
    readonly replaceCode?: string,
  ) {
    super(reason);
    this.name = "StockAssignError";
  }
}

export type StockAssignResult = {
  tag: Tag;
  /** The stock link was disabled ("Product active" off): selling it switched it back on. */
  activated: boolean;
  /** Code minted for this order that was deleted in favour of the stock link (see `replace`). */
  replaced: string | null;
};

/** Codes minted for this order by createTagsForOrder (the "order.tags" audit entries list them). */
function mintedCodes(exec: Executor, orderId: number): Set<string> {
  const rows = exec
    .select({ details: auditLog.details })
    .from(auditLog)
    .where(and(eq(auditLog.action, "order.tags"), sql`${auditLog.details} like ${`{"orderId":${orderId},%`}`))
    .all();
  const out = new Set<string>();
  for (const r of rows) {
    try {
      const d = JSON.parse(r.details ?? "{}") as { orderId?: unknown; created?: unknown };
      if (d.orderId === orderId && Array.isArray(d.created)) for (const c of d.created) if (typeof c === "string") out.add(c);
    } catch {
      /* not JSON */
    }
  }
  return out;
}

/**
 * Smart links of this order that nothing physical carries yet: minted for the order (not a stock link), never printed,
 * never tapped, chip not marked written. A printed stock stand may replace one of them (the minted code is deleted), so
 * a stand sold from stock never ends up with a second, unprinted code.
 */
function replaceableTags(exec: Executor, orderId: number, kind?: TagKind): Tag[] {
  const minted = mintedCodes(exec, orderId);
  if (!minted.size) return [];
  const rows = exec
    .select()
    .from(tags)
    .where(and(eq(tags.orderId, orderId), kind ? eq(tags.kind, kind) : undefined))
    .orderBy(tags.id)
    .all();
  return rows.filter((t) => minted.has(t.code) && t.tapCount === 0 && t.chipStatus === "none" && lastPrintedAt(t.code, exec) == null);
}

/** Per kind, the codes of this order a stock link may replace (order page: keep "Use a stock stand" offered). */
export async function replaceableByKind(orderId: number): Promise<Partial<Record<TagKind, string[]>>> {
  const out: Partial<Record<TagKind, string[]>> = {};
  for (const t of replaceableTags(getDb(), orderId)) (out[t.kind] ??= []).push(t.code);
  return out;
}

/**
 * Core of "sell a stock link through an order", inside the caller's transaction (see assignStockTagToOrder). The link
 * gets the order's customer and order id, the destination of the unit it fulfils (or `destinationUrl` when given), the
 * label "<owner> — <stock label>", status active (a disabled stock link is switched on: it is being handed over), and
 * its test taps are cleared. With no unit left, a code minted for this order that nothing physical carries can be
 * replaced: the caller must name it in `replace` (else StockAssignError "replace_needed" says which one).
 */
export function assignStockTagTx(
  tx: Executor,
  order: Order,
  tag: Tag,
  opts: { replace?: string; destinationUrl?: string; destinationType?: DestinationType } = {},
): StockAssignResult {
  const code = tag.code;
  if (order.status === "cancelled") throw new StockAssignError("cancelled", code);
  if (!isStockTag(tag)) throw new StockAssignError("not_in_stock", code, tag.kind);

  const units = orderUnits(tx, order);
  const variant = standVariant(tag);
  const pick = (existing: Pick<Tag, "kind" | "label">[]) => {
    const covered = coveredUnits(units, existing);
    const free = units.filter((u) => u.kind === tag.kind && !covered.has(u));
    return free.find((u) => u.variant === variant) ?? free[0];
  };
  const existingOf = () => tx.select({ kind: tags.kind, label: tags.label }).from(tags).where(eq(tags.orderId, order.id)).all();
  let unit = pick(existingOf());
  let replaced: string | null = null;
  if (!unit) {
    const candidates = replaceableTags(tx, order.id, tag.kind);
    const candidate = candidates.find((t) => standVariant(t) === variant) ?? candidates[0];
    if (!candidate) throw new StockAssignError("no_unit", code, tag.kind);
    const wanted = opts.replace ? normalizeCode(opts.replace) : "";
    const victim = candidates.find((t) => t.code === wanted);
    if (!victim) throw new StockAssignError("replace_needed", code, tag.kind, candidate.code);
    tx.delete(tags).where(eq(tags.id, victim.id)).run(); // never tapped: no taps; its destination history cascades
    audit("tag.delete", { id: victim.id, code: victim.code, reason: "replaced_by_stock", by: code, orderId: order.id }, tx);
    replaced = victim.code;
    unit = pick(existingOf());
    if (!unit) throw new StockAssignError("no_unit", code, tag.kind);
  }

  const url = opts.destinationUrl || unit.url || units.find((u) => u.kind === tag.kind && u.url)?.url || "";
  const type = url ? (opts.destinationUrl && opts.destinationType ? opts.destinationType : guessDestinationType(url)) : tag.destinationType;
  const now = Date.now();
  const activated = tag.status !== "active";
  clearTestTaps(tx, tag);
  // New owner: client-page state starts fresh (customer_since, no location label, no stale pending request).
  onTagReassigned(tx, tag, tag.customerId, order.customerId, now);
  const updated = tx
    .update(tags)
    .set({
      customerId: order.customerId,
      orderId: order.id,
      label: `${unit.owner} — ${withStandColour(tag)}`.slice(0, 120),
      ...(url ? { destinationUrl: url, destinationType: type } : {}),
      status: "active",
      updatedAt: now,
    })
    .where(eq(tags.id, tag.id))
    .returning()
    .get();
  if (url) {
    tx.insert(destinationHistory)
      .values({ tagId: tag.id, fromType: tag.destinationType, fromUrl: tag.destinationUrl, toType: updated.destinationType, toUrl: url, changedAt: now })
      .run();
    audit("tag.destination", { id: tag.id, code, from: { type: tag.destinationType, url: tag.destinationUrl }, to: { type: updated.destinationType, url } }, tx);
  }
  if (activated) audit("tag.status", { id: tag.id, code, status: "active", reason: "sold" }, tx);
  audit("order.stock_tag", { orderId: order.id, number: order.number, code, unit: `${unit.label} #${unit.n}`, ...(replaced ? { replaced } : {}) }, tx);
  return { tag: updated, activated, replaced };
}

/**
 * Sell a pre-printed stock link through an order (the code printed under its QR): see assignStockTagTx. One
 * transaction. createTagsForOrder then skips that unit, so no second code is minted for it.
 */
export async function assignStockTagToOrder(orderId: number, rawCode: string, opts: { replace?: string } = {}): Promise<StockAssignResult> {
  const db = getDb();
  return db.transaction(
    (tx) => {
      const order = tx.select().from(orders).where(eq(orders.id, orderId)).get();
      if (!order) throw new NotFoundError("order");
      const code = normalizeCode(rawCode);
      const tag = code ? tx.select().from(tags).where(eq(tags.code, code)).get() : undefined;
      if (!tag) throw new StockAssignError("unknown_code", code);
      return assignStockTagTx(tx, order, tag, { replace: opts.replace });
    },
    { behavior: "immediate" },
  );
}

/** An open order the stand sold at the counter can be handed over for (`replace`: the unprinted code it replaces). */
export type OpenOrderNeeding = { id: number; number: string; status: OrderStatus; missing: number; replace: string | null };

/**
 * Open orders of a customer (not cancelled) that still wait for a product of this kind — the stand sold at the counter
 * may be the one they ordered. An order whose unit already got a code that nothing physical carries (minted with
 * "Create smart links", never printed, tapped or written) waits too: the stand handed over replaces that code
 * (`replace`), so the client never ends up with two codes and two sales for one stand. Newest first, at most 5.
 */
export function openOrdersNeeding(exec: Executor, customerId: number, tag: Pick<Tag, "kind" | "label">): OpenOrderNeeding[] {
  const kind = tag.kind;
  const variant = standVariant(tag);
  const list = exec
    .select()
    .from(orders)
    .where(and(eq(orders.customerId, customerId), ne(orders.status, "cancelled")))
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(20)
    .all();
  const out: OpenOrderNeeding[] = [];
  for (const o of list) {
    const units = orderUnits(exec, o);
    const covered = coveredUnits(units, exec.select({ kind: tags.kind, label: tags.label }).from(tags).where(eq(tags.orderId, o.id)).all());
    const missing = units.filter((u) => u.kind === kind && !covered.has(u)).length;
    if (missing) out.push({ id: o.id, number: o.number, status: o.status, missing, replace: null });
    else {
      const repl = replaceableTags(exec, o.id, kind);
      if (repl.length) {
        const pick = repl.find((t) => standVariant(t) === variant) ?? repl[0];
        out.push({ id: o.id, number: o.number, status: o.status, missing: repl.length, replace: pick.code });
      }
    }
    if (out.length >= 5) break;
  }
  return out;
}

/** Product sold as this physical item (stand colour from the label, else the product of the same kind). */
function productForTag(exec: Executor, tag: Pick<Tag, "kind" | "label">) {
  const slug = tag.kind === "stand" ? (standVariant(tag) === "black" ? "stand-black" : "stand-white") : tag.kind;
  return (
    exec.select().from(products).where(eq(products.slug, slug)).get() ??
    exec.select().from(products).where(eq(products.kind, tag.kind)).orderBy(products.sort, products.id).get() ??
    null
  );
}

/** Current price (millimes, promo included) of the product a stock link is sold as — the in-person sale default. */
export function salePriceForTag(exec: Executor, tag: Pick<Tag, "kind" | "label">): number | null {
  const p = productForTag(exec, tag);
  return p ? withSale(p).price : null;
}

/** Marker in orders.paymentMethod for a sale paid and handed over in person (no delivery). */
export const IN_PERSON_PAYMENT = "in_person";

/**
 * Record a sale made in person (stand handed over at the counter, paid there): one delivered order, one line, no
 * delivery fee, payment "in_person", no push notification (the owner is the one recording it). Delivered = the customer
 * earns the returning-customer discount like any delivered order (unless they already used it). Inside a transaction.
 */
export function insertInPersonSale(
  exec: Executor,
  input: { customer: Customer; tag: Pick<Tag, "code" | "kind" | "label">; price: number; destinationUrl: string },
): Order {
  const now = Date.now();
  const c = input.customer;
  const product = productForTag(exec, input.tag);
  const price = Math.max(0, Math.round(input.price));
  const order = exec
    .insert(orders)
    .values({
      number: nextOrderNumber(exec),
      customerId: c.id,
      status: "delivered",
      channel: "manual",
      locale: "fr",
      name: c.name,
      phone: c.phone,
      email: c.email,
      governorate: c.governorate ?? "",
      city: c.city ?? "",
      address: c.address ?? "",
      notes: `In-person sale — ${input.tag.code}`,
      subtotal: price,
      discount: 0,
      discountReason: null,
      deliveryFee: 0,
      total: price,
      paymentMethod: IN_PERSON_PAYMENT,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  exec
    .insert(orderItems)
    .values({
      orderId: order.id,
      productId: product?.id ?? null,
      productName: product?.nameFr ?? TAG_KIND_LABELS[input.tag.kind as TagKind],
      kind: product?.kind ?? input.tag.kind,
      unitPrice: price,
      qty: 1,
      lineTotal: price,
      businessName: c.businessName,
      destinationUrl: input.destinationUrl || null,
    })
    .run();
  if (!c.discountAvailable) {
    const used = exec
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.customerId, c.id), isNotNull(orders.discountReason), ne(orders.status, "cancelled")))
      .get();
    if (!used) {
      exec.update(customers).set({ discountAvailable: true }).where(eq(customers.id, c.id)).run();
      audit("customer.discount", { customerId: c.id, available: true, reason: `order ${order.number} in-person sale` }, exec);
    }
  }
  audit("order.create", { id: order.id, number: order.number, channel: "in_person", total: order.total, discount: 0, customerId: c.id, code: input.tag.code }, exec);
  return order;
}
