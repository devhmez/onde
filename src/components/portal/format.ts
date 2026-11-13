// Client-page formatting (French / English, Tunisian time). Pure — rendered on the server so the client never
// re-formats (no hydration drift between the server's clock and the phone's).
import type { Locale } from "@/i18n/config";

const TZ = "Africa/Tunis";
const tag = (l: Locale) => (l === "fr" ? "fr-FR" : "en-GB");

export const fmtNumber = (n: number, l: Locale) => new Intl.NumberFormat(l === "fr" ? "fr-FR" : "en-US").format(Math.round(n || 0));

/** "il y a 2 heures" / "2 hours ago"; dates older than a week as "3 oct." / "3 Oct". */
export function relTime(ts: number, l: Locale, now = Date.now()): string {
  const s = Math.round((ts - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(tag(l), { numeric: "auto" });
  const abs = Math.abs(s);
  if (abs < 60) return rtf.format(0, "second");
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (abs < 7 * 86400) return rtf.format(Math.round(s / 86400), "day");
  return new Intl.DateTimeFormat(tag(l), { timeZone: TZ, day: "numeric", month: "short" }).format(new Date(ts));
}

/** "2026-10-03" → "3 oct." / "3 Oct". */
export function dayLabel(date: string, l: Locale): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return new Intl.DateTimeFormat(tag(l), { timeZone: "UTC", day: "numeric", month: "short" }).format(d);
}

/** "2026-10-03" → "vendredi 3 octobre" / "Friday 3 October" (table view, screen readers). */
export function longDayLabel(date: string, l: Locale): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return new Intl.DateTimeFormat(tag(l), { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(d);
}

/** "13 oct., 21:04" in Tunisian time. */
export function clockLabel(ts: number, l: Locale): string {
  return new Intl.DateTimeFormat(tag(l), { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date(ts),
  );
}

/** "https://www.instagram.com/cafe/" → "instagram.com/cafe". */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}
