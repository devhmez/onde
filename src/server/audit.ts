import "server-only";
import { desc } from "drizzle-orm";
import { getDb, type Executor } from "../db";
import { auditLog } from "../db/schema";
import type { AuditLogEntry } from "./types";

/** Append an audit entry. Pass the transaction handle when called inside one. Never throws. */
export function audit(action: string, details?: Record<string, unknown> | string | null, executor?: Executor): void {
  try {
    const exec = executor ?? getDb();
    const text = details == null ? null : typeof details === "string" ? details : JSON.stringify(details);
    exec.insert(auditLog).values({ ts: Date.now(), action, details: text }).run();
  } catch (err) {
    console.error("[onde] audit log write failed", action, err);
  }
}

/** Most recent audit entries (admin activity feed). */
export async function listAudit(limit = 50): Promise<AuditLogEntry[]> {
  const n = Math.min(Math.max(1, Math.trunc(limit) || 50), 500);
  return getDb().select().from(auditLog).orderBy(desc(auditLog.ts), desc(auditLog.id)).limit(n).all();
}
