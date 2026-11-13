import "server-only";
// Client page ("Espace client") — every customer can get a private capability link https://onde.tn/c/<token> showing
// their taps and products, where they change the destination of their own smart links.
//
//   • Access = the token alone (no login). 24 random bytes, base64url (192 bits), unique; regenerating kills the old
//     link instantly; "off" disables it. Unknown, revoked, disabled and anonymized look exactly the same (null).
//   • Every client action re-checks the token, the product's owner and its status, validates the link server-side and
//     is rate-limited (PORTAL_DAILY_LIMIT changes per customer per rolling 24 h, counted in portal_requests).
//   • Mode "direct" (default): the change goes through updateTag() — the admin's own path (destination history +
//     audit) — with actor "client"; the owner gets a push and can Revert from the history. Mode "approval": the change
//     becomes a pending request (one per product, a newer one replaces it) that the owner approves or rejects.
//   • What the client sees is projected here (PortalView): no internal ids, notes, orders or other customers.
import { randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import { customers, destinationHistory, portalRequests, tags, taps } from "../db/schema";
import { normalizeDestination } from "../components/admin/destinations";
import {
  CHOICE_TYPE,
  LOCATION_MAX,
  PORTAL_DAILY_LIMIT,
  type LinkChoice,
  type LinkError,
  type LinkPreview,
  type PortalMode,
  type PortalStand,
  type PortalView,
  type PreviewResult,
  type SimpleResult,
  type SubmitResult,
} from "../components/portal/model";
import { standVariant } from "../lib/business";
import { rateLimit } from "../lib/ratelimit";
import { isBot } from "../lib/ua";
import { isPublicHostname } from "./admin-host";
import { audit } from "./audit";
import { notifyPortalChange } from "./portal-notify";
import { isAnonymizedPhone } from "./retention";
import { readSettings } from "./settings";
import { guessDestinationType, normalizeCode, normalizeDestinationUrl, publicBaseUrl, updateTag, type DestinationActor } from "./tags";
import type { Customer, DestinationType, Tag } from "./types";
import { DAY_MS, lastDays, sqlDay, startOfDay } from "./util";

const TOKEN_BYTES = 24;
const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;
const SEEN_THROTTLE_MS = 10 * 60 * 1000;
const OUTCOME_VISIBLE_MS = 7 * DAY_MS;

// ---------------------------------------------------------------------------------------------------------------
// Tokens & lookup

/** A fresh capability token: 24 random bytes → 32 base64url characters. */
export function newPortalToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Absolute client-page URL for a token (PUBLIC_BASE_URL, default https://onde.tn). */
export function portalLink(token: string): string {
  return `${publicBaseUrl()}/c/${token}`;
}

/** The customer a token opens, or null for anything not valid right now (same answer whatever the reason). */
function customerByToken(token: unknown): Customer | null {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return null;
  const row = getDb().select().from(customers).where(eq(customers.portalToken, token)).get();
  if (!row || !row.portalEnabled || row.portalToken !== token || isAnonymizedPhone(row.phone)) return null;
  return row;
}

/** True when the token currently opens a client page. */
export function isPortalTokenValid(token: unknown): boolean {
  return customerByToken(token) !== null;
}

const businessName = (c: Pick<Customer, "businessName" | "name">) => c.businessName?.trim() || c.name;

function customerTag(customerId: number, rawCode: unknown): Tag | null {
  const code = normalizeCode(String(rawCode ?? ""));
  if (code.length < 4) return null;
  return getDb().select().from(tags).where(and(eq(tags.code, code), eq(tags.customerId, customerId))).get() ?? null;
}

// ---------------------------------------------------------------------------------------------------------------
// Link validation (client input → safe destination)

const BLOCKED_SUFFIXES = [".local", ".localhost", ".internal", ".intranet", ".lan", ".home", ".corp", ".localdomain", ".arpa", ".test", ".example", ".invalid", ".onion"];
const PLATFORM_TYPES = new Set<DestinationType>(["google_review", "instagram", "facebook", "tiktok", "whatsapp"]);
// The link must belong to the platform the client picked ("Avis Google" + a restaurant website is refused, not labelled
// Google). "Menu / site web" and "Autre lien" take any public https link.
const STRICT_CHOICES = new Set<LinkChoice>(["google", "instagram", "facebook", "tiktok", "whatsapp"]);
/** Google's own top-level domain (share.google/…): Google share links that guessDestinationType() does not list. */
const isGoogleTld = (host: string) => /(^|\.)google\.?$/i.test(host);

function ownHosts(): string[] {
  const hosts = new Set<string>(["onde.tn"]);
  try {
    hosts.add(new URL(publicBaseUrl()).hostname.toLowerCase().replace(/^www\./, ""));
  } catch {
    /* default only */
  }
  return [...hosts];
}

/** Public internet host that is not ours (no loops through /t/, no admin look-alikes) and not a private name. */
function isAllowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (!isPublicHostname(h)) return false;
  if (BLOCKED_SUFFIXES.some((s) => h.endsWith(s))) return false;
  return !ownHosts().some((own) => h === own || h.endsWith(`.${own}`));
}

/**
 * Turn what the client typed into a destination, with the admin's rules (normalizeDestination: @handle → profile URL,
 * Tunisian number → wa.me/216…, bare domain → https://) and the server's (normalizeDestinationUrl, guessDestinationType),
 * plus the client-page rules: https only (http:// is upgraded), public hosts only, no custom port, and the link must
 * belong to the platform chosen for Avis Google / Instagram / Facebook / TikTok / WhatsApp.
 */
export function validateClientLink(
  choice: LinkChoice,
  raw: unknown,
  currentType?: DestinationType,
): { ok: true; preview: LinkPreview } | { ok: false; error: LinkError } {
  if (!(choice in CHOICE_TYPE)) return { ok: false, error: "invalid" };
  const v = String(raw ?? "").trim();
  if (!v) return { ok: false, error: "empty" };
  if (v.length > 2000) return { ok: false, error: "too_long" };
  // javascript:, data:, tel:, mailto:, intent:, file: … (a bare "host:port" lands here too).
  if (/^[a-z][a-z0-9+.-]*:/i.test(v) && !/^https?:\/\//i.test(v)) return { ok: false, error: "not_https" };

  const base = CHOICE_TYPE[choice];
  const norm = normalizeDestination(base, v);
  if (!norm.ok) return { ok: false, error: "invalid" };
  if (!/^https?:\/\//i.test(norm.url)) return { ok: false, error: "not_https" };
  const upgraded = norm.url.replace(/^http:\/\//i, "https://");
  const url = normalizeDestinationUrl(upgraded);
  if (!url) return { ok: false, error: "invalid" };
  if (url.length > 2000) return { ok: false, error: "too_long" };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "invalid" };
  }
  if (parsed.protocol !== "https:") return { ok: false, error: "not_https" };
  if (parsed.port || !isAllowedHost(parsed.hostname)) return { ok: false, error: "blocked_host" };

  let detected = guessDestinationType(url);
  if (detected === "website" && isGoogleTld(parsed.hostname)) detected = "google_review";
  if (STRICT_CHOICES.has(choice) && detected !== base) return { ok: false, error: "wrong_platform" };
  let type: DestinationType;
  if (PLATFORM_TYPES.has(detected)) type = detected;
  else if (choice === "site") type = currentType === "menu" ? "menu" : "website";
  else type = base;
  return { ok: true, preview: { type, url } };
}

// ---------------------------------------------------------------------------------------------------------------
// Client page data

/**
 * Tap figures for a customer's products. A product that moved from another customer only counts its taps since then
 * (tags.customer_since), so the previous owner's activity never shows on the new owner's page.
 */
function tapStats(tagIds: number[]) {
  const db = getDb();
  const now = Date.now();
  const keys = lastDays(30, now);
  const today = startOfDay(now);
  const from30 = today - 29 * DAY_MS;
  const from7 = today - 6 * DAY_MS;
  const empty = {
    totals: { today: 0, d7: 0, d30: 0, all: 0 },
    series: keys.map((date) => ({ date, taps: 0 })),
    split: { nfc: 0, qr: 0 },
    perTag: new Map<number, { d30: number; last: number | null }>(),
  };
  if (!tagIds.length) return empty;
  const mine = and(inArray(taps.tagId, tagIds), gte(taps.ts, sql`coalesce(${tags.customerSince}, 0)`));
  const owned = eq(tags.id, taps.tagId);
  const agg = db
    .select({
      all: count(),
      d30: sql<number>`coalesce(sum(case when ${taps.ts} >= ${from30} then 1 else 0 end), 0)`,
      d7: sql<number>`coalesce(sum(case when ${taps.ts} >= ${from7} then 1 else 0 end), 0)`,
      today: sql<number>`coalesce(sum(case when ${taps.ts} >= ${today} then 1 else 0 end), 0)`,
    })
    .from(taps)
    .innerJoin(tags, owned)
    .where(mine)
    .get();
  const day = sqlDay(taps.ts);
  const perDay = db.select({ day, n: count() }).from(taps).innerJoin(tags, owned).where(and(mine, gte(taps.ts, from30))).groupBy(day).all();
  const byDay = new Map(perDay.map((r) => [r.day, Number(r.n)]));
  const sources = db
    .select({ source: taps.source, n: count() })
    .from(taps)
    .innerJoin(tags, owned)
    .where(and(mine, gte(taps.ts, from30)))
    .groupBy(taps.source)
    .all();
  const perTagRows = db
    .select({
      tagId: taps.tagId,
      d30: sql<number>`coalesce(sum(case when ${taps.ts} >= ${from30} then 1 else 0 end), 0)`,
      last: sql<number | null>`max(${taps.ts})`,
    })
    .from(taps)
    .innerJoin(tags, owned)
    .where(mine)
    .groupBy(taps.tagId)
    .all();
  const split = { nfc: 0, qr: 0 };
  for (const s of sources) if (s.source === "nfc" || s.source === "qr") split[s.source] = Number(s.n);
  return {
    totals: { today: Number(agg?.today ?? 0), d7: Number(agg?.d7 ?? 0), d30: Number(agg?.d30 ?? 0), all: Number(agg?.all ?? 0) },
    series: keys.map((date) => ({ date, taps: byDay.get(date) ?? 0 })),
    split,
    perTag: new Map(perTagRows.map((r) => [r.tagId, { d30: Number(r.d30), last: r.last == null ? null : Number(r.last) }])),
  };
}

function changesUsed(customerId: number, now = Date.now()): number {
  return (
    getDb()
      .select({ n: count() })
      .from(portalRequests)
      .where(and(eq(portalRequests.customerId, customerId), gte(portalRequests.createdAt, now - DAY_MS)))
      .get()?.n ?? 0
  );
}

function markSeen(c: Customer, visit: { userAgent: string | null; preview: boolean }) {
  if (visit.preview || isBot(visit.userAgent)) return;
  const now = Date.now();
  if (c.portalSeenAt && now - c.portalSeenAt < SEEN_THROTTLE_MS) return;
  try {
    getDb().update(customers).set({ portalSeenAt: now }).where(eq(customers.id, c.id)).run();
  } catch (err) {
    console.warn("[onde] portal: could not record the visit", err instanceof Error ? err.message : err);
  }
}

/** Everything the client page shows, or null when the token is not valid. */
export async function getPortalView(token: unknown, visit?: { userAgent: string | null; preview: boolean }): Promise<PortalView | null> {
  const c = customerByToken(token);
  if (!c) return null;
  if (visit) markSeen(c, visit);
  return buildPortalView(c);
}

/** The client page of a customer (exactly what their link shows), for the owner — whatever the state of the link. */
function buildPortalView(c: Customer): PortalView {
  const db = getDb();
  const rows = db.select().from(tags).where(eq(tags.customerId, c.id)).orderBy(asc(tags.createdAt), asc(tags.id)).all();
  const stats = tapStats(rows.map((t) => t.id));

  // Latest request per product (made since the product is theirs): pending → "En attente", recently approved/rejected
  // → outcome note, as long as it is still true: an approved link that the owner reverted or replaced since, or a
  // rejection followed by another change, shows no note.
  const now = Date.now();
  const byId = new Map(rows.map((t) => [t.id, t]));
  const latest = new Map<number, typeof portalRequests.$inferSelect>();
  const lastChange = new Map<number, number>();
  if (rows.length) {
    const reqs = db
      .select()
      .from(portalRequests)
      .where(eq(portalRequests.customerId, c.id))
      .orderBy(desc(portalRequests.createdAt), desc(portalRequests.id))
      .limit(500)
      .all();
    for (const r of reqs) {
      const t = byId.get(r.tagId);
      if (t && r.createdAt >= (t.customerSince ?? 0) && !latest.has(r.tagId)) latest.set(r.tagId, r);
    }
    const changes = latest.size
      ? db
          .select({ tagId: destinationHistory.tagId, at: sql<number>`max(${destinationHistory.changedAt})` })
          .from(destinationHistory)
          .where(inArray(destinationHistory.tagId, [...latest.keys()]))
          .groupBy(destinationHistory.tagId)
          .all()
      : [];
    for (const ch of changes) lastChange.set(ch.tagId, Number(ch.at));
  }

  const stands: PortalStand[] = rows.map((t) => {
    const r = latest.get(t.id);
    const pending = r?.status === "pending" ? { type: r.toType as DestinationType, url: r.toUrl, at: r.createdAt } : null;
    const decided =
      r && (r.status === "approved" || r.status === "rejected") && r.decidedAt && now - r.decidedAt < OUTCOME_VISIBLE_MS
        ? { status: r.status, type: r.toType as DestinationType, url: r.toUrl, at: r.decidedAt }
        : null;
    // Still true = no destination change after the decision, and an approved link is the one live now.
    const outcome =
      decided &&
      (lastChange.get(t.id) ?? 0) <= decided.at &&
      (decided.status === "rejected" || (t.destinationUrl === decided.url && t.destinationType === decided.type))
        ? decided
        : null;
    const tapsOf = stats.perTag.get(t.id);
    return {
      code: t.code,
      kind: t.kind,
      variant: standVariant(t),
      location: t.locationLabel ?? null,
      destType: t.destinationType,
      destUrl: t.destinationUrl,
      active: t.status === "active",
      taps30d: tapsOf?.d30 ?? 0,
      lastTapAt: tapsOf?.last ?? null,
      pending,
      outcome,
    };
  });

  let whatsapp = "";
  try {
    whatsapp = readSettings().whatsapp.replace(/\D/g, "");
  } catch {
    /* no help link */
  }
  return {
    business: businessName(c),
    mode: c.portalMode,
    totals: stats.totals,
    series: stats.series,
    split: stats.split,
    stands,
    changesLeft: Math.max(0, PORTAL_DAILY_LIMIT - changesUsed(c.id, now)),
    whatsapp,
    generatedAt: now,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Client actions (token re-checked on every call)

function clientContext(token: unknown, rawCode: unknown): { c: Customer; tag: Tag } | { error: LinkError } {
  const c = customerByToken(token);
  if (!c) return { error: "expired" };
  const tag = customerTag(c.id, rawCode);
  if (!tag) return { error: "unknown" };
  return { c, tag };
}

/** Step 1 of "Changer le lien": validate and show where clients will land. Read-only. */
export async function previewClientChange(token: unknown, rawCode: unknown, choice: LinkChoice, raw: unknown): Promise<PreviewResult> {
  const ctx = clientContext(token, rawCode);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { c, tag } = ctx;
  if (tag.status !== "active") return { ok: false, error: "disabled" };
  if (!rateLimit(`portal-preview:${c.id}`, 120, 60 * 60 * 1000).ok) return { ok: false, error: "rate_limited" };
  if (changesUsed(c.id) >= PORTAL_DAILY_LIMIT) return { ok: false, error: "daily_limit" };
  const v = validateClientLink(choice, raw, tag.destinationType);
  if (!v.ok) return v;
  if (v.preview.url === tag.destinationUrl && v.preview.type === tag.destinationType) return { ok: false, error: "same" };
  return { ok: true, preview: v.preview };
}

const REPEAT_WINDOW_MS = 15_000;

/** The product's latest destination change is this one, made by `actor` a few seconds ago. */
function justApplied(tagId: number, type: DestinationType, url: string, now: number, actor: DestinationActor = "client"): boolean {
  const h = getDb()
    .select()
    .from(destinationHistory)
    .where(eq(destinationHistory.tagId, tagId))
    .orderBy(desc(destinationHistory.id))
    .limit(1)
    .get();
  return Boolean(h && h.actor === actor && h.toType === type && h.toUrl === url && now - h.changedAt < REPEAT_WINDOW_MS);
}

/** Step 2: apply (direct mode) or file a request (approval mode). Re-validates everything. */
export async function submitClientChange(token: unknown, rawCode: unknown, choice: LinkChoice, raw: unknown): Promise<SubmitResult> {
  const ctx = clientContext(token, rawCode);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { c, tag } = ctx;
  if (tag.status !== "active") return { ok: false, error: "disabled" };
  const v = validateClientLink(choice, raw, tag.destinationType);
  if (!v.ok) return v;
  const { type, url } = v.preview;
  const now = Date.now();
  const used = changesUsed(c.id, now);
  const db = getDb();

  // The same change sent twice (a double tap on "Confirmer", a retry after a lost answer) gets the first answer again:
  // no second request, no second notification, no second change counted.
  const again = { ok: true as const, preview: { type, url }, changesLeft: Math.max(0, PORTAL_DAILY_LIMIT - used) };
  if (c.portalMode === "approval") {
    const waiting = db
      .select({ id: portalRequests.id })
      .from(portalRequests)
      .where(and(eq(portalRequests.tagId, tag.id), eq(portalRequests.status, "pending"), eq(portalRequests.toType, type), eq(portalRequests.toUrl, url)))
      .get();
    if (waiting) return { ...again, status: "pending" };
  }
  if (url === tag.destinationUrl && type === tag.destinationType) {
    if (c.portalMode === "direct" && justApplied(tag.id, type, url, now)) return { ...again, status: "applied" };
    return { ok: false, error: "same" };
  }
  if (used >= PORTAL_DAILY_LIMIT) return { ok: false, error: "daily_limit" };

  const record = (status: "applied" | "pending") =>
    db.transaction((tx) => {
      // One pending request per product: the newest replaces the previous one (a direct change too).
      tx.update(portalRequests)
        .set({ status: "replaced", decidedAt: now })
        .where(and(eq(portalRequests.tagId, tag.id), eq(portalRequests.status, "pending")))
        .run();
      tx.insert(portalRequests)
        .values({
          customerId: c.id,
          tagId: tag.id,
          mode: c.portalMode,
          status,
          fromType: tag.destinationType,
          fromUrl: tag.destinationUrl,
          toType: type,
          toUrl: url,
          createdAt: now,
          decidedAt: status === "applied" ? now : null,
        })
        .run();
      if (status === "pending") audit("portal.request", { customerId: c.id, code: tag.code, to: { type, url } }, tx);
    });

  if (c.portalMode === "approval") {
    record("pending");
  } else {
    try {
      // The admin's own update path: destination_history + audit "tag.destination" with actor "client".
      await updateTag(tag.id, { destinationType: type, destinationUrl: url }, { actor: "client" });
    } catch (err) {
      console.error("[onde] portal: client change failed", err);
      return { ok: false, error: "failed" };
    }
    record("applied");
  }

  notifyPortalChange({
    customerId: c.id,
    business: businessName(c),
    code: tag.code,
    location: tag.locationLabel ?? null,
    toType: type,
    toUrl: url,
    kind: c.portalMode === "approval" ? "pending" : "applied",
  });
  return { ok: true, status: c.portalMode === "approval" ? "pending" : "applied", preview: { type, url }, changesLeft: Math.max(0, PORTAL_DAILY_LIMIT - used - 1) };
}

/** The client withdraws their pending request for a product. */
export async function cancelClientRequest(token: unknown, rawCode: unknown): Promise<SimpleResult> {
  const ctx = clientContext(token, rawCode);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { c, tag } = ctx;
  const res = getDb()
    .update(portalRequests)
    .set({ status: "cancelled", decidedAt: Date.now() })
    .where(and(eq(portalRequests.tagId, tag.id), eq(portalRequests.customerId, c.id), eq(portalRequests.status, "pending")))
    .run();
  if (res.changes) audit("portal.cancel", { customerId: c.id, code: tag.code });
  return { ok: true };
}

/** Trim, collapse whitespace, drop control characters; "" → null. */
export function cleanLocation(raw: unknown): string | null {
  const s = String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return null;
  return Array.from(s).slice(0, LOCATION_MAX).join("").trim();
}

/** The client names where a product stands ("Comptoir"). */
export async function setClientLocation(token: unknown, rawCode: unknown, raw: unknown): Promise<SimpleResult> {
  const ctx = clientContext(token, rawCode);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { c, tag } = ctx;
  if (!rateLimit(`portal-location:${c.id}`, 40, DAY_MS).ok) return { ok: false, error: "rate_limited" };
  const label = cleanLocation(raw);
  if (label === (tag.locationLabel ?? null)) return { ok: true };
  getDb().update(tags).set({ locationLabel: label, updatedAt: Date.now() }).where(eq(tags.id, tag.id)).run();
  audit("portal.location", { customerId: c.id, code: tag.code, label, actor: "client" });
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------
// Owner viewing a client's dashboard (/admin/customers/<id>/dashboard — the same page as /c/<token>). Callers must
// have checked the admin session (src/app/(admin)/admin/portal-actions.ts). Unlike the client's own actions: any
// customer (link or not, on or off), changes are recorded with actor "owner" and applied at once (even in approval
// mode), no "client changed" push, nothing counted in the client's daily limit, portal_seen_at never touched.

export type OwnerDashboard = {
  customerId: number;
  view: PortalView;
  /** Client link (absolute URL) when one was created — on or off. */
  link: string | null;
  enabled: boolean;
  anonymized: boolean;
  /** 8-digit Tunisian mobile for "Send on WhatsApp", null when there is none. */
  phone: string | null;
  firstName: string;
  /** The client's own link changes in the rolling 24 h, and the limit. */
  changesUsed: number;
  limit: number;
};

export async function getOwnerDashboard(customerId: number): Promise<OwnerDashboard | null> {
  const c = getDb().select().from(customers).where(eq(customers.id, customerId)).get();
  if (!c) return null;
  const anonymized = isAnonymizedPhone(c.phone);
  return {
    customerId: c.id,
    view: buildPortalView(c),
    link: c.portalToken ? portalLink(c.portalToken) : null,
    enabled: c.portalEnabled && Boolean(c.portalToken) && !anonymized,
    anonymized,
    phone: /^[2-9]\d{7}$/.test(c.phone) ? c.phone : null,
    firstName: c.name.trim().split(/\s+/)[0] ?? "",
    changesUsed: changesUsed(c.id),
    limit: PORTAL_DAILY_LIMIT,
  };
}

function ownerContext(customerId: number, rawCode: unknown): { c: Customer; tag: Tag } | { error: LinkError } {
  const c = getDb().select().from(customers).where(eq(customers.id, customerId)).get();
  if (!c) return { error: "unknown" };
  const tag = customerTag(c.id, rawCode);
  if (!tag) return { error: "unknown" };
  return { c, tag };
}

/** Step 1 of "Changer le lien" from the owner's view: the client page's rules, without the client's daily limit. */
export async function previewOwnerChange(customerId: number, rawCode: unknown, choice: LinkChoice, raw: unknown): Promise<PreviewResult> {
  const ctx = ownerContext(customerId, rawCode);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { tag } = ctx;
  if (tag.status !== "active") return { ok: false, error: "disabled" };
  const v = validateClientLink(choice, raw, tag.destinationType);
  if (!v.ok) return v;
  if (v.preview.url === tag.destinationUrl && v.preview.type === tag.destinationType) return { ok: false, error: "same" };
  return { ok: true, preview: v.preview };
}

/**
 * Step 2 from the owner's view: applied now through updateTag() with actor "owner". No push, no portal request row.
 * The client's pending request on that product (approval mode) is closed as "replaced", exactly like a newer client
 * change closes it: the owner chose, so it no longer shows as waiting and can never be approved over the owner's link.
 */
export async function submitOwnerChange(customerId: number, rawCode: unknown, choice: LinkChoice, raw: unknown): Promise<SubmitResult> {
  const ctx = ownerContext(customerId, rawCode);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { c, tag } = ctx;
  if (tag.status !== "active") return { ok: false, error: "disabled" };
  const v = validateClientLink(choice, raw, tag.destinationType);
  if (!v.ok) return v;
  const { type, url } = v.preview;
  const now = Date.now();
  const changesLeft = Math.max(0, PORTAL_DAILY_LIMIT - changesUsed(c.id, now));
  if (url === tag.destinationUrl && type === tag.destinationType) {
    // A double tap on "Confirmer" gets the first answer again.
    if (justApplied(tag.id, type, url, now, "owner")) return { ok: true, status: "applied", preview: { type, url }, changesLeft };
    return { ok: false, error: "same" };
  }
  try {
    await updateTag(tag.id, { destinationType: type, destinationUrl: url }, { actor: "owner" });
  } catch (err) {
    console.error("[onde] owner dashboard: change failed", err);
    return { ok: false, error: "failed" };
  }
  const replaced = getDb()
    .update(portalRequests)
    .set({ status: "replaced", decidedAt: Date.now() })
    .where(and(eq(portalRequests.tagId, tag.id), eq(portalRequests.status, "pending")))
    .run().changes;
  if (replaced) audit("portal.replaced", { customerId: c.id, code: tag.code, by: "owner", requests: replaced });
  return { ok: true, status: "applied", preview: { type, url }, changesLeft };
}

/** The owner names where a product stands, from the dashboard view. */
export async function setOwnerLocation(customerId: number, rawCode: unknown, raw: unknown): Promise<SimpleResult> {
  const ctx = ownerContext(customerId, rawCode);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  setTagLocation(ctx.tag.id, raw);
  return { ok: true };
}

/** Approve / reject the pending request of one product from the dashboard view (applied with actor "owner"). */
export async function decideOwnerRequest(customerId: number, rawCode: unknown, decision: "approve" | "reject"): Promise<SimpleResult> {
  const ctx = ownerContext(customerId, rawCode);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const r = getDb()
    .select({ id: portalRequests.id })
    .from(portalRequests)
    .where(and(eq(portalRequests.tagId, ctx.tag.id), eq(portalRequests.customerId, ctx.c.id), eq(portalRequests.status, "pending")))
    .get();
  if (!r) return { ok: true }; // already decided (a double tap, another tab): the refreshed page shows the outcome
  try {
    await decidePortalRequest(r.id, decision, { actor: "owner" });
  } catch (err) {
    // Already decided, or closed because the product changed since (stale): the refreshed page shows the outcome.
    if (err instanceof PortalError) return err.code === "already" || err.code === "stale" ? { ok: true } : { ok: false, error: "unknown" };
    console.error("[onde] owner dashboard: decision failed", err);
    return { ok: false, error: "failed" };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------
// Owner side (callers must have checked the admin session: src/app/(admin)/admin/portal-actions.ts)

export type PortalAdminStand = {
  id: number;
  code: string;
  kind: Tag["kind"];
  variant: "white" | "black" | null;
  location: string | null;
  destType: DestinationType;
  destUrl: string;
  status: Tag["status"];
};

export type PortalAdminRequest = {
  id: number;
  code: string;
  location: string | null;
  fromType: DestinationType | null;
  fromUrl: string | null;
  toType: DestinationType;
  toUrl: string;
  createdAt: number;
};

export type PortalAdminChange = {
  id: number;
  code: string;
  location: string | null;
  fromType: DestinationType | null;
  fromUrl: string | null;
  toType: DestinationType;
  toUrl: string;
  changedAt: number;
  actor: "owner" | "client";
  /** The change is what the product does right now and has a previous destination to go back to. */
  canRevert: boolean;
};

export type PortalAdminView = {
  enabled: boolean;
  mode: PortalMode;
  link: string | null;
  createdAt: number | null;
  seenAt: number | null;
  changesToday: number;
  limit: number;
  /** Customer's 8-digit phone for WhatsApp, null when anonymized / not a Tunisian mobile. */
  phone: string | null;
  firstName: string;
  stands: PortalAdminStand[];
  pending: PortalAdminRequest[];
  history: PortalAdminChange[];
};

export async function getPortalAdmin(customerId: number): Promise<PortalAdminView | null> {
  const db = getDb();
  const c = db.select().from(customers).where(eq(customers.id, customerId)).get();
  if (!c) return null;
  const rows = db.select().from(tags).where(eq(tags.customerId, c.id)).orderBy(asc(tags.createdAt), asc(tags.id)).all();
  const byId = new Map(rows.map((t) => [t.id, t]));
  const ids = rows.map((t) => t.id);
  const pending = ids.length
    ? db
        .select()
        .from(portalRequests)
        .where(and(eq(portalRequests.customerId, c.id), eq(portalRequests.status, "pending"), inArray(portalRequests.tagId, ids)))
        .orderBy(desc(portalRequests.createdAt))
        .all()
    : [];
  // "Recent changes": the 10 latest changes made since each product is this customer's, plus — however many other
  // changes came after it — every product's latest change when it is a client change that is still live, so each
  // one keeps its one-click Revert (a client may move all their products to a new link at once).
  const live = (h: { tagId: number; toType: string; toUrl: string }) => {
    const t = byId.get(h.tagId);
    return Boolean(t && t.destinationUrl === h.toUrl && t.destinationType === h.toType);
  };
  const differs = (h: { fromType: string | null; fromUrl: string | null; toType: string; toUrl: string }) =>
    Boolean(h.fromUrl) && (h.fromUrl !== h.toUrl || h.fromType !== h.toType);
  const ownedSince = gte(destinationHistory.changedAt, sql`coalesce(${tags.customerSince}, 0)`);
  const recent = ids.length
    ? db
        .select({ h: destinationHistory })
        .from(destinationHistory)
        .innerJoin(tags, eq(tags.id, destinationHistory.tagId))
        .where(and(eq(tags.customerId, c.id), ownedSince))
        .orderBy(desc(destinationHistory.changedAt), desc(destinationHistory.id))
        .limit(10)
        .all()
        .map((r) => r.h)
    : [];
  const latestIds = ids.length
    ? db
        .select({ id: sql<number>`max(${destinationHistory.id})` })
        .from(destinationHistory)
        .innerJoin(tags, eq(tags.id, destinationHistory.tagId))
        .where(and(eq(tags.customerId, c.id), ownedSince))
        .groupBy(destinationHistory.tagId)
        .all()
        .map((r) => Number(r.id))
    : [];
  const shown = new Set(recent.map((h) => h.id));
  const older = latestIds.filter((hid) => !shown.has(hid));
  const stillLive = older.length
    ? db
        .select()
        .from(destinationHistory)
        .where(and(inArray(destinationHistory.id, older), eq(destinationHistory.actor, "client")))
        .all()
        .filter((h) => live(h) && differs(h))
    : [];
  const hist = [...recent, ...stillLive].sort((a, b) => b.changedAt - a.changedAt || b.id - a.id);
  return {
    enabled: c.portalEnabled && Boolean(c.portalToken) && !isAnonymizedPhone(c.phone),
    mode: c.portalMode,
    link: c.portalToken ? portalLink(c.portalToken) : null,
    createdAt: c.portalCreatedAt ?? null,
    seenAt: c.portalSeenAt ?? null,
    changesToday: changesUsed(c.id),
    limit: PORTAL_DAILY_LIMIT,
    phone: /^[2-9]\d{7}$/.test(c.phone) ? c.phone : null,
    firstName: c.name.trim().split(/\s+/)[0] ?? "",
    stands: rows.map((t) => ({
      id: t.id,
      code: t.code,
      kind: t.kind,
      variant: standVariant(t),
      location: t.locationLabel ?? null,
      destType: t.destinationType,
      destUrl: t.destinationUrl,
      status: t.status,
    })),
    pending: pending.map((r) => ({
      id: r.id,
      code: byId.get(r.tagId)?.code ?? "?",
      location: byId.get(r.tagId)?.locationLabel ?? null,
      fromType: (r.fromType as DestinationType | null) ?? null,
      fromUrl: r.fromUrl,
      toType: r.toType as DestinationType,
      toUrl: r.toUrl,
      createdAt: r.createdAt,
    })),
    history: hist.map((h) => {
      const t = byId.get(h.tagId);
      return {
        id: h.id,
        code: t?.code ?? "?",
        location: t?.locationLabel ?? null,
        fromType: (h.fromType as DestinationType | null) ?? null,
        fromUrl: h.fromUrl,
        toType: h.toType as DestinationType,
        toUrl: h.toUrl,
        changedAt: h.changedAt,
        actor: h.actor === "client" ? "client" : "owner",
        canRevert: live(h) && differs(h),
      };
    }),
  };
}

function loadCustomer(customerId: number): Customer {
  const c = getDb().select().from(customers).where(eq(customers.id, customerId)).get();
  if (!c) throw new PortalError("not_found");
  return c;
}

/** Owner-side failure with a stable code (mapped to English messages by the admin actions). */
export class PortalError extends Error {
  constructor(readonly code: "not_found" | "anonymized" | "stale" | "no_previous" | "already") {
    super(code);
    this.name = "PortalError";
  }
}

/** Turn the client page on (creates the link the first time) or off (the link stops working, same token kept). */
export function setPortalEnabled(customerId: number, enabled: boolean): void {
  const c = loadCustomer(customerId);
  if (enabled && isAnonymizedPhone(c.phone)) throw new PortalError("anonymized");
  const set: Partial<typeof customers.$inferInsert> = { portalEnabled: enabled };
  if (enabled && !c.portalToken) {
    set.portalToken = newPortalToken();
    set.portalCreatedAt = Date.now();
  }
  getDb().update(customers).set(set).where(eq(customers.id, customerId)).run();
  audit(enabled ? (c.portalToken ? "portal.enable" : "portal.create") : "portal.disable", { customerId });
}

/** New token: the old link dies at once. Turns the page on. */
export function regeneratePortalLink(customerId: number): void {
  const c = loadCustomer(customerId);
  if (isAnonymizedPhone(c.phone)) throw new PortalError("anonymized");
  getDb()
    .update(customers)
    .set({ portalToken: newPortalToken(), portalEnabled: true, portalCreatedAt: Date.now(), portalSeenAt: null })
    .where(eq(customers.id, customerId))
    .run();
  audit("portal.regenerate", { customerId });
}

export function setPortalMode(customerId: number, mode: PortalMode): void {
  const c = loadCustomer(customerId);
  if (c.portalMode === mode) return;
  getDb().update(customers).set({ portalMode: mode }).where(eq(customers.id, customerId)).run();
  audit("portal.mode", { customerId, mode });
}

/** Owner edits a product's location label (the client sees it on their page). */
export function setTagLocation(tagId: number, raw: unknown): string | null {
  const t = getDb().select({ id: tags.id, code: tags.code, label: tags.locationLabel }).from(tags).where(eq(tags.id, tagId)).get();
  if (!t) throw new PortalError("not_found");
  const label = cleanLocation(raw);
  if (label !== (t.label ?? null)) {
    getDb().update(tags).set({ locationLabel: label, updatedAt: Date.now() }).where(eq(tags.id, tagId)).run();
    audit("portal.location", { code: t.code, label, actor: "owner" });
  }
  return label;
}

/**
 * Approve (apply through updateTag, actor "client" — the client asked for it — or "owner" when decided from the
 * owner's dashboard view) or reject a pending request. A request whose product changed hands is cancelled instead.
 */
export async function decidePortalRequest(
  requestId: number,
  decision: "approve" | "reject",
  opts: { actor?: DestinationActor } = {},
): Promise<{ customerId: number }> {
  const actor = opts.actor ?? "client";
  const db = getDb();
  const r = db.select().from(portalRequests).where(eq(portalRequests.id, requestId)).get();
  if (!r) throw new PortalError("not_found");
  if (r.status !== "pending") throw new PortalError("already");
  const tag = db.select().from(tags).where(eq(tags.id, r.tagId)).get();
  if (!tag || tag.customerId !== r.customerId) {
    db.update(portalRequests).set({ status: "cancelled", decidedAt: Date.now() }).where(eq(portalRequests.id, r.id)).run();
    throw new PortalError("stale");
  }
  // The product's link changed since the client asked (the owner set another one): approving would silently undo
  // that newer choice. The request is closed as replaced; the refreshed page shows the product's current link.
  const moved = (tag.destinationUrl !== (r.fromUrl ?? "") || tag.destinationType !== r.fromType) && (tag.destinationUrl !== r.toUrl || tag.destinationType !== r.toType);
  if (decision === "approve" && moved) {
    db.update(portalRequests).set({ status: "replaced", decidedAt: Date.now() }).where(and(eq(portalRequests.id, r.id), eq(portalRequests.status, "pending"))).run();
    throw new PortalError("stale");
  }
  if (decision === "approve" && (tag.destinationUrl !== r.toUrl || tag.destinationType !== r.toType)) {
    await updateTag(tag.id, { destinationType: r.toType as DestinationType, destinationUrl: r.toUrl }, { actor });
  }
  const now = Date.now(); // after the history row the approval wrote (getPortalView: "changed since the decision")
  db.update(portalRequests)
    .set({ status: decision === "approve" ? "approved" : "rejected", decidedAt: now })
    .where(and(eq(portalRequests.id, r.id), eq(portalRequests.status, "pending")))
    .run();
  audit(decision === "approve" ? "portal.approve" : "portal.reject", {
    customerId: r.customerId,
    code: tag.code,
    to: { type: r.toType, url: r.toUrl },
    ...(actor === "owner" ? { via: "dashboard" } : {}),
  });
  return { customerId: r.customerId };
}

/** One-click undo: put back the destination a history row replaced (only while that change is still live). */
export async function revertDestinationChange(historyId: number): Promise<{ customerId: number | null; code: string }> {
  const db = getDb();
  const h = db.select().from(destinationHistory).where(eq(destinationHistory.id, historyId)).get();
  if (!h) throw new PortalError("not_found");
  const tag = db.select().from(tags).where(eq(tags.id, h.tagId)).get();
  if (!tag) throw new PortalError("not_found");
  if (!h.fromUrl || !h.fromType) throw new PortalError("no_previous");
  if (tag.destinationUrl !== h.toUrl || tag.destinationType !== h.toType) throw new PortalError("stale");
  await updateTag(tag.id, { destinationType: h.fromType as DestinationType, destinationUrl: h.fromUrl }, { actor: "owner" });
  audit("portal.revert", { code: tag.code, history: h.id, to: { type: h.fromType, url: h.fromUrl } });
  return { customerId: tag.customerId, code: tag.code };
}

/** Pending client requests for the Overview badge (newest first). */
export async function listPendingPortalRequests(limit = 5): Promise<{
  total: number;
  rows: { id: number; customerId: number; business: string; code: string; toType: DestinationType; createdAt: number }[];
}> {
  const db = getDb();
  // A product that changed hands since cannot be decided any more (its pending request is cancelled on reassignment).
  const waiting = and(eq(portalRequests.status, "pending"), eq(tags.customerId, portalRequests.customerId));
  const total =
    db.select({ n: count() }).from(portalRequests).innerJoin(tags, eq(tags.id, portalRequests.tagId)).where(waiting).get()?.n ?? 0;
  if (!total) return { total: 0, rows: [] };
  const rows = db
    .select({
      id: portalRequests.id,
      customerId: portalRequests.customerId,
      name: customers.name,
      businessName: customers.businessName,
      code: tags.code,
      toType: portalRequests.toType,
      createdAt: portalRequests.createdAt,
    })
    .from(portalRequests)
    .innerJoin(customers, eq(customers.id, portalRequests.customerId))
    .innerJoin(tags, eq(tags.id, portalRequests.tagId))
    .where(waiting)
    .orderBy(desc(portalRequests.createdAt))
    .limit(Math.max(1, Math.min(50, limit)))
    .all();
  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      customerId: r.customerId,
      business: businessName(r),
      code: r.code,
      toType: r.toType as DestinationType,
      createdAt: r.createdAt,
    })),
  };
}
