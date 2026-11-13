import "server-only";
// Resilient data loaders for the public shell + home page. The server modules are imported lazily inside
// try/catch so a missing/locked DB (e.g. during `next build` in Docker) degrades to sane defaults instead of
// failing the render: phone/WhatsApp from BRAND, rules from DEFAULT_RULES, empty catalog.
import { BRAND, DEFAULT_RULES, type Rules } from "@/lib/business";
import type { SiteContact } from "./types";

const FALLBACK_CONTACT: SiteContact = {
  phone: BRAND.phoneE164.replace(/\D/g, "").slice(-8),
  whatsapp: BRAND.whatsapp,
  email: "",
  instagram: "",
  facebook: "",
  tiktok: "",
};

/** During `next build` static prerendering we never touch SQLite (no DB file baked into the image); ISR refreshes it. */
const isBuild = () => process.env.NEXT_PHASE === "phase-production-build";

function str(src: Record<string, unknown>, key: string, fallback: string): string {
  const v = src[key];
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

export async function loadContact(): Promise<SiteContact> {
  if (isBuild()) return FALLBACK_CONTACT;
  try {
    const { getPublicSettings } = await import("@/server/settings");
    const s = (await getPublicSettings()) as unknown as Record<string, unknown>;
    return {
      phone: str(s, "phone", FALLBACK_CONTACT.phone),
      whatsapp: str(s, "whatsapp", FALLBACK_CONTACT.whatsapp),
      email: str(s, "email", ""),
      instagram: str(s, "instagram", ""),
      facebook: str(s, "facebook", ""),
      tiktok: str(s, "tiktok", ""),
    };
  } catch (err) {
    console.warn("[site] public settings unavailable, using defaults:", err instanceof Error ? err.message : err);
    return FALLBACK_CONTACT;
  }
}

export async function loadRules(): Promise<Rules> {
  if (isBuild()) return { ...DEFAULT_RULES };
  try {
    const { getRules } = await import("@/server/settings");
    const r = await getRules();
    const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);
    return {
      deliveryFee: num(r?.deliveryFee, DEFAULT_RULES.deliveryFee),
      freeDeliveryThreshold: num(r?.freeDeliveryThreshold, DEFAULT_RULES.freeDeliveryThreshold),
      returningDiscountPct: num(r?.returningDiscountPct, DEFAULT_RULES.returningDiscountPct),
    };
  } catch (err) {
    console.warn("[site] rules unavailable, using defaults:", err instanceof Error ? err.message : err);
    return { ...DEFAULT_RULES };
  }
}

type Catalog = Awaited<ReturnType<typeof import("@/server/catalog").listProducts>>;

export async function loadProducts(): Promise<Catalog> {
  try {
    const { listProducts } = await import("@/server/catalog");
    const rows = await listProducts();
    return [...rows].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  } catch (err) {
    console.error("[site] catalog unavailable:", err instanceof Error ? err.message : err);
    return [] as unknown as Catalog;
  }
}
