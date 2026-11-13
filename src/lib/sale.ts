// Time-limited sale prices (e.g. the launch promo on the review stands: 69 → 59 DT for 30 days).
// Pure and isomorphic: the server re-prices orders with it, pages render the struck-through price and the
// countdown with it. Once `saleEndsAt` has passed, the regular price applies again automatically.

export type SaleFields = {
  price: number; // regular price, millimes
  compareAt: number | null;
  salePrice?: number | null;
  saleEndsAt?: number | null; // unix ms
};

export function saleActive(p: SaleFields, now = Date.now()): boolean {
  return p.salePrice != null && p.saleEndsAt != null && p.salePrice < p.price && now < p.saleEndsAt;
}

/**
 * The price customers pay right now. During an active sale `price` becomes the sale price, `compareAt` the
 * regular price and `saleEndsAt` stays set (for the countdown); otherwise the row is returned with saleEndsAt null.
 */
export function withSale<T extends SaleFields>(p: T, now = Date.now()): T & { saleEndsAt: number | null } {
  // already applied (a stored row always has salePrice < price) — keep it, so calling twice is harmless
  if (p.salePrice != null && p.price === p.salePrice && p.saleEndsAt != null && now < p.saleEndsAt) {
    return { ...p, saleEndsAt: p.saleEndsAt };
  }
  if (!saleActive(p, now)) return { ...p, saleEndsAt: null };
  return { ...p, price: p.salePrice as number, compareAt: p.price, saleEndsAt: p.saleEndsAt as number };
}

/** End of the stand launch promo: 10 Nov 2026, 23:59:59 Tunis time (UTC+1). */
export const STAND_PROMO_ENDS_AT = Date.UTC(2026, 10, 10, 22, 59, 59);
