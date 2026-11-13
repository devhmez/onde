// Public shop settings as the storefront needs them (pure — usable by server pages and client hooks).
import { BRAND, DEFAULT_RULES, type Rules } from "@/lib/business";

export type ShopSettings = {
  rules: Rules;
  whatsapp: string; // international digits for wa.me
  phone: string; // 8 local digits
  storeOpen: boolean;
};

export const DEFAULT_SHOP_SETTINGS: ShopSettings = {
  rules: { ...DEFAULT_RULES },
  whatsapp: BRAND.whatsapp,
  phone: BRAND.phoneE164.replace(/^\+216/, ""),
  storeOpen: true,
};

function toNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Money values are millimes; a value that only makes sense in dinars (0 < v < 1000) is converted defensively. */
function money(v: unknown, fallback: number): number {
  const n = toNumber(v);
  if (n === null || n < 0) return fallback;
  return n > 0 && n < 1000 ? Math.round(n * 1000) : Math.round(n);
}

/** Accepts the PublicSettings object (server) or the /api/settings/public JSON (client). */
export function normalizeShopSettings(raw: unknown): ShopSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_SHOP_SETTINGS;
  const r = raw as Record<string, unknown>;
  const d = DEFAULT_SHOP_SETTINGS;
  const pct = toNumber(r.returningDiscountPct);
  const waDigits = String(r.whatsapp ?? "").replace(/\D/g, "").replace(/^00/, "");
  const whatsapp = /^[2-9]\d{7}$/.test(waDigits) ? `216${waDigits}` : /^\d{8,15}$/.test(waDigits) ? waDigits : d.whatsapp;
  const phoneDigits = String(r.phone ?? "").replace(/\D/g, "").replace(/^216(?=\d{8}$)/, "");
  return {
    rules: {
      deliveryFee: money(r.deliveryFee, d.rules.deliveryFee),
      freeDeliveryThreshold: money(r.freeDeliveryThreshold, d.rules.freeDeliveryThreshold),
      returningDiscountPct: pct === null ? d.rules.returningDiscountPct : Math.min(100, Math.max(0, Math.round(pct))),
    },
    whatsapp,
    phone: /^\d{8}$/.test(phoneDigits) ? phoneDigits : d.phone,
    storeOpen: r.storeOpen === undefined ? true : r.storeOpen === true || r.storeOpen === "true",
  };
}
