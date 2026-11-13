import "server-only";
// Server-side helpers shared by the admin pages and actions (private folder — not routable).
import type { SettingsView, Tag, TagDetail, TagRow } from "@/components/admin/types";
import { getDb } from "@/db";
import type { getSettings } from "@/server/settings";
import { inPersonSaleOf } from "@/server/stands";
import { smartLink, type getTag } from "@/server/tags";

export function toTagRow(tag: Tag & { customerName?: string | null }, customerName?: string | null): TagRow {
  return {
    ...tag,
    customerName: customerName !== undefined ? customerName : (tag.customerName ?? null),
    link: smartLink(tag.code),
  };
}

/** The edit panel's data for a loaded tag (Products workspace, stand page). */
export function toTagDetail(t: NonNullable<Awaited<ReturnType<typeof getTag>>>): TagDetail {
  const customerName = t.customer ? t.customer.businessName?.trim() || t.customer.name : null;
  return {
    row: toTagRow(t, customerName),
    taps30d: t.taps30d,
    history: t.history,
    customer: t.customer ? { id: t.customer.id, name: t.customer.name, businessName: t.customer.businessName, phone: t.customer.phone } : null,
    order: t.order,
    printedAt: t.printedAt,
    inPersonSale: inPersonSaleOf(getDb(), t),
  };
}

/** Public site origin (same env the smart links use). */
export const siteUrl = () => (process.env.PUBLIC_BASE_URL?.trim() || "https://onde.tn").replace(/\/+$/, "");

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function str(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

export function int(v: string | string[] | undefined, fallback: number, min = 1, max = 1_000_000): number {
  const n = Number.parseInt(str(v), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function oneOf<T extends string>(v: string | string[] | undefined, allowed: readonly T[]): T | undefined {
  const s = str(v);
  return (allowed as readonly string[]).includes(s) ? (s as T) : undefined;
}

/** Settings as the admin form sees them. */
export function settingsView(s: Awaited<ReturnType<typeof getSettings>>): SettingsView {
  return {
    deliveryFee: s.deliveryFee,
    freeDeliveryThreshold: s.freeDeliveryThreshold,
    returningDiscountPct: s.returningDiscountPct,
    phone: s.phone,
    whatsapp: s.whatsapp,
    email: s.email,
    instagram: s.instagram,
    facebook: s.facebook,
    tiktok: s.tiktok,
    legalName: s.legalName,
    taxId: s.taxId,
    address: s.address,
    storeOpen: s.storeOpen,
  };
}
