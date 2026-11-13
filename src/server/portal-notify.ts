import "server-only";
// iPhone push to the owner when a client changes a link from their client page (src/server/portal.ts):
//   direct mode   → "Café Lumière changed A7K92X → Instagram"
//   approval mode → "Café Lumière asks to change A7K92X → Instagram"
// Tapping it opens the customer in admin (#client-page: history with Revert, pending requests with Approve / Reject).
// Fire-and-forget like the new-order alert: a slow or broken push service never delays or fails the client's change.
import { DEST_META } from "../components/admin/meta";
import { newOrderCount } from "./notify";
import { cutText, sendToAll, type PushPayload, type PushResult } from "./push";
import type { DestinationType } from "./types";

export type PortalChangeNotice = {
  customerId: number;
  business: string;
  code: string;
  location: string | null;
  toType: DestinationType;
  toUrl: string;
  kind: "applied" | "pending";
};

const oneLine = (s: string | null | undefined) => String(s ?? "").replace(/\s+/g, " ").trim();
const shortUrl = (url: string) => url.replace(/^https?:\/\//i, "").replace(/\/$/, "");

export function portalChangePayload(n: PortalChangeNotice, badge: number | null): PushPayload {
  const business = cutText(oneLine(n.business) || "A client", 50);
  const label = DEST_META[n.toType]?.label ?? "a new link";
  const where = n.location ? `${cutText(oneLine(n.location), 40)} · ` : "";
  return {
    title: n.kind === "applied" ? `${business} changed ${n.code} → ${label}` : `${business} asks to change ${n.code} → ${label}`,
    body:
      n.kind === "applied"
        ? `${where}${cutText(shortUrl(n.toUrl), 120)}\nLive now. Open to review or undo.`
        : `${where}${cutText(shortUrl(n.toUrl), 120)}\nApprove or reject in the admin.`,
    path: `/admin/customers/${n.customerId}#client-page`,
    badge,
    data: { kind: "client", customerId: n.customerId },
  };
}

/** Never throws, never delays the caller. */
export function notifyPortalChange(n: PortalChangeNotice): void {
  try {
    setImmediate(() => {
      try {
        let badge: number | null = null;
        try {
          badge = newOrderCount(); // keep the app icon badge = new orders
        } catch {
          badge = null;
        }
        void sendToAll(() => portalChangePayload(n, badge)).then((results: PushResult[]) => {
          if (!results.length) return;
          const k = (o: PushResult["outcome"]) => results.filter((r) => r.outcome === o).length;
          console.log(`[onde] push: client ${n.kind === "applied" ? "change" : "request"} ${n.code} → ${k("delivered")} delivered, ${k("removed")} removed, ${k("failed")} failed`);
        });
      } catch (err) {
        console.warn("[onde] client-change notification failed", err instanceof Error ? err.message : err);
      }
    });
  } catch (err) {
    console.warn("[onde] could not schedule the client-change notification", err instanceof Error ? err.message : err);
  }
}
