import "server-only";
// Resilient readers over the backend data layer for the public pages. A DB hiccup (or a missing DB while
// `next build` prerenders inside Docker) must never take About / Contact / Legal / Inactive down: server
// modules are imported lazily inside try/catch and every reader falls back to the foundation defaults.
import { BRAND, DEFAULT_RULES, normalizePhone, type Rules } from "@/lib/business";
import { isEmail } from "./lib";

export type ContactInfo = {
  /** 8-digit Tunisian number, e.g. "25875529" */
  phone: string;
  /** International digits for wa.me, e.g. "21625875529" */
  whatsapp: string;
  email: string;
  instagram: string;
  facebook: string;
  tiktok: string;
};

const DEFAULT_CONTACT: ContactInfo = {
  phone: BRAND.phoneE164.replace(/\D/g, "").slice(-8),
  whatsapp: BRAND.whatsapp,
  email: "",
  instagram: "",
  facebook: "",
  tiktok: "",
};

const warn = (what: string, err: unknown) => console.warn(`[pages] ${what} unavailable, using defaults:`, err instanceof Error ? err.message : err);

export async function loadContactInfo(): Promise<ContactInfo> {
  try {
    const { getPublicSettings } = await import("@/server/settings");
    const s = await getPublicSettings();
    const phone = normalizePhone(s.phone ?? "") ?? DEFAULT_CONTACT.phone;
    let wa = (s.whatsapp ?? "").replace(/\D/g, "");
    if (wa.length === 8) wa = `216${wa}`;
    if (wa.length < 11) wa = DEFAULT_CONTACT.whatsapp;
    const email = (s.email ?? "").trim();
    return {
      phone,
      whatsapp: wa,
      email: isEmail(email) ? email : "",
      instagram: (s.instagram ?? "").trim(),
      facebook: (s.facebook ?? "").trim(),
      tiktok: (s.tiktok ?? "").trim(),
    };
  } catch (err) {
    warn("public settings", err);
    return DEFAULT_CONTACT;
  }
}

export async function loadRules(): Promise<Rules> {
  try {
    const { getRules } = await import("@/server/settings");
    const r = await getRules();
    const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
    return {
      deliveryFee: ok(r.deliveryFee) ? r.deliveryFee : DEFAULT_RULES.deliveryFee,
      freeDeliveryThreshold: ok(r.freeDeliveryThreshold) ? r.freeDeliveryThreshold : DEFAULT_RULES.freeDeliveryThreshold,
      returningDiscountPct: ok(r.returningDiscountPct) ? r.returningDiscountPct : DEFAULT_RULES.returningDiscountPct,
    };
  } catch (err) {
    warn("rules", err);
    return { ...DEFAULT_RULES };
  }
}

/** Active products for the sitemap (empty when the DB is unavailable). */
export async function loadProductSlugs(): Promise<{ slug: string; kind: string; createdAt: number; image: string }[]> {
  try {
    const { listProducts } = await import("@/server/catalog");
    const rows = await listProducts();
    return rows
      .filter((p) => p.active)
      .map((p) => ({ slug: p.slug, kind: p.kind, createdAt: p.createdAt, image: p.image }));
  } catch (err) {
    warn("catalog", err);
    return [];
  }
}

/** Uppercase letters/digits only (same normalization as the smart-link route); null when nothing usable remains. */
export function sanitizeCode(raw: string | string[] | undefined): string | null {
  const v = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const cleaned = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
  return cleaned.length >= 4 ? cleaned : null;
}

export type TagState = "inactive" | "paused" | "unknown" | "active";

/**
 * Why did the visitor land on /inactive? "active" happens when the owner activated the link meanwhile
 * (we then offer to open it via /t/CODE, so the redirect route still counts the tap).
 */
export async function loadTagState(code: string | null): Promise<TagState> {
  if (!code) return "inactive";
  try {
    const { resolveTag } = await import("@/server/tags");
    const r = await resolveTag(code);
    if (r.status === "missing") return "unknown";
    if (r.status === "disabled") return "paused";
    return r.url ? "active" : "inactive";
  } catch (err) {
    warn("tag state", err);
    return "inactive";
  }
}
