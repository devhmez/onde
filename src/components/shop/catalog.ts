// Serializable product view-model shared by shop server pages and client components (pure, no server-only).
import type { products } from "@/db/schema";
import type { Locale } from "@/i18n/config";
import { withSale } from "@/lib/sale";

export type ProductRow = typeof products.$inferSelect;
export type ProductKind = ProductRow["kind"];
export const PRODUCT_KIND_ORDER: readonly ProductKind[] = ["stand", "card", "keychain", "sticker", "pack"];

/** Models available to the 3D viewer and the TapStory (packs reuse the white stand). */
export type StoryProduct = "stand-white" | "stand-black" | "card" | "keychain" | "sticker";

export type ShopProduct = {
  id: number;
  slug: string;
  kind: ProductKind;
  name: string;
  tagline: string;
  description: string;
  price: number; // millimes
  compareAt: number | null; // millimes
  /** Set while a time-limited sale runs (then price = sale price, compareAt = regular price). */
  saleEndsAt: number | null;
  image: string;
};

/** Minimal shape AddToCartButton accepts: a ShopProduct, or a raw catalog row (nameFr/nameEn). */
export type CartProductInput = {
  id: number;
  slug: string;
  price: number;
  image: string;
  kind?: string;
} & ({ name: string } | { nameFr: string; nameEn: string });

const KNOWN_STILLS = new Set(["stand_white", "stand_black", "card", "keychain", "sticker"]);
export const FALLBACK_STILL = "/products/stand_white.webp";

/** Map any product image path to a still that exists, tolerating `stand-white.webp` vs `stand_white.webp`. */
export function resolveProductImage(image: string | null | undefined, slug = "", kind = ""): string {
  const src = (image ?? "").trim();
  if (/^https:\/\//i.test(src)) return src;
  const m = /^\/products\/([A-Za-z0-9_-]+)\.(webp|png|jpe?g|avif)$/.exec(src);
  if (m) {
    const base = m[1].replace(/-/g, "_");
    if (KNOWN_STILLS.has(base)) return `/products/${base}.webp`;
    return src; // a custom still the owner added
  }
  if (src.startsWith("/")) return src;
  const story = storyProductFor(slug, kind);
  return `/products/${story.replace("-", "_")}.webp`;
}

export function storyProductFor(slug: string, kind?: string): StoryProduct {
  switch (slug) {
    case "stand-white":
    case "stand-black":
    case "card":
    case "keychain":
    case "sticker":
      return slug;
  }
  if (kind === "stand") return /black|noir/i.test(slug) ? "stand-black" : "stand-white";
  if (kind === "card" || kind === "keychain" || kind === "sticker") return kind;
  return "stand-white"; // packs (and anything unknown) use the white stand
}

export function savingsPct(price: number, compareAt: number | null | undefined): number | null {
  if (!compareAt || compareAt <= price || compareAt <= 0) return null;
  const pct = Math.round(((compareAt - price) / compareAt) * 100);
  return pct >= 1 ? pct : null;
}

export function toShopProduct(p: ProductRow, locale: Locale): ShopProduct {
  const fr = locale === "fr";
  return {
    id: p.id,
    slug: p.slug,
    kind: p.kind,
    name: fr ? p.nameFr : p.nameEn,
    tagline: fr ? p.taglineFr : p.taglineEn,
    description: fr ? p.descFr : p.descEn,
    price: p.price,
    compareAt: p.compareAt ?? null,
    saleEndsAt: withSale(p).saleEndsAt,
    image: resolveProductImage(p.image, p.slug, p.kind),
  };
}

export function localizedName(p: CartProductInput, locale: Locale): string {
  if ("name" in p) return p.name;
  return locale === "fr" ? p.nameFr : p.nameEn;
}

/** Posters / silent loops (public/media) that best match each product's TapStory. */
export function storyMedia(story: StoryProduct): { poster: string; video: string; posterV: string; videoV: string } {
  if (story === "stand-white") return { poster: "/media/loop-tapA.webp", video: "/media/loop-tapA.mp4", posterV: "/media/loop-v_tap.webp", videoV: "/media/loop-v_tap.mp4" };
  if (story === "stand-black") return { poster: "/media/loop-black.webp", video: "/media/loop-black.mp4", posterV: "/media/loop-v_black.webp", videoV: "/media/loop-v_black.mp4" };
  return { poster: "/media/loop-family.webp", video: "/media/loop-family.mp4", posterV: "/media/loop-v_family.webp", videoV: "/media/loop-v_family.mp4" };
}

/**
 * Client mirror of the server's destination-URL normalizer: "" for empty, null when invalid, else a full URL
 * (bare domains get https://; tel:/mailto:/sms: are accepted).
 */
export function normalizeLink(raw: string | null | undefined): string | null {
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
