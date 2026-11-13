// Shop i18n helpers — safe on server and client (no React, no server-only imports).
// Client components that are mounted outside a page with a `dict` (CartButton, CartDrawer, AddToCartButton…)
// read the same messages/<locale>/shop.json files statically, so FR/EN copy always comes from one source.
import fr from "../../../messages/fr/shop.json";
import en from "../../../messages/en/shop.json";
import type { Locale } from "@/i18n/config";

export type ShopMessages = typeof fr;

const MESSAGES: Record<Locale, ShopMessages> = { fr, en };

export function shopLocale(value: unknown): Locale {
  return value === "en" ? "en" : "fr";
}

export function getShopMessages(locale: unknown): ShopMessages {
  return MESSAGES[shopLocale(locale)];
}

/** Accepts the full dictionary (`dict.shop`), the shop namespace itself, or nothing — falls back to the bundled JSON. */
export function resolveShopMessages(dict: unknown, locale: unknown): ShopMessages {
  if (dict && typeof dict === "object") {
    const d = dict as Record<string, unknown>;
    const ns = d.shop;
    if (ns && typeof ns === "object" && "drawer" in ns && "summary" in ns) return ns as ShopMessages;
    if ("drawer" in d && "summary" in d) return d as unknown as ShopMessages;
  }
  return getShopMessages(locale);
}

/** Tiny `{placeholder}` interpolation. Unknown placeholders are left untouched. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}

/** "+216 25 875 529" from any 8-digit (or 216-prefixed) number. */
export function displayPhone(raw: string): string {
  const d = (raw || "").replace(/\D/g, "").replace(/^216(?=\d{8}$)/, "");
  if (d.length !== 8) return raw;
  return `+216 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`;
}
