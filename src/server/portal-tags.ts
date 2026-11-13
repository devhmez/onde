import "server-only";
// Client page (src/server/portal.ts) ↔ smart links: what has to happen when a product moves to another customer.
// Kept apart from portal.ts so src/server/tags.ts can call it without an import cycle (portal.ts imports tags.ts).
import { and, eq } from "drizzle-orm";
import type { Executor } from "../db";
import { portalRequests, tags } from "../db/schema";
import { audit } from "./audit";

/**
 * A product changed hands (its customer was set, changed or removed). Called inside updateTag's transaction.
 *   • customer_since = now: the new owner's client page counts taps from here, never the previous owner's;
 *   • the location label is the previous owner's ("Bureau de Rania") — cleared;
 *   • the previous owner's pending request on it can no longer be decided — cancelled.
 */
export function onTagReassigned(tx: Executor, tag: { id: number; code: string }, from: number | null, to: number | null, now: number): void {
  tx.update(tags).set({ customerSince: now, locationLabel: null }).where(eq(tags.id, tag.id)).run();
  const cancelled = tx
    .update(portalRequests)
    .set({ status: "cancelled", decidedAt: now })
    .where(and(eq(portalRequests.tagId, tag.id), eq(portalRequests.status, "pending")))
    .run().changes;
  audit("portal.reassigned", { code: tag.code, from, to, ...(cancelled ? { cancelledRequests: cancelled } : {}) }, tx);
}
