// Business rules shared by client (live cart totals) and server (authoritative order pricing).
// All money values are integer millimes (1 DT = 1000 millimes).

export const BRAND = {
  name: "ONDE",
  domain: "onde.tn",
  phoneDisplay: "+216 25 875 529",
  phoneE164: "+21625875529",
  whatsapp: "21625875529", // wa.me/<this>
} as const;

export const DEFAULT_RULES = {
  deliveryFee: 7000, // 7 DT
  freeDeliveryThreshold: 99000, // free delivery for item subtotals >= 99 DT
  returningDiscountPct: 10, // one-time 10% on the next order after a delivered order
} as const;

export type Rules = { deliveryFee: number; freeDeliveryThreshold: number; returningDiscountPct: number };
export type PricedLine = { unitPrice: number; qty: number };

export function priceOrder(lines: PricedLine[], opts: { rules?: Rules; returningDiscount?: boolean } = {}) {
  const rules = opts.rules ?? DEFAULT_RULES;
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const discount = opts.returningDiscount ? Math.round((subtotal * rules.returningDiscountPct) / 100) : 0;
  const freeDelivery = subtotal >= rules.freeDeliveryThreshold;
  const deliveryFee = subtotal === 0 || freeDelivery ? 0 : rules.deliveryFee;
  const total = subtotal - discount + deliveryFee;
  const remainingForFree = Math.max(0, rules.freeDeliveryThreshold - subtotal);
  return { subtotal, discount, deliveryFee, total, freeDelivery, remainingForFree };
}

export const GOVERNORATES = [
  "Ariana", "Béja", "Ben Arous", "Bizerte", "Gabès", "Gafsa", "Jendouba", "Kairouan", "Kasserine", "Kébili",
  "Le Kef", "Mahdia", "La Manouba", "Médenine", "Monastir", "Nabeul", "Sfax", "Sidi Bouzid", "Siliana", "Sousse",
  "Tataouine", "Tozeur", "Tunis", "Zaghouan",
] as const;

/** Normalize a Tunisian phone to 8 digits (accepts +216 / 00216 prefixes, spaces, dashes). Returns null if invalid. */
export function normalizePhone(input: string): string | null {
  let d = (input || "").replace(/[^\d+]/g, "");
  if (d.startsWith("+216")) d = d.slice(4);
  else if (d.startsWith("00216")) d = d.slice(5);
  else if (d.startsWith("216") && d.length === 11) d = d.slice(3);
  d = d.replace(/\D/g, "");
  return /^[2-9]\d{7}$/.test(d) ? d : null;
}

/** "59 DT" for whole dinars, "12.500 DT" otherwise (Tunisian 3-decimal convention). */
export function formatDT(millimes: number, locale: "en" | "fr" = "fr") {
  const whole = millimes % 1000 === 0;
  const n = millimes / 1000;
  const s = whole ? String(n) : n.toFixed(3);
  return locale === "fr" ? `${s.replace(".", ",")} DT` : `${s} DT`;
}

/** Smart-link code alphabet: no 0/O, 1/I/L, 2/Z, 5/S, 8/B look-alikes. */
export const CODE_ALPHABET = "ACDEFGHJKMNPQRTUVWXY34679";
export const CODE_LENGTH = 6;

/**
 * Demo codes printed on the stands in ONDE's own videos (reels, trailer, deck). Viewers scan them off the screen, so
 * /t/<demo code> opens the ONDE home page instead of the "not activated" page, and they are never generated for a
 * customer. A real tag with the same code (impossible after this list existed) would still take precedence.
 */
export const DEMO_CODES: ReadonlySet<string> = new Set(["K7M4QX", "A7K92X", "XPY7N4", "H9T3RC", "W4P7NA", "M3QJ6V"]);

/**
 * Which print design a review stand gets, from its label: "Review stand (black)" (stock links, order links
 * "Café X — Review stand (black) #1") → the black design, any other stand → the white one, other kinds → none.
 * Selling a stock link only prefixes the customer name, so the colour stays readable after the sale. Only the LAST
 * colour marker counts: the product part always ends the label, so a business called "Le Chat (Noir)" never turns its
 * white stand black ("Le Chat (Noir) — Review stand (white)").
 */
export type StandVariant = "white" | "black";
export function standVariant(t: { kind: string; label: string }): StandVariant | null {
  if (t.kind !== "stand") return null;
  const last = [...t.label.matchAll(/\((black|noir|white|blanc)\)/gi)].pop();
  return last && /^(black|noir)$/i.test(last[1]) ? "black" : "white";
}

/**
 * The product part of a stand label with its colour spelled out ("Review stand" → "Review stand (white)"), used when
 * the owner's name is put in front of it: the name may itself contain "(Noir)", and only the last marker counts.
 */
export function withStandColour(t: { kind: string; label: string }): string {
  if (t.kind !== "stand" || /\((black|noir|white|blanc)\)/i.test(t.label)) return t.label;
  return `${t.label} (${standVariant(t)})`;
}
