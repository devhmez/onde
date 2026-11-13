"use client";
// Tiny cart store: localStorage-persisted, useSyncExternalStore-based (no extra deps).
// Fly-to-cart: call `addToCart(item, sourceEl)` — it dispatches window event "onde:add-to-cart" with the source rect
// so the nav cart icon can run the flying-thumbnail animation.
import { useSyncExternalStore } from "react";

export type CartItem = {
  productId: number;
  slug: string;
  name: string; // localized at add time
  image: string;
  unitPrice: number; // millimes (display only — server re-prices)
  qty: number;
  businessName?: string;
  destinationUrl?: string;
};
type State = { items: CartItem[]; open: boolean };
const KEY = "onde-cart-v1";
let state: State = { items: [], open: false };
const listeners = new Set<() => void>();
let hydrated = false;

/** Keeps only well-formed lines: a corrupted or outdated saved cart must never crash the site. */
function sanitize(raw: unknown): CartItem[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items) ? (raw as { items: unknown[] }).items : [];
  const out: CartItem[] = [];
  for (const x of list) {
    if (!x || typeof x !== "object") continue;
    const it = x as Record<string, unknown>;
    const qty = Math.min(99, Math.trunc(Number(it.qty)));
    const productId = Number(it.productId);
    const unitPrice = Number(it.unitPrice);
    if (!Number.isInteger(productId) || productId <= 0 || !(qty >= 1) || !Number.isFinite(unitPrice) || unitPrice < 0) continue;
    if (typeof it.slug !== "string" || typeof it.name !== "string" || typeof it.image !== "string") continue;
    out.push({
      productId,
      slug: it.slug,
      name: it.name,
      image: it.image,
      unitPrice,
      qty,
      ...(typeof it.businessName === "string" ? { businessName: it.businessName } : {}),
      ...(typeof it.destinationUrl === "string" ? { destinationUrl: it.destinationUrl } : {}),
    });
  }
  return out.slice(0, 50);
}

function load() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try { const raw = localStorage.getItem(KEY); if (raw) state = { ...state, items: sanitize(JSON.parse(raw)) }; } catch {}
}
function set(next: Partial<State>) {
  state = { ...state, ...next };
  try { localStorage.setItem(KEY, JSON.stringify(state.items)); } catch {}
  listeners.forEach((l) => l());
}
export const cart = {
  get: () => (load(), state),
  subscribe: (l: () => void) => { listeners.add(l); return () => listeners.delete(l); },
  add(item: CartItem, sourceEl?: Element | null) {
    load();
    const i = state.items.findIndex((x) => x.productId === item.productId && x.businessName === item.businessName && x.destinationUrl === item.destinationUrl);
    const items = [...state.items];
    if (i >= 0) items[i] = { ...items[i], qty: Math.min(99, items[i].qty + item.qty) };
    else items.push(item);
    set({ items });
    if (typeof window !== "undefined") {
      const rect = sourceEl?.getBoundingClientRect();
      window.dispatchEvent(new CustomEvent("onde:add-to-cart", { detail: { image: item.image, rect: rect ? { x: rect.x, y: rect.y, w: rect.width, h: rect.height } : null } }));
    }
  },
  setQty(index: number, qty: number) {
    const items = [...state.items];
    if (qty <= 0) items.splice(index, 1); else items[index] = { ...items[index], qty: Math.min(99, qty) };
    set({ items });
  },
  remove(index: number) { const items = [...state.items]; items.splice(index, 1); set({ items }); },
  clear() { set({ items: [] }); },
  open(v = true) { set({ open: v }); },
};
const empty: State = { items: [], open: false };
export function useCart() {
  return useSyncExternalStore(cart.subscribe, cart.get, () => empty);
}
export const cartCount = (s: State) => s.items.reduce((n, i) => n + i.qty, 0);
