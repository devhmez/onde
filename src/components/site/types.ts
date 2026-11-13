// Typed shapes of the site-owned message namespaces (messages/<locale>/common.json + home.json)
// and small pure helpers shared by site components (safe in server and client code).

export type CommonDict = {
  nav: {
    home: string;
    shop: string;
    about: string;
    contact: string;
    cart: string;
    menu: string;
    openMenu: string;
    closeMenu: string;
    primary: string;
    language: string;
    switchLocale: string;
    skipToContent: string;
    homeLabel: string;
  };
  cta: { order: string; orderWhatsapp: string; watchFilm: string; call: string; whatsapp: string };
  intro: { skip: string; tagline: string };
  whatsapp: { message: string };
  footer: {
    pitch: string;
    tagline: string;
    explore: string;
    contact: string;
    follow: string;
    legal: string;
    terms: string;
    privacy: string;
    notice: string;
    phone: string;
    whatsapp: string;
    email: string;
    delivery: string;
    rights: string;
    backToTop: string;
    guides: string;
    guideReviewLink: string;
    guideMoreReviews: string;
    restaurants: string;
  };
  meta: { title: string; description: string; ogAlt: string };
  cursor: { drag: string; play: string; view: string };
  status: { loading: string };
};

export type TapProduct = "stand-white" | "stand-black" | "card" | "keychain" | "sticker";

export type StatItem = {
  value: number;
  valueTo?: number;
  prefix: string;
  suffix: string;
  label: string;
  source: string;
};

export type HowStep = { n: string; title: string; body: string; alt: string };
export type RankEntry = { name: string; rating: number; reviews: number; distance: string };

export type HomeDict = {
  meta: { title: string; description: string };
  hero: {
    eyebrow: string;
    title: { text: string; accent?: string }[];
    sub: string;
    ctaOrder: string;
    ctaFilm: string;
    trust: string[];
    scroll: string;
    badge: string;
    standAlt: string;
  };
  drum: {
    label: string;
    lead: string;
    tap: string;
    opens: string;
    foot: string;
    /** kind: review | menu | instagram | whatsapp | website | tiktok | contact · menu lines are "name|price". */
    items: { word: string; dest: string; kind: string; code: string; lines: string[] }[];
  };
  stats: { eyebrow: string; title: string; sub: string; items: StatItem[]; outro: string };
  tapstory: {
    eyebrow: string;
    title: string;
    sub: string;
    pick: string;
    loading: string;
    products: Record<TapProduct, string>;
  };
  how: {
    eyebrow: string;
    title: string;
    steps: HowStep[];
    review: { posted: string; rating: string };
    rank: {
      query: string;
      illustrative: string;
      reviews: string;
      entries: RankEntry[];
      you: {
        name: string;
        distance: string;
        fromRating: number;
        fromReviews: number;
        toRating: number;
        toReviews: number;
      };
    };
  };
  smart: {
    eyebrow: string;
    title: string[];
    body: string;
    points: string[];
    chip: string;
    chipSub: string;
    permanent: string;
    cloud: string;
    updated: string;
    now: string;
    destinations: string[];
    illustrative: string;
  };
  products: {
    eyebrow: string;
    title: string;
    sub: string;
    add: string;
    details: string;
    seeAll: string;
    drag: string;
    prev: string;
    next: string;
    save: string;
    promo: string;
    kinds: Record<"stand" | "card" | "keychain" | "sticker" | "pack", string>;
    empty: string;
    emptyCta: string;
  };
  offers: {
    eyebrow: string;
    title: string;
    delivery: { title: string; body: string; badge: string; done: string };
    returning: { title: string; body: string; badge: string; example: string };
    cod: { title: string; body: string; badge: string; paid: string };
  };
  film: { eyebrow: string; title: string; caption: string; cta: string; duration: string };
  /** link.href is a site path without the locale prefix ("/guides/google-review-link"). */
  faq: { eyebrow: string; title: string; items: { q: string; a: string; link?: { href: string; label: string } }[]; more: string; moreCta: string };
  final: { eyebrow: string; title: string; body: string; order: string; whatsapp: string; call: string };
};

/** Public contact info resolved from settings (empty strings = hidden). */
export type SiteContact = {
  phone: string; // 8 digits, e.g. "25875529"
  whatsapp: string; // international digits, e.g. "21625875529"
  email: string;
  instagram: string;
  facebook: string;
  tiktok: string;
};

/** Replace {key} placeholders. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** "+216 25 875 529" from "25875529". */
export function formatPhone(phone8: string): string {
  const d = phone8.replace(/\D/g, "").slice(-8);
  if (d.length !== 8) return phone8;
  return `+216 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`;
}

export function telHref(phone8: string): string {
  const d = phone8.replace(/\D/g, "");
  return d.length === 8 ? `tel:+216${d}` : `tel:+${d}`;
}

export function whatsappHref(number: string, message?: string): string {
  const d = number.replace(/\D/g, "");
  return `https://wa.me/${d}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

/** Keep amounts on one line ("59 DT" → "59 DT" with a no-break space). */
export function nbsp(s: string): string {
  return s.replace(/ (DT|%)/g, " $1");
}

/** Social handle or URL → absolute URL (empty string when unset). */
export function socialHref(kind: "instagram" | "facebook" | "tiktok", value: string): string {
  const v = value.trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, "");
  if (kind === "instagram") return `https://instagram.com/${handle}`;
  if (kind === "facebook") return `https://facebook.com/${handle}`;
  return `https://www.tiktok.com/@${handle}`;
}

/** Product stills live at /products/<file>.webp with underscores (stand_white). Normalise legacy hyphenated paths. */
const PRODUCT_FILES: Record<string, string> = {
  "stand-white": "/products/stand_white.webp",
  "stand-black": "/products/stand_black.webp",
  card: "/products/card.webp",
  keychain: "/products/keychain.webp",
  sticker: "/products/sticker.webp",
};

export function productImage(image: string | null | undefined, slug?: string): string {
  const m = (image ?? "").match(/^\/products\/(stand-white|stand-black)\.webp$/);
  if (m) return PRODUCT_FILES[m[1]];
  if (image) return image;
  return (slug && PRODUCT_FILES[slug]) || PRODUCT_FILES["stand-white"];
}

export const TAP_PRODUCTS: TapProduct[] = ["stand-white", "stand-black", "card", "keychain", "sticker"];
export const TAP_PRODUCT_IMAGES: Record<TapProduct, string> = {
  "stand-white": PRODUCT_FILES["stand-white"],
  "stand-black": PRODUCT_FILES["stand-black"],
  card: PRODUCT_FILES.card,
  keychain: PRODUCT_FILES.keychain,
  sticker: PRODUCT_FILES.sticker,
};
