import "server-only";
// The physical side of smart links, as the owner works at a client's counter: find a stand by the code printed under
// its QR (look-alike tolerant), sell a stock stand without an order (existing or new customer, optional in-person
// sale), and return a wrongly assigned stand to stock. Stock = no customer and no destination (see stockCondition).
import { and, count, desc, eq, gte, inArray, isNotNull, ne, sql, type SQL } from "drizzle-orm";
import { getDb, type Executor } from "../db";
import { customers, destinationHistory, orderItems, orders, tags, taps } from "../db/schema";
import { CODE_ALPHABET, CODE_LENGTH, normalizePhone, standVariant, withStandColour } from "../lib/business";
import { audit } from "./audit";
import { DataError, NotFoundError } from "./errors";
import {
  assignStockTagTx,
  insertInPersonSale,
  IN_PERSON_PAYMENT,
  openOrdersNeeding,
  salePriceForTag,
  setOrderStatusTx,
  StockAssignError,
  type OpenOrderNeeding,
  type StockAssignResult,
} from "./orders";
import { onTagReassigned } from "./portal-tags";
import { printedCodes } from "./print-log";
import { clearTestTaps, isStockTag, normalizeCode, TAG_KIND_LABELS } from "./tags";
import type { ChipStatus, Customer, DestinationType, FieldErrors, Tag, TagKind, TagStatus } from "./types";
import { contains, DAY_MS, optText } from "./util";

// ---------------------------------------------------------------------------------------------------------------
// Labels

/** "Review stand (white)" / "Review stand (black)" / "NFC card"… — the product a link is, without any owner prefix. */
export function productLabel(t: Pick<Tag, "kind" | "label">): string {
  const v = standVariant(t);
  return v ? `Review stand (${v})` : TAG_KIND_LABELS[t.kind];
}

/** Display name of a customer: business first, then person. */
const displayName = (c: Pick<Customer, "name" | "businessName">) => c.businessName?.trim() || c.name;

// ---------------------------------------------------------------------------------------------------------------
// Find a stand

export type StandHit = {
  id: number;
  code: string;
  kind: TagKind;
  product: string;
  status: TagStatus;
  stock: boolean;
  chipStatus: ChipStatus;
  customerId: number | null;
  customerName: string | null;
  destinationType: DestinationType;
  destinationUrl: string;
  tapCount: number;
};

export type CustomerHit = {
  id: number;
  name: string;
  businessName: string | null;
  phone: string;
  stands: { id: number; code: string; kind: TagKind; product: string; status: TagStatus }[];
};

export type FindResult = {
  /** Code read from the input (uppercase, no spaces / dashes / "ONDE-" / link prefix). */
  code: string;
  /** The stand whose code was typed (exactly, or through an unambiguous look-alike reading). */
  exact: StandHit | null;
  /** Set when `exact` was found by reading look-alikes (e.g. typed O → stand has Q). */
  readAs: string | null;
  /** The input looks like a full code but no stand has it. */
  noSuchCode: boolean;
  /** Close codes (look-alikes / one typo) when the code was not found or was ambiguous. */
  suggestions: StandHit[];
  /** Other codes that differ from the found one only by look-alike characters (C/G/Q, U/V, M/N…): check the print. */
  lookalikes: StandHit[];
  /** Stands whose code contains a partial code (2–5 characters). */
  partial: StandHit[];
  /** Customers matching by name, business or phone, with their stands. */
  customers: CustomerHit[];
  /** Most recently changed stands (empty search). */
  recent: StandHit[];
};

const ALPHABET = new Set(CODE_ALPHABET.split(""));

/**
 * Characters that are not in the code alphabet, read as the alphabet characters they can be mistaken for on a small
 * print (the alphabet itself has no 0/O, 1/I/L, 2/Z, 5/S, 8/B).
 */
const READ_AS: Record<string, string> = {
  O: "QDCG",
  "0": "QDCG",
  I: "TJ7",
  L: "TJ7",
  "1": "TJ7",
  Z: "7",
  "2": "7",
  S: "693",
  "5": "693",
  B: "3RPE",
  "8": "3",
};

/** Visual look-alike groups inside (and around) the alphabet: a substitution inside a group is a cheap misread. */
const LOOKALIKE_GROUPS = ["CGQDO0", "UVY", "MNWH", "EF", "PR", "KX", "T7J1IL", "38B", "69G5S", "4A"];
const lookalike = (a: string, b: string) => LOOKALIKE_GROUPS.some((g) => g.includes(a) && g.includes(b));

/** Weighted edit distance: look-alike substitution 0.4, other edits 1. */
function codeDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const sub = a[i - 1] === b[j - 1] ? 0 : lookalike(a[i - 1], b[j - 1]) ? 0.4 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + sub);
    }
    prev = cur;
  }
  return prev[n];
}

/** "onde.tn/t/gjuh-pr", "ONDE-GJUHPR.png", " gj uh pr " → "GJUHPR". */
export function codeFromInput(raw: string): string {
  let v = String(raw ?? "").trim();
  const link = /\/t\/([A-Za-z0-9 -]{4,20})/.exec(v);
  if (link) v = link[1];
  v = v.toUpperCase().replace(/\.(PNG|PDF|SVG)$/, "");
  v = v.replace(/[^A-Z0-9]/g, "");
  if (v.startsWith("ONDE") && v.length >= 8) v = v.slice(4);
  return v.slice(0, 12);
}

type HitRow = { tag: Tag; customerName: string | null };

function toHit(r: HitRow): StandHit {
  const t = r.tag;
  return {
    id: t.id,
    code: t.code,
    kind: t.kind,
    product: productLabel(t),
    status: t.status,
    stock: isStockTag(t),
    chipStatus: t.chipStatus,
    customerId: t.customerId,
    customerName: r.customerName,
    destinationType: t.destinationType,
    destinationUrl: t.destinationUrl,
    tapCount: t.tapCount,
  };
}

function hitRows(exec: Executor, where: SQL | undefined, limit: number, order: "recent" | "code" = "code"): HitRow[] {
  return exec
    .select({ tag: tags, customerName: sql<string | null>`coalesce(${customers.businessName}, ${customers.name})` })
    .from(tags)
    .leftJoin(customers, eq(tags.customerId, customers.id))
    .where(where)
    .orderBy(...(order === "recent" ? [desc(tags.updatedAt), desc(tags.id)] : [tags.code]))
    .limit(limit)
    .all();
}

/**
 * "Find a stand": one box for the code printed under the QR (any case, spaces, dashes, "ONDE-" prefix or the full link),
 * a customer name / business / phone. A code is matched exactly; characters outside the alphabet are read as their
 * look-alikes (O → Q/D/C/G…) and the stand opens only when exactly one code fits. Otherwise close codes are suggested.
 */
export function findStands(rawQuery: string): FindResult {
  const db = getDb();
  const q = String(rawQuery ?? "").trim().slice(0, 100);
  const code = codeFromInput(q);
  const out: FindResult = { code, exact: null, readAs: null, noSuchCode: false, suggestions: [], lookalikes: [], partial: [], customers: [], recent: [] };
  if (!q) {
    out.recent = hitRows(db, undefined, 8, "recent").map(toHit);
    return out;
  }

  // Customers first (name, business, phone with 3+ digits): a business name such as "Barber" must not read as a
  // missing code.
  out.customers = customerHits(db, q);

  const codeLike = code.length >= 2 && code.length <= 8 && /^[A-Z0-9]+$/.test(code) && !/^\d+$/.test(code);
  if (codeLike) {
    const exact = hitRows(db, eq(tags.code, code), 1)[0];
    const all = code.length >= 5 ? db.select({ id: tags.id, code: tags.code }).from(tags).all() : [];
    const near = (max: number) =>
      all
        .map((t) => ({ id: t.id, d: codeDistance(code, t.code) }))
        .filter((x) => x.d > 0 && x.d <= max)
        .sort((a, b) => a.d - b.d)
        .slice(0, 6);
    const hits = (list: { id: number }[]) => {
      if (!list.length) return [];
      const byId = new Map(hitRows(db, inArray(tags.id, list.map((x) => x.id)), list.length).map((r) => [r.tag.id, r]));
      return list.map((x) => byId.get(x.id)).filter((r): r is HitRow => Boolean(r)).map(toHit);
    };
    if (exact) {
      out.exact = toHit(exact);
      // Another code that differs only by look-alike characters (C/G/Q, U/V, M/N…): the owner must check the print.
      out.lookalikes = hits(near(0.8));
    } else if (code.length >= 5) {
      // Look-alike reading: every character either equal or (outside the alphabet) one of its look-alikes.
      if (code.length === CODE_LENGTH && [...code].some((ch) => !ALPHABET.has(ch))) {
        const fits = all.filter((t) => [...code].every((ch, i) => t.code[i] === ch || (!ALPHABET.has(ch) && (READ_AS[ch] ?? "").includes(t.code[i]))));
        if (fits.length === 1) {
          out.exact = toHit(hitRows(db, eq(tags.id, fits[0].id), 1)[0]);
          out.readAs = fits[0].code;
          out.lookalikes = hits(near(0.8)).filter((h) => h.id !== fits[0].id);
        }
      }
      if (!out.exact) {
        // A 6-character input that matches no client is a code that doesn't exist (typo / misread).
        out.noSuchCode = code.length === CODE_LENGTH && !out.customers.length;
        // With client matches, only strong code suggestions (look-alike substitutions), not every 1-edit neighbour.
        out.suggestions = hits(near(out.customers.length ? 0.8 : code.length >= CODE_LENGTH ? 1.6 : 1.2));
      }
    }
    if (!out.exact && code.length <= 5) out.partial = hitRows(db, contains(tags.code, code), 10).map(toHit);
  }
  return out;
}

/** "Café Lumière" → "cafe lumiere": accents and case never matter (the owner types "lumiere" on a phone). */
const fold = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * Customers whose name or business contains the query (accent / case insensitive, 2+ characters, not only digits) or
 * whose phone contains its digits (3+), newest first, at most 6, with their stands. The customer list is small (one
 * row per client), so it is filtered here rather than with LIKE (SQLite's LIKE is not accent-insensitive).
 */
function customerHits(db: Executor, q: string): CustomerHit[] {
  const term = fold(q);
  const digits = q.replace(/\D/g, "");
  const textOk = term.length >= 2 && !/^[\d\s+-]+$/.test(q);
  const phone = digits.length > 8 ? (normalizePhone(digits) ?? digits) : digits;
  const phoneOk = digits.length >= 3;
  if (!textOk && !phoneOk) return [];
  const cs = db
    .select({ id: customers.id, name: customers.name, businessName: customers.businessName, phone: customers.phone })
    .from(customers)
    .orderBy(desc(customers.createdAt), desc(customers.id))
    .all()
    .filter(
      (c) =>
        (textOk && (fold(c.name).includes(term) || fold(c.businessName ?? "").includes(term))) || (phoneOk && c.phone.includes(phone)),
    )
    .slice(0, 6);
  if (!cs.length) return [];
  const own = db
    .select()
    .from(tags)
    .where(inArray(tags.customerId, cs.map((c) => c.id)))
    .orderBy(tags.code)
    .all();
  return cs.map((c) => ({
    ...c,
    stands: own.filter((t) => t.customerId === c.id).map((t) => ({ id: t.id, code: t.code, kind: t.kind, product: productLabel(t), status: t.status })),
  }));
}

// ---------------------------------------------------------------------------------------------------------------
// Sell a stock stand (no order needed)

export type SellSale =
  | { mode: "none" }
  | { mode: "new"; price: number }
  /** `replace`: the order's unprinted code this stand replaces (see openOrdersNeeding). */
  | { mode: "order"; orderId: number; replace?: string };

export type SellInput = {
  /** The stock link: by id, or by the code printed under its QR. */
  tagId?: number;
  code?: string;
  /** An existing customer… */
  customerId?: number;
  /** …or a new one (matched to an existing customer when the phone is already known). */
  newCustomer?: { name?: string; businessName?: string; phone: string };
  /** Normalized destination ("" or undefined = none yet; the stand is still sold to the customer). */
  destinationUrl?: string;
  destinationType?: DestinationType;
  sale: SellSale;
};

export type SellResult = {
  tag: Tag;
  customer: Customer;
  createdCustomer: boolean;
  /** A "new customer" whose phone was already known: the existing customer was used. */
  matchedByPhone: boolean;
  order: { id: number; number: string } | null;
  /** The stock link was disabled and is now live. */
  activated: boolean;
};

/** Business rule failures of a sale. `code`: unknown_code | not_in_stock | customer | order. */
export class SellError extends DataError {
  constructor(
    code: "unknown_code" | "not_in_stock" | "customer" | "order",
    fields?: FieldErrors,
    readonly detail?: { code?: string; owner?: string | null; suggestions?: string[]; reason?: string },
  ) {
    super(code, fields);
    this.name = "SellError";
  }
}

const MAX_PRICE = 10_000_000; // 10,000 DT

/**
 * Sell a stock stand at the counter, in one transaction: resolve or create the customer (a new customer whose phone is
 * already known reuses that customer), give the link the customer, the label "<business> — <product>", the destination
 * when given, status active, clear its test taps, and optionally record the sale — attach it to one of the customer's
 * open orders that waits for this product, or record a new in-person sale (delivered order, no delivery fee).
 */
export function sellStockTag(input: SellInput): SellResult {
  const db = getDb();
  return db.transaction(
    (tx) => {
      const code = input.code ? normalizeCode(input.code) : "";
      const tag = input.tagId
        ? tx.select().from(tags).where(eq(tags.id, input.tagId)).get()
        : code
          ? tx.select().from(tags).where(eq(tags.code, code)).get()
          : undefined;
      if (!tag) {
        const near = code ? findStands(code).suggestions.filter((s) => s.stock).map((s) => s.code) : [];
        throw new SellError("unknown_code", { code: "invalid" }, { code, suggestions: near });
      }
      if (!isStockTag(tag)) {
        const owner = tag.customerId ? tx.select().from(customers).where(eq(customers.id, tag.customerId)).get() : null;
        throw new SellError("not_in_stock", { code: "taken" }, { code: tag.code, owner: owner ? displayName(owner) : null });
      }

      // Customer
      let customer: Customer | undefined;
      let createdCustomer = false;
      let matchedByPhone = false;
      if (input.customerId) {
        customer = tx.select().from(customers).where(eq(customers.id, input.customerId)).get();
        if (!customer) throw new SellError("customer", { customerId: "invalid" });
      } else if (input.newCustomer) {
        const fields: FieldErrors = {};
        const phone = normalizePhone(input.newCustomer.phone ?? "");
        const business = optText(input.newCustomer.businessName, 120);
        const name = optText(input.newCustomer.name, 120) ?? business;
        if (!phone) fields["newCustomer.phone"] = "invalid_phone";
        if (!name) fields["newCustomer.name"] = "required";
        if (Object.keys(fields).length) throw new SellError("customer", fields);
        customer = tx.select().from(customers).where(eq(customers.phone, phone!)).get();
        if (customer) {
          matchedByPhone = true;
          if (business && !customer.businessName) {
            customer = tx.update(customers).set({ businessName: business }).where(eq(customers.id, customer.id)).returning().get();
          }
        } else {
          customer = tx
            .insert(customers)
            .values({ name: name!, phone: phone!, businessName: business, discountAvailable: false, createdAt: Date.now() })
            .returning()
            .get();
          createdCustomer = true;
          audit("customer.create", { id: customer.id, source: "stand_sale", code: tag.code }, tx);
        }
      } else throw new SellError("customer", { customerId: "required" });

      const url = input.destinationUrl ?? "";
      let order: { id: number; number: string } | null = null;
      let result: Pick<StockAssignResult, "tag" | "activated">;

      if (input.sale.mode === "order") {
        const o = tx.select().from(orders).where(eq(orders.id, input.sale.orderId)).get();
        if (!o || o.customerId !== customer.id) throw new SellError("order", { orderId: "invalid" });
        try {
          result = assignStockTagTx(tx, o, tag, { replace: input.sale.replace, destinationUrl: url || undefined, destinationType: input.destinationType });
        } catch (e) {
          if (e instanceof StockAssignError) throw new SellError("order", { orderId: "invalid" }, { reason: e.reason, code: e.replaceCode });
          throw e;
        }
        order = { id: o.id, number: o.number };
      } else {
        const now = Date.now();
        const activated = tag.status !== "active";
        clearTestTaps(tx, tag);
        let orderId: number | null = null;
        if (input.sale.mode === "new") {
          const price = Math.round(Number(input.sale.price));
          if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE) throw new SellError("order", { price: "invalid" });
          const o = insertInPersonSale(tx, { customer, tag, price, destinationUrl: url });
          orderId = o.id;
          order = { id: o.id, number: o.number };
          customer = tx.select().from(customers).where(eq(customers.id, customer.id)).get() ?? customer;
        }
        const type = url ? (input.destinationType ?? tag.destinationType) : tag.destinationType;
        // New owner: client-page state starts fresh (customer_since, no location label, no stale pending request).
        onTagReassigned(tx, tag, tag.customerId, customer.id, now);
        const updated = tx
          .update(tags)
          .set({
            customerId: customer.id,
            orderId,
            label: `${displayName(customer)} — ${withStandColour(tag)}`.slice(0, 120),
            ...(url ? { destinationUrl: url, destinationType: type } : {}),
            status: "active",
            updatedAt: now,
          })
          .where(eq(tags.id, tag.id))
          .returning()
          .get();
        if (url) {
          tx.insert(destinationHistory)
            .values({ tagId: tag.id, fromType: tag.destinationType, fromUrl: tag.destinationUrl, toType: type, toUrl: url, changedAt: now })
            .run();
          audit("tag.destination", { id: tag.id, code: tag.code, from: { type: tag.destinationType, url: tag.destinationUrl }, to: { type, url } }, tx);
        }
        if (activated) audit("tag.status", { id: tag.id, code: tag.code, status: "active", reason: "sold" }, tx);
        result = { tag: updated, activated };
      }
      audit(
        "tag.sell",
        { id: tag.id, code: tag.code, customerId: customer.id, newCustomer: createdCustomer, order: order?.number ?? null, sale: input.sale.mode, destination: url || null },
        tx,
      );
      return { tag: result.tag, customer, createdCustomer, matchedByPhone, order, activated: result.activated };
    },
    { behavior: "immediate" },
  );
}

/**
 * What the sell form needs once a customer is picked: the default price, their open orders waiting for this product,
 * and the review link we already know for them (latest Google review link of one of their stands, else the latest link
 * they gave on an order line) — pre-filled so a returning client's second stand is one tap.
 */
export function sellOptions(
  tagId: number,
  customerId: number | null,
): {
  price: number | null;
  openOrders: OpenOrderNeeding[];
  knownUrl: string | null;
} {
  const db = getDb();
  const tag = db.select().from(tags).where(eq(tags.id, tagId)).get();
  if (!tag) throw new NotFoundError("tag");
  let knownUrl: string | null = null;
  if (customerId) {
    knownUrl =
      db
        .select({ url: tags.destinationUrl })
        .from(tags)
        .where(and(eq(tags.customerId, customerId), eq(tags.destinationType, "google_review"), ne(tags.destinationUrl, "")))
        .orderBy(desc(tags.updatedAt), desc(tags.id))
        .get()?.url ??
      db
        .select({ url: orderItems.destinationUrl })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(and(eq(orders.customerId, customerId), isNotNull(orderItems.destinationUrl), ne(orderItems.destinationUrl, "")))
        .orderBy(desc(orders.createdAt), desc(orderItems.id))
        .get()?.url ??
      null;
  }
  return { price: salePriceForTag(db, tag), openOrders: customerId ? openOrdersNeeding(db, customerId, tag) : [], knownUrl };
}

// ---------------------------------------------------------------------------------------------------------------
// Return to stock (undo a wrong assignment)

export type ReleaseResult = {
  tag: Tag;
  removedTaps: number;
  customer: string | null;
  order: { id: number; number: string } | null;
  /** The in-person sale of this stand was cancelled with it (`cancelSale`). */
  cancelledSale: { id: number; number: string } | null;
};

/**
 * The in-person sale this link was handed over with (Sell this stand → Paid in person now), when it is still counted:
 * an order paid in person, not cancelled, whose only smart link is this one. Return to stock offers to cancel it.
 */
export function inPersonSaleOf(exec: Executor, tag: Pick<Tag, "id" | "orderId">): { id: number; number: string; total: number } | null {
  if (!tag.orderId) return null;
  const o = exec
    .select({ id: orders.id, number: orders.number, total: orders.total, status: orders.status, paymentMethod: orders.paymentMethod })
    .from(orders)
    .where(eq(orders.id, tag.orderId))
    .get();
  if (!o || o.paymentMethod !== IN_PERSON_PAYMENT || o.status === "cancelled") return null;
  const others = exec
    .select({ n: count() })
    .from(tags)
    .where(and(eq(tags.orderId, o.id), ne(tags.id, tag.id)))
    .get();
  return others?.n ? null : { id: o.id, number: o.number, total: o.total };
}

/**
 * Undo a sale / wrong assignment: the link goes back to stock exactly like a fresh stock link — no customer, no order,
 * no destination, product label without the owner ("Review stand (white)"), active, 0 taps. Taps recorded while it
 * was assigned are deleted with it (a stock link's taps are chip tests and never count in the dashboard, and the next
 * sale starts at 0), so every figure stays consistent. The order it belonged to gets that unit back as "missing" (Use
 * a stock stand / Create missing links). History + audit keep the trace. One transaction.
 * `cancelSale`: when the link was sold in person (inPersonSaleOf) — e.g. to the wrong client — that sale is cancelled in
 * the same transaction (revenue drops it, and a returning-customer discount it granted is revoked), so selling the stand
 * again never counts it twice.
 */
export function releaseToStock(tagId: number, opts: { cancelSale?: boolean } = {}): ReleaseResult {
  const db = getDb();
  return db.transaction(
    (tx) => {
      const tag = tx.select().from(tags).where(eq(tags.id, tagId)).get();
      if (!tag) throw new NotFoundError("tag");
      if (isStockTag(tag)) throw new DataError("already_stock");
      const owner = tag.customerId ? tx.select().from(customers).where(eq(customers.id, tag.customerId)).get() : null;
      const order = tag.orderId ? (tx.select({ id: orders.id, number: orders.number }).from(orders).where(eq(orders.id, tag.orderId)).get() ?? null) : null;
      const sale = opts.cancelSale ? inPersonSaleOf(tx, tag) : null;
      const now = Date.now();
      const removedTaps = tx.delete(taps).where(eq(taps.tagId, tag.id)).run().changes;
      const label = productLabel(tag);
      // The client-page state goes with the owner: their location label and pending request must not reach the next one.
      onTagReassigned(tx, tag, tag.customerId, null, now);
      const updated = tx
        .update(tags)
        .set({
          customerId: null,
          orderId: null,
          destinationUrl: "",
          destinationType: "google_review",
          label,
          status: "active",
          tapCount: 0,
          lastTapAt: null,
          updatedAt: now,
        })
        .where(eq(tags.id, tag.id))
        .returning()
        .get();
      if (tag.destinationUrl) {
        tx.insert(destinationHistory)
          .values({ tagId: tag.id, fromType: tag.destinationType, fromUrl: tag.destinationUrl, toType: "google_review", toUrl: "", changedAt: now })
          .run();
      }
      if (sale) setOrderStatusTx(tx, sale.id, "cancelled");
      audit(
        "tag.release",
        {
          id: tag.id,
          code: tag.code,
          customerId: tag.customerId,
          customer: owner ? displayName(owner) : null,
          order: order?.number ?? null,
          destination: tag.destinationUrl || null,
          label: tag.label,
          status: tag.status,
          taps: removedTaps,
          ...(sale ? { cancelledSale: sale.number } : {}),
        },
        tx,
      );
      return { tag: updated, removedTaps, customer: owner ? displayName(owner) : null, order, cancelledSale: sale ? { id: sale.id, number: sale.number } : null };
    },
    { behavior: "immediate" },
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Customer page: their stands with figures

export type StandStats = { taps30d: number; printedAt: number | null };

/** 30-day taps and last print date for a set of links (customer page, QR page). */
export function standStats(list: Pick<Tag, "id" | "code">[]): Map<number, StandStats> {
  const out = new Map<number, StandStats>();
  if (!list.length) return out;
  const ids = list.map((t) => t.id);
  const d30 = Date.now() - 30 * DAY_MS;
  const rows = getDb()
    .select({ tagId: taps.tagId, n: count() })
    .from(taps)
    .where(and(inArray(taps.tagId, ids), gte(taps.ts, d30)))
    .groupBy(taps.tagId)
    .all();
  const recent = new Map(rows.map((r) => [r.tagId, Number(r.n)]));
  const printed = printedCodes();
  for (const t of list) out.set(t.id, { taps30d: recent.get(t.id) ?? 0, printedAt: printed.get(t.code) ?? null });
  return out;
}
