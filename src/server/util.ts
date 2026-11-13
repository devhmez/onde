import "server-only";
import { createHash } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

/** Africa/Tunis is UTC+1 all year (no DST since 2009) — all "per day" analytics use Tunisian calendar days. */
export const TZ_OFFSET_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" of a unix-ms timestamp in Tunisian time. */
export function dayKey(ts: number): string {
  return new Date(ts + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/** Unix ms of 00:00 Tunisian time on the day containing `ts`. */
export function startOfDay(ts: number): number {
  return Math.floor((ts + TZ_OFFSET_MS) / DAY_MS) * DAY_MS - TZ_OFFSET_MS;
}

/** Unix ms of 00:00 Tunisian time on the 1st of the month containing `ts`. */
export function startOfMonth(ts: number): number {
  const d = new Date(ts + TZ_OFFSET_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - TZ_OFFSET_MS;
}

/** SQL expression giving the Tunisian "YYYY-MM-DD" of a unix-ms integer column. */
export function sqlDay(col: SQLiteColumn): SQL<string> {
  return sql<string>`strftime('%Y-%m-%d', (${col} + ${sql.raw(String(TZ_OFFSET_MS))}) / 1000, 'unixepoch')`;
}

/** The last `days` Tunisian day keys, oldest first, ending today. */
export function lastDays(days: number, now = Date.now()): string[] {
  const n = clampInt(days, 1, 730, 30);
  const today = startOfDay(now);
  return Array.from({ length: n }, (_, i) => dayKey(today - (n - 1 - i) * DAY_MS));
}

function secret(): string {
  return process.env.SESSION_SECRET || "onde-dev-secret";
}

/**
 * Privacy-preserving daily hash: sha256(parts + YYYY-MM-DD + SESSION_SECRET). The same visitor hashes identically within
 * a day (unique counts) but cannot be linked across days or reversed to an IP.
 */
export function dailyHash(...parts: string[]): string {
  return createHash("sha256")
    .update(parts.join("|") + dayKey(Date.now()) + secret())
    .digest("hex")
    .slice(0, 32);
}

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** Case-insensitive "contains" with LIKE wildcards in the needle escaped. */
export function contains(col: SQLiteColumn | SQL, needle: string): SQL {
  const escaped = needle.replace(/[\\%_]/g, (c) => `\\${c}`);
  return sql`${col} LIKE ${`%${escaped}%`} ESCAPE '\\'`;
}

/** Keep only scheme + host of a referrer (no paths/queries → no PII). Null when absent/invalid or same-site. */
export function referrerOrigin(raw: string | null | undefined, selfHost?: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (selfHost && u.host === selfHost) return null;
    return `${u.protocol}//${u.host}`.slice(0, 200);
  } catch {
    return null;
  }
}

/** Trim to a string or null (empty → null), with a max length. */
export function optText(value: unknown, max = 500): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
}
