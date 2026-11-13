// Formatting helpers for the admin (English UI, Tunisian time zone so server and client render identically).
import { formatDT } from "@/lib/business";

const TZ = "Africa/Tunis";
const intFmt = new Intl.NumberFormat("en-US");
const dateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
const shortDateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

export const fmtInt = (n: number) => intFmt.format(Math.round(n || 0));
export const fmtMoney = (millimes: number) => formatDT(Math.round(millimes || 0), "en");

/** 95.8 → "95.8%", 100 → "100%". */
export function fmtPct(n: number, digits = 1) {
  const v = Number.isFinite(n) ? n : 0;
  const s = v.toFixed(digits);
  return `${s.includes(".") ? s.replace(/\.?0+$/, "") : s}%`;
}

export const fmtDate = (ts: number) => dateFmt.format(new Date(ts));
export const fmtShortDate = (ts: number) => shortDateFmt.format(new Date(ts));
export const fmtTime = (ts: number) => timeFmt.format(new Date(ts));
export const fmtDateTime = (ts: number) => `${shortDateFmt.format(new Date(ts))}, ${timeFmt.format(new Date(ts))}`;
/** YYYY-MM-DD in Tunis time (for comparing with stats series dates). */
export const dayKey = (ts: number) => dayKeyFmt.format(new Date(ts));

/** "2026-10-09" → "9 Oct" (series labels). Falls back to the raw string. */
export function fmtSeriesDate(date: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }).format(d);
}

export function timeAgo(ts: number | null | undefined, now = Date.now()) {
  if (!ts) return "never";
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  return fmtShortDate(ts);
}

/** "https://onde.tn/t/A7K92X" → "onde.tn/t/A7K92X" */
export const displayLink = (url: string) => url.replace(/^https?:\/\//i, "").replace(/\/$/, "");

/** "25875529" → "25 875 529" */
export const fmtPhone = (p: string) => (/^\d{8}$/.test(p) ? p.replace(/(\d{2})(\d{3})(\d{3})/, "$1 $2 $3") : p);

/** Millimes → editable DT string with 3 decimals ("59.000"). */
export const toDTInput = (millimes: number | null | undefined) => (millimes == null ? "" : (millimes / 1000).toFixed(3));

/** "59", "59.5", "59,500" → 59500 millimes. null when empty, NaN when invalid. */
export function parseDT(input: string): number | null {
  const s = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  if (!/^\d+(\.\d{0,3})?$/.test(s)) return Number.NaN;
  return Math.round(Number(s) * 1000);
}

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

/** Short display name for a customer: business first, then person. */
export const customerDisplay = (c: { name: string; businessName?: string | null }) => c.businessName?.trim() || c.name;

/** "Sami · " under a business name — empty when there is no business or the contact name is the business itself. */
export const contactPrefix = (c: { name: string; businessName?: string | null }) => {
  const b = c.businessName?.trim();
  return b && c.name.trim() && c.name.trim().toLowerCase() !== b.toLowerCase() ? `${c.name.trim()} · ` : "";
};
