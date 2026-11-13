import "server-only";
// Cookie-less, PII-free page-view analytics. A visitor is a daily-salted hash of IP + user agent (not reversible, not
// linkable across days); only the referrer origin is kept; bots and admin/API paths are ignored. Rows older than
// 25 months are purged by the daily retention pass (./retention), which recording a view triggers.
import { getDb } from "../db";
import { pageViews } from "../db/schema";
import { isBot, parseDevice } from "../lib/ua";
import { runRetention } from "./retention";
import { dailyHash, referrerOrigin } from "./util";

const isIgnored = (p: string) =>
  p === "/admin" || p.startsWith("/admin/") || p === "/api" || p.startsWith("/api/") || p.startsWith("/_next/") || p.startsWith("/t/");

/** Normalize a tracked path: pathname only (no query/hash), max 200 chars; null when not trackable. */
export function normalizeTrackedPath(raw: string): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/")) return null;
  let p = raw.split(/[?#]/)[0] ?? "";
  try {
    p = decodeURIComponent(p);
  } catch {
    /* keep encoded */
  }
  p = p.replace(/\/{2,}/g, "/");
  if (p.length > 1) p = p.replace(/\/$/, "");
  if (!p || p.length > 200 || /[\u0000-\u001f]/.test(p)) return null;
  if (isIgnored(p)) return null;
  // Every public page lives under a locale prefix — anything else is noise (or someone polluting the stats).
  if (!/^\/(fr|en)(\/|$)/.test(p)) return null;
  return p;
}

export async function recordPageView(input: {
  path: string;
  locale?: string;
  userAgent?: string | null;
  referrer?: string | null;
  ip?: string | null;
  /** Host of this site — same-site referrers are dropped. */
  host?: string | null;
}): Promise<void> {
  try {
    if (isBot(input.userAgent)) return;
    const path = normalizeTrackedPath(input.path);
    if (!path) return;
    const locale = input.locale === "fr" || input.locale === "en" ? input.locale : null;
    getDb()
      .insert(pageViews)
      .values({
        ts: Date.now(),
        path,
        locale,
        device: parseDevice(input.userAgent),
        referrer: referrerOrigin(input.referrer, input.host),
        visitor: dailyHash(input.ip ?? "", input.userAgent ?? ""),
      })
      .run();
    runRetention();
  } catch (err) {
    console.error("[onde] recordPageView failed", err);
  }
}
