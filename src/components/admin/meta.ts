// Labels, swatches and tones shared by every admin screen (mirrors the dashboard in the ONDE film).
import type { CSSProperties } from "react";
import { standVariant } from "@/lib/business";
import type { ChipStatus, DestinationType, OrderChannel, OrderStatus, ProductKind, TagKind } from "./types";

export const DEST_TYPES = [
  "google_review",
  "instagram",
  "tiktok",
  "facebook",
  "menu",
  "website",
  "contact",
  "whatsapp",
  "custom",
] as const satisfies readonly DestinationType[];

type DestMeta = { label: string; swatch: CSSProperties; placeholder: string; hint: string };

export const DEST_META: Record<DestinationType, DestMeta> = {
  google_review: {
    label: "Google Reviews",
    swatch: { background: "#fff" },
    placeholder: "https://g.page/r/…/review",
    hint: "Google Business Profile → “Ask for reviews” → copy the link.",
  },
  instagram: {
    label: "Instagram",
    swatch: { background: "linear-gradient(135deg,#F58529,#DD2A7B,#8134AF)" },
    placeholder: "@cafelumiere or https://instagram.com/…",
    hint: "A @handle is enough — it becomes instagram.com/handle.",
  },
  tiktok: {
    label: "TikTok",
    swatch: { background: "#111", border: "1px solid #333" },
    placeholder: "@handle or https://www.tiktok.com/@…",
    hint: "A @handle is enough — it becomes tiktok.com/@handle.",
  },
  facebook: {
    label: "Facebook",
    swatch: { background: "linear-gradient(135deg,#3B8BFF,#1564D9)" },
    placeholder: "https://facebook.com/…",
    hint: "Page URL or page username.",
  },
  menu: {
    label: "Digital menu",
    swatch: { background: "linear-gradient(135deg,#7B5CFF,#461CF7)" },
    placeholder: "https://menu.example.tn",
    hint: "Any online menu: PDF link, menu site, ordering page.",
  },
  website: {
    label: "Website",
    swatch: { background: "#2B2A33" },
    placeholder: "https://www.example.tn",
    hint: "Any web page.",
  },
  contact: {
    label: "Contact card",
    swatch: { background: "linear-gradient(135deg,#5FB8FF,#2A6FDB)" },
    placeholder: "Phone (25 875 529) or link to a vCard",
    hint: "A phone number becomes a tap-to-call link.",
  },
  whatsapp: {
    label: "WhatsApp",
    swatch: { background: "#25D366" },
    placeholder: "25 875 529 or https://wa.me/216…",
    hint: "An 8-digit Tunisian number becomes wa.me/216…",
  },
  custom: {
    label: "Custom link",
    swatch: { background: "linear-gradient(135deg,#F5A524,#F0596A)" },
    placeholder: "https://…",
    hint: "Anything else: booking page, Linktree, promo, playlist…",
  },
};

export const TAG_KINDS = ["stand", "card", "keychain", "sticker"] as const satisfies readonly TagKind[];
export const KIND_LABEL: Record<TagKind, string> = {
  stand: "Review stand",
  card: "NFC card",
  keychain: "Keychain",
  sticker: "Sticker",
};
/** Kind as a noun inside a sentence ("2 review stands", "an NFC card"). */
export const kindNoun = (k: TagKind) => (k === "card" ? "NFC card" : KIND_LABEL[k].toLowerCase());
export const KIND_IMAGE: Record<TagKind, string> = {
  stand: "/products/stand_white.webp",
  card: "/products/card.webp",
  keychain: "/products/keychain.webp",
  sticker: "/products/sticker.webp",
};

/** "+ Add stock" presets — products prepared in advance (printed, chip written) before a customer buys them. */
export const STOCK_MODELS = [
  { id: "stand-white", kind: "stand", label: "Review stand (white)", short: "White stand", image: "/products/stand_white.webp" },
  { id: "stand-black", kind: "stand", label: "Review stand (black)", short: "Black stand", image: "/products/stand_black.webp" },
  { id: "card", kind: "card", label: "NFC card", short: "NFC card", image: "/products/card.webp" },
  { id: "keychain", kind: "keychain", label: "Keychain", short: "Keychain", image: "/products/keychain.webp" },
  { id: "sticker", kind: "sticker", label: "Sticker", short: "Sticker", image: "/products/sticker.webp" },
] as const satisfies readonly { id: string; kind: TagKind; label: string; short: string; image: string }[];

/** Physical chip of a product, as tracked in the admin (replaces the paper boxes of the chip sheet). */
export const CHIP_STATUSES = ["none", "written", "tested", "locked"] as const satisfies readonly ChipStatus[];
export const CHIP_META: Record<ChipStatus, { label: string; short: string; tone: Tone; hint: string }> = {
  none: { label: "Not written", short: "Chip ✗", tone: "gray", hint: "Write https://onde.tn/t/CODE to the chip with NFC Tools." },
  written: { label: "Written", short: "Written", tone: "sky", hint: "Tap it with a phone to test — a real NFC tap marks it tested by itself." },
  tested: { label: "Tested", short: "Tested", tone: "on", hint: "A tap reached the link. Lock it in NFC Tools (Other → Lock tag) if you want." },
  locked: { label: "Locked", short: "Locked", tone: "vio", hint: "Read-only forever. The destination still changes from here." },
};

/** "Review stand (white)", "Review stand (black)", "NFC card"… — the product a link is, without the owner prefix. */
export const productLabel = (t: { kind: TagKind; label: string }) => {
  const v = standVariant(t);
  return v ? `Review stand (${v})` : KIND_LABEL[t.kind];
};

/** Admin page of one stand (any smart link), opened from search, customer and order screens. */
export const standHref = (code: string) => `/admin/stands/${encodeURIComponent(code)}`;

/** "In stock" = made in advance, not sold yet: no customer and no destination (same rule as the server's stock filter). */
export const isStock = (t: { customerId: number | null; destinationUrl: string }) => t.customerId == null && !t.destinationUrl;

/** Admin download URLs of the print files (owner's stand design + QR) — see src/app/api/admin/print. */
export const printZipHref = (q: { ids?: number[]; stock?: boolean; unprinted?: boolean; kind?: TagKind | ""; bleed?: boolean }) => {
  const sp = new URLSearchParams();
  if (q.stock) {
    sp.set("stock", "1");
    if (q.unprinted) sp.set("unprinted", "1");
  } else sp.set("ids", (q.ids ?? []).join(","));
  if (q.kind) sp.set("kind", q.kind);
  if (q.bleed) sp.set("bleed", "1");
  return `/api/admin/print?${sp.toString()}`;
};
export const printFileHref = (id: number, format: "png" | "pdf", bleed = false) =>
  `/api/admin/tags/${id}/print?format=${format}${bleed ? "&bleed=1" : ""}`;
/** Shown wherever a black stand's print is requested before the owner supplies the black design. */
export const NO_BLACK_DESIGN = "Black stand print design not available yet";

export const PRODUCT_KINDS = ["stand", "card", "keychain", "sticker", "pack"] as const satisfies readonly ProductKind[];
export const PRODUCT_KIND_LABEL: Record<ProductKind, string> = { ...KIND_LABEL, pack: "Pack" };

export const ORDER_STATUSES = [
  "new",
  "confirmed",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
] as const satisfies readonly OrderStatus[];
/** The happy path shown by the status stepper. */
export const ORDER_FLOW = ["new", "confirmed", "preparing", "shipped", "delivered"] as const satisfies readonly OrderStatus[];

export type Tone = "on" | "off" | "vio" | "gold" | "sky" | "gray";
export const ORDER_STATUS_META: Record<OrderStatus, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "vio" },
  confirmed: { label: "Confirmed", tone: "sky" },
  preparing: { label: "Preparing", tone: "gold" },
  shipped: { label: "Shipped", tone: "sky" },
  delivered: { label: "Delivered", tone: "on" },
  cancelled: { label: "Cancelled", tone: "off" },
};

export const CHANNEL_LABEL: Record<OrderChannel, string> = { web: "Website", whatsapp: "WhatsApp", manual: "Manual" };
/** Channel as shown in lists: an in-person sale (Sell this stand) is a manual order paid at the counter. */
export const channelLabel = (o: { channel: OrderChannel; paymentMethod: string }) => (o.paymentMethod === "in_person" ? "In person" : CHANNEL_LABEL[o.channel]);
/** orders.paymentMethod → label ("in_person" = sold and handed over at the counter, see Sell a stand). */
export const paymentLabel = (m: string) => (m === "cod" ? "Cash on delivery" : m === "in_person" ? "Paid in person" : m);

/** Product images that ship in /public/products (for the catalog image picker). */
export const PRODUCT_IMAGES = [
  "/products/stand_white.webp",
  "/products/stand_black.webp",
  "/products/card.webp",
  "/products/keychain.webp",
  "/products/sticker.webp",
] as const;
export const PRODUCT_MODELS = [
  "/models/stand_white.glb",
  "/models/stand_black.glb",
  "/models/card.glb",
  "/models/keychain.glb",
  "/models/sticker.glb",
] as const;

export const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/qr", label: "QR codes" },
  { href: "/admin/catalog", label: "Catalog" },
  { href: "/admin/settings", label: "Settings" },
] as const;
