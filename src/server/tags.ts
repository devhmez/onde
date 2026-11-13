import "server-only";
import { randomInt } from "node:crypto";
import { and, asc, count, desc, eq, gte, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { getDb, type Executor } from "../db";
import { auditLog, customers, destinationHistory, orders, tags, taps } from "../db/schema";
import { CODE_ALPHABET, CODE_LENGTH, DEMO_CODES } from "../lib/business";
import { guessDestinationType as guessType, reconcileDestinationType } from "../lib/destination-type";
import { isBot, parseDevice } from "../lib/ua";
import { audit } from "./audit";
import { DataError, NotFoundError } from "./errors";
import { onTagReassigned } from "./portal-tags";
import {
  CHIP_STATUSES,
  DESTINATION_TYPES,
  TAG_KINDS,
  TAG_STATUSES,
  type Customer,
  type DestinationHistory,
  type DestinationType,
  type FieldErrors,
  type Tag,
  type TagKind,
  type TagStatus,
} from "./types";
import { clampInt, contains, dailyHash, DAY_MS, optText, referrerOrigin } from "./util";

// ---------------------------------------------------------------------------------------------------------------
// Smart-link helpers

/** Public base URL of the smart links (no trailing slash). */
export function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL?.trim() || "https://onde.tn").replace(/\/+$/, "");
}

/** Permanent smart link written to the chip: `https://onde.tn/t/CODE`. */
export function smartLink(code: string): string {
  return `${publicBaseUrl()}/t/${code}`;
}

/** Same link marked as a QR scan (`?s=qr`) so analytics can split NFC vs QR. Encode this in printed QR codes. */
export function smartLinkQr(code: string): string {
  return `${smartLink(code)}?s=qr`;
}

/** Uppercase + strip anything that is not a letter/digit (codes are typed by humans sometimes). */
export function normalizeCode(raw: string): string {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
}

export function generateCode(): string {
  for (;;) {
    let s = "";
    for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!DEMO_CODES.has(s)) return s; // demo codes shown in marketing videos are never handed to a customer
  }
}

/** A code not present in the DB nor in `reserved` (retries on collision). */
export function uniqueCode(exec: Executor, reserved?: Set<string>): string {
  for (let i = 0; i < 50; i++) {
    const code = generateCode();
    if (reserved?.has(code)) continue;
    const hit = exec.select({ id: tags.id }).from(tags).where(eq(tags.code, code)).get();
    if (!hit) {
      reserved?.add(code);
      return code;
    }
  }
  throw new Error("Could not allocate a unique smart-link code");
}

// ---------------------------------------------------------------------------------------------------------------
// Destinations

/**
 * Normalize a destination: trims, adds https:// to bare domains, allows http(s)/tel/mailto/sms only.
 * Returns "" for empty input and null when invalid.
 */
export function normalizeDestinationUrl(raw: string | null | undefined): string | null {
  let v = String(raw ?? "").trim();
  if (!v) return "";
  if (v.length > 2000) return null;
  if (/^(tel|mailto|sms):/i.test(v)) {
    return /^(tel|sms):\+?[\d\s().-]{6,20}$/i.test(v) || /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+/i.test(v) ? v : null;
  }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) {
    if (/^[\w-]+(\.[\w-]+)+([/?#:]|$)/.test(v)) v = `https://${v}`;
    else return null;
  }
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".") || u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Guess the destination type from a URL (shared with the admin UI: src/lib/destination-type.ts). */
export function guessDestinationType(url: string): DestinationType {
  return guessType(url);
}

export const TAG_KIND_LABELS: Record<TagKind, string> = {
  stand: "Review stand",
  card: "NFC card",
  keychain: "Keychain",
  sticker: "Sticker",
};

// ---------------------------------------------------------------------------------------------------------------
// Queries

export type TagListFilter = {
  q?: string;
  status?: TagStatus;
  kind?: TagKind;
  customerId?: number;
  /** Only stock links: no customer and no destination yet (made in advance, printed, waiting for a buyer). */
  stock?: boolean;
  limit?: number;
  offset?: number;
};

/** SQL condition for "in stock": not assigned to a customer and no destination yet. */
export const stockCondition = (): SQL => and(isNull(tags.customerId), eq(tags.destinationUrl, "")) as SQL;

/** Same rule as `stockCondition`, for a loaded row. */
export const isStockTag = (t: Pick<Tag, "customerId" | "destinationUrl">): boolean => t.customerId == null && !t.destinationUrl;

/** Number of stock links per kind (order page: "use a stock stand" instead of minting new codes). */
export function countStockByKind(): Partial<Record<TagKind, number>> {
  const rows = getDb().select({ kind: tags.kind, n: count() }).from(tags).where(stockCondition()).groupBy(tags.kind).all();
  return Object.fromEntries(rows.map((r) => [r.kind, Number(r.n)]));
}

/**
 * A stock link leaves the stock (gets a customer or a destination): its taps so far were chip tests by the owner, not
 * the customer's — delete them and reset the counters so the customer's numbers start at zero. Inside a transaction.
 */
export function clearTestTaps(exec: Executor, tag: Pick<Tag, "id" | "code" | "tapCount">): void {
  const removed = exec.delete(taps).where(eq(taps.tagId, tag.id)).run().changes;
  exec.update(tags).set({ tapCount: 0, lastTapAt: null }).where(eq(tags.id, tag.id)).run();
  if (removed || tag.tapCount) audit("tag.test_taps_cleared", { id: tag.id, code: tag.code, taps: removed }, exec);
}

export async function listTags(f: TagListFilter = {}): Promise<{ rows: (Tag & { customerName: string | null })[]; total: number }> {
  const db = getDb();
  const conds: SQL[] = [];
  if (f.status && TAG_STATUSES.includes(f.status)) conds.push(eq(tags.status, f.status));
  if (f.kind && TAG_KINDS.includes(f.kind)) conds.push(eq(tags.kind, f.kind));
  if (f.customerId) conds.push(eq(tags.customerId, f.customerId));
  if (f.stock) conds.push(stockCondition());
  const q = f.q?.trim();
  if (q) {
    const term = or(
      contains(tags.code, q.toUpperCase()),
      contains(tags.label, q),
      contains(tags.destinationUrl, q),
      contains(customers.name, q),
      contains(customers.businessName, q),
      contains(customers.phone, q.replace(/\s/g, "")),
    );
    if (term) conds.push(term);
  }
  const where = conds.length ? and(...conds) : undefined;
  const limit = clampInt(f.limit, 1, 1000, 50);
  const offset = clampInt(f.offset, 0, 1_000_000, 0);

  const rows = db
    .select({ tag: tags, customerName: sql<string | null>`coalesce(${customers.businessName}, ${customers.name})` })
    .from(tags)
    .leftJoin(customers, eq(tags.customerId, customers.id))
    .where(where)
    .orderBy(desc(tags.createdAt), desc(tags.id))
    .limit(limit)
    .offset(offset)
    .all();
  const total =
    db.select({ n: count() }).from(tags).leftJoin(customers, eq(tags.customerId, customers.id)).where(where).get()?.n ?? 0;
  return { rows: rows.map((r) => ({ ...r.tag, customerName: r.customerName ?? null })), total };
}

/** Tags by id (unknown ids are skipped), ordered by code — e.g. a selection to print. */
export async function listTagsByIds(ids: number[]): Promise<(Tag & { customerName: string | null })[]> {
  const unique = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 1000);
  if (!unique.length) return [];
  const rows = getDb()
    .select({ tag: tags, customerName: sql<string | null>`coalesce(${customers.businessName}, ${customers.name})` })
    .from(tags)
    .leftJoin(customers, eq(tags.customerId, customers.id))
    .where(inArray(tags.id, unique))
    .orderBy(asc(tags.code))
    .all();
  return rows.map((r) => ({ ...r.tag, customerName: r.customerName ?? null }));
}

/**
 * When this code last went out in a print download (stand file, print pack, QR download or A4 sheet — the audit log is
 * the record, see ./print-log). Null = never printed.
 */
export function lastPrintedAt(code: string, exec: Executor = getDb()): number | null {
  const c = normalizeCode(code);
  if (!c) return null;
  const row = exec
    .select({ ts: sql<number | null>`max(${auditLog.ts})` })
    .from(auditLog)
    .where(and(inArray(auditLog.action, ["print.zip", "print.file", "print.sheet"]), contains(auditLog.details, `"${c}"`)))
    .get();
  return row?.ts ?? null;
}

/** By numeric id, or by code when given a string. */
export async function getTag(
  idOrCode: number | string,
): Promise<
  | (Tag & {
      customer: Customer | null;
      history: DestinationHistory[];
      taps30d: number;
      order: { id: number; number: string; status: string } | null;
      printedAt: number | null;
    })
  | null
> {
  const db = getDb();
  const tag =
    typeof idOrCode === "number"
      ? db.select().from(tags).where(eq(tags.id, idOrCode)).get()
      : db.select().from(tags).where(eq(tags.code, normalizeCode(idOrCode))).get();
  if (!tag) return null;
  const customer = tag.customerId ? (db.select().from(customers).where(eq(customers.id, tag.customerId)).get() ?? null) : null;
  const history = db
    .select()
    .from(destinationHistory)
    .where(eq(destinationHistory.tagId, tag.id))
    .orderBy(desc(destinationHistory.changedAt), desc(destinationHistory.id))
    .all();
  const taps30d =
    db
      .select({ n: count() })
      .from(taps)
      .where(and(eq(taps.tagId, tag.id), gte(taps.ts, Date.now() - 30 * DAY_MS)))
      .get()?.n ?? 0;
  const order = tag.orderId
    ? (db.select({ id: orders.id, number: orders.number, status: orders.status }).from(orders).where(eq(orders.id, tag.orderId)).get() ?? null)
    : null;
  return { ...tag, customer, history, taps30d, order, printedAt: lastPrintedAt(tag.code, db) };
}

// ---------------------------------------------------------------------------------------------------------------
// Mutations

export type CreateTagInput = {
  kind: TagKind;
  label?: string;
  customerId?: number;
  orderId?: number;
  destinationType: DestinationType;
  destinationUrl: string;
  notes?: string;
};

/** Insert one tag row with a fresh unique code (+ initial destination history). Used by createTag and order fulfilment. */
export function insertTag(
  exec: Executor,
  input: {
    kind: TagKind;
    label: string;
    customerId: number | null;
    orderId: number | null;
    destinationType: DestinationType;
    destinationUrl: string;
    notes: string | null;
    status?: TagStatus;
  },
  reserved?: Set<string>,
): Tag {
  const now = Date.now();
  const code = uniqueCode(exec, reserved);
  const row = exec
    .insert(tags)
    .values({
      code,
      label: input.label,
      kind: input.kind,
      customerId: input.customerId,
      orderId: input.orderId,
      destinationType: input.destinationType,
      destinationUrl: input.destinationUrl,
      status: input.status ?? "active",
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  if (row.destinationUrl) {
    exec
      .insert(destinationHistory)
      .values({ tagId: row.id, fromType: null, fromUrl: null, toType: row.destinationType, toUrl: row.destinationUrl, changedAt: now })
      .run();
  }
  return row;
}

export async function createTag(input: CreateTagInput): Promise<Tag> {
  const fields: FieldErrors = {};
  if (!TAG_KINDS.includes(input.kind)) fields.kind = "invalid";
  const url = normalizeDestinationUrl(input.destinationUrl);
  if (url == null) fields.destinationUrl = "invalid_url";
  const type = input.destinationType && DESTINATION_TYPES.includes(input.destinationType)
    ? input.destinationType
    : guessDestinationType(url ?? "");
  if (input.destinationType && !DESTINATION_TYPES.includes(input.destinationType)) fields.destinationType = "invalid";
  const label = optText(input.label, 120);
  const db = getDb();
  if (input.customerId != null) {
    const c = db.select({ id: customers.id }).from(customers).where(eq(customers.id, input.customerId)).get();
    if (!c) fields.customerId = "invalid";
  }
  if (Object.keys(fields).length) throw new DataError("validation", fields);

  const row = db.transaction((tx) =>
    insertTag(tx, {
      kind: input.kind,
      label: label ?? TAG_KIND_LABELS[input.kind],
      customerId: input.customerId ?? null,
      orderId: input.orderId ?? null,
      destinationType: type,
      destinationUrl: url ?? "",
      notes: optText(input.notes, 1000),
    }),
  );
  audit("tag.create", { id: row.id, code: row.code, kind: row.kind, destination: row.destinationUrl });
  return row;
}

export const MAX_STOCK_BATCH = 200;

/**
 * Create `count` stock links at once (no customer, no destination): codes to print on stands and write to chips in
 * advance. Taps show the branded "not activated yet" page until the link is assigned and given a destination.
 */
export async function createStockTags(input: { kind: TagKind; count: number; label?: string; notes?: string }): Promise<Tag[]> {
  const fields: FieldErrors = {};
  if (!TAG_KINDS.includes(input.kind)) fields.kind = "invalid";
  const n = Math.trunc(Number(input.count));
  if (!Number.isFinite(n) || n < 1) fields.count = "invalid";
  else if (n > MAX_STOCK_BATCH) fields.count = "too_many";
  if (Object.keys(fields).length) throw new DataError("validation", fields);
  const label = optText(input.label, 120) ?? TAG_KIND_LABELS[input.kind];
  const notes = optText(input.notes, 1000);
  const db = getDb();
  const created = db.transaction((tx) => {
    const reserved = new Set<string>();
    const rows: Tag[] = [];
    for (let i = 0; i < n; i++) {
      rows.push(
        insertTag(
          tx,
          { kind: input.kind, label, customerId: null, orderId: null, destinationType: "google_review", destinationUrl: "", notes },
          reserved,
        ),
      );
    }
    audit("tag.stock", { kind: input.kind, label, count: rows.length, codes: rows.map((r) => r.code) }, tx);
    return rows;
  });
  return created;
}

export type UpdateTagPatch = Partial<
  Pick<Tag, "label" | "customerId" | "orderId" | "destinationType" | "destinationUrl" | "status" | "notes" | "kind" | "chipStatus">
>;

/** Who changed a destination (destination_history.actor): the owner in admin, or the client from their client page. */
export type DestinationActor = "owner" | "client";

/**
 * Update a tag. When the destination (type or URL) changes, a destination_history row and an audit entry are written.
 * If only `destinationUrl` is given, the type is re-guessed from the URL. Selling a stock link (it gets a customer or
 * a destination) clears its test taps (clearTestTaps). `opts.actor` is recorded on the history row and the audit entry.
 */
export async function updateTag(id: number, patch: UpdateTagPatch, opts: { actor?: DestinationActor } = {}): Promise<Tag> {
  const db = getDb();
  const current = db.select().from(tags).where(eq(tags.id, id)).get();
  if (!current) throw new NotFoundError("tag");

  const fields: FieldErrors = {};
  const set: Partial<typeof tags.$inferInsert> = {};

  if (patch.label !== undefined) set.label = optText(patch.label, 120) ?? "";
  if (patch.notes !== undefined) set.notes = optText(patch.notes, 1000);
  if (patch.kind !== undefined) {
    if (TAG_KINDS.includes(patch.kind)) set.kind = patch.kind;
    else fields.kind = "invalid";
  }
  if (patch.status !== undefined) {
    if (TAG_STATUSES.includes(patch.status)) set.status = patch.status;
    else fields.status = "invalid";
  }
  if (patch.customerId !== undefined) {
    if (patch.customerId === null) set.customerId = null;
    else if (db.select({ id: customers.id }).from(customers).where(eq(customers.id, patch.customerId)).get()) set.customerId = patch.customerId;
    else fields.customerId = "invalid";
  }
  if (patch.orderId !== undefined) {
    if (patch.orderId === null) set.orderId = null;
    else if (db.select({ id: orders.id }).from(orders).where(eq(orders.id, patch.orderId)).get()) set.orderId = patch.orderId;
    else fields.orderId = "invalid";
  }
  if (patch.destinationUrl !== undefined) {
    const url = normalizeDestinationUrl(patch.destinationUrl);
    if (url == null) fields.destinationUrl = "invalid_url";
    else set.destinationUrl = url;
  }
  if (patch.chipStatus !== undefined) {
    if (CHIP_STATUSES.includes(patch.chipStatus)) {
      if (patch.chipStatus !== current.chipStatus) {
        set.chipStatus = patch.chipStatus;
        set.chipAt = Date.now();
      }
    } else fields.chipStatus = "invalid";
  }
  if (patch.destinationType !== undefined) {
    if (DESTINATION_TYPES.includes(patch.destinationType)) {
      // A pasted URL that clearly belongs to a platform wins over a contradicting pick (Instagram link ≠ "Google Reviews").
      const url = set.destinationUrl ?? current.destinationUrl;
      set.destinationType = set.destinationUrl !== undefined ? (reconcileDestinationType(patch.destinationType, url) as DestinationType) : patch.destinationType;
    } else fields.destinationType = "invalid";
  } else if (set.destinationUrl !== undefined && set.destinationUrl !== current.destinationUrl) {
    set.destinationType = guessDestinationType(set.destinationUrl);
  }
  if (Object.keys(fields).length) throw new DataError("validation", fields);

  const nextType = set.destinationType ?? current.destinationType;
  const nextUrl = set.destinationUrl ?? current.destinationUrl;
  const destinationChanged = nextType !== current.destinationType || nextUrl !== current.destinationUrl;
  const sold = isStockTag(current) && !isStockTag({ customerId: set.customerId !== undefined ? set.customerId : current.customerId, destinationUrl: nextUrl });
  const now = Date.now();

  const row = db.transaction((tx) => {
    if (sold) clearTestTaps(tx, current);
    if (set.customerId !== undefined && set.customerId !== current.customerId) onTagReassigned(tx, current, current.customerId, set.customerId, now);
    const updated = tx.update(tags).set({ ...set, updatedAt: now }).where(eq(tags.id, id)).returning().get();
    if (destinationChanged) {
      tx.insert(destinationHistory)
        .values({ tagId: id, fromType: current.destinationType, fromUrl: current.destinationUrl, toType: nextType, toUrl: nextUrl, changedAt: now, actor: opts.actor ?? null })
        .run();
      audit("tag.destination", { id, code: current.code, from: { type: current.destinationType, url: current.destinationUrl }, to: { type: nextType, url: nextUrl }, ...(opts.actor ? { actor: opts.actor } : {}) }, tx);
    }
    if (set.status && set.status !== current.status) audit("tag.status", { id, code: current.code, status: set.status }, tx);
    if (set.chipStatus) audit("tag.chip", { id, code: current.code, from: current.chipStatus, to: set.chipStatus }, tx);
    return updated;
  });
  return row;
}

export async function deleteTag(id: number): Promise<void> {
  const db = getDb();
  const current = db.select({ id: tags.id, code: tags.code }).from(tags).where(eq(tags.id, id)).get();
  if (!current) throw new NotFoundError("tag");
  db.delete(tags).where(eq(tags.id, id)).run(); // taps + destination_history cascade
  audit("tag.delete", { id, code: current.code });
}

// ---------------------------------------------------------------------------------------------------------------
// Smart-link hot path

/**
 * Look a code up for the redirect. "active" with an empty `url` = not configured yet (e.g. a stock link): the
 * caller shows the "not activated yet" page. `kind` lets that page name the product ("ce présentoir…").
 */
export async function resolveTag(
  code: string,
): Promise<{ status: "active" | "disabled" | "missing"; url?: string; tagId?: number; kind?: TagKind }> {
  const c = normalizeCode(code);
  if (c.length < 4) return { status: "missing" };
  const row = getDb()
    .select({ id: tags.id, status: tags.status, url: tags.destinationUrl, kind: tags.kind })
    .from(tags)
    .where(eq(tags.code, c))
    .get();
  if (!row) return { status: "missing" };
  if (row.status !== "active") return { status: "disabled", tagId: row.id, kind: row.kind };
  return { status: "active", url: row.url, tagId: row.id, kind: row.kind };
}

/**
 * Log one tap (never throws). Bots / link previewers are ignored, and a repeat from the same visitor on the same tag
 * within 5 s (double NFC read) is collapsed. Only the referrer origin and a daily-salted IP hash are stored.
 */
export async function recordTap(input: {
  tagId: number;
  source: "nfc" | "qr";
  userAgent: string | null;
  referer: string | null;
  ip: string | null;
}): Promise<void> {
  try {
    if (isBot(input.userAgent)) return;
    const now = Date.now();
    const device = parseDevice(input.userAgent);
    const ipHash = input.ip ? dailyHash(input.ip) : null;
    const referer = referrerOrigin(input.referer);
    const db = getDb();
    db.transaction((tx) => {
      if (ipHash) {
        const dup = tx
          .select({ id: taps.id })
          .from(taps)
          .where(and(eq(taps.tagId, input.tagId), eq(taps.ipHash, ipHash), gte(taps.ts, now - 5000)))
          .get();
        if (dup) return;
      }
      tx.insert(taps).values({ tagId: input.tagId, ts: now, source: input.source, device, referer, ipHash }).run();
      tx.update(tags)
        .set({ tapCount: sql`${tags.tapCount} + 1`, lastTapAt: now })
        .where(eq(tags.id, input.tagId))
        .run();
      // A real NFC tap proves the chip is written and works: "not written" / "written" → "tested" (locked stays locked).
      // A phone opening a chip's URL has no referrer; a click on a link to /t/CODE (e.g. the "try again" button of the
      // "not activated" page reached by a QR scan) has one and proves nothing about the chip.
      if (input.source === "nfc" && !referer) {
        tx.update(tags)
          .set({ chipStatus: "tested", chipAt: now })
          .where(and(eq(tags.id, input.tagId), inArray(tags.chipStatus, ["none", "written"])))
          .run();
      }
    });
  } catch (err) {
    console.error("[onde] recordTap failed", err);
  }
}
