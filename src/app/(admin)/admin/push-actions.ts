"use server";
// Phone notifications (Web Push) — server actions for admin → Settings and the panel's silent re-registration.
// Every action: requireAdmin() → zod → src/server/push.ts. Never returns or logs keys or full endpoints.
import { headers } from "next/headers";
import { z } from "zod";
import type { ActionResult } from "@/components/admin/types";
import { requireAdmin } from "@/lib/auth";
import { adminOrigin } from "@/server/admin-host";
import { audit } from "@/server/audit";
import { isDataError } from "@/server/errors";
import { sendTestNotification } from "@/server/notify";
import { listSubscriptions, removeSubscription, upsertSubscription, type PushDevice, type PushResult } from "@/server/push";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The admin origin this request came from: https (http only for localhost while developing). */
async function requestOrigin(): Promise<string | null> {
  const h = await headers();
  const accept = (raw: string | null | undefined): string | null => {
    if (!raw || raw === "null") return null;
    try {
      const u = new URL(raw);
      if (u.protocol === "https:") return u.origin;
      if (u.protocol === "http:" && process.env.NODE_ENV !== "production" && LOOPBACK.has(u.hostname)) return u.origin;
    } catch {
      /* invalid */
    }
    return null;
  };
  // Server actions always carry Origin (Next.js checks it against Host / X-Forwarded-Host before running the action).
  const fromOrigin = accept(h.get("origin"));
  if (fromOrigin) return fromOrigin;
  if (h.get("origin")) return null;
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  const proto = (h.get("x-forwarded-proto") ?? "http").split(",")[0].trim();
  return host ? accept(`${proto}://${host}`) : null;
}

function insecureOriginMessage(): string {
  const admin = adminOrigin();
  return admin
    ? `Notifications can only be turned on from the secure admin address: ${admin.replace(/^https:\/\//, "")}.`
    : "Notifications need the secure (https) admin address.";
}

function devices(): PushDevice[] {
  return listSubscriptions();
}

const b64url = (bytes: number, message: string) =>
  z
    .string(message)
    .trim()
    .regex(/^[A-Za-z0-9_-]+={0,2}$/, message)
    .transform((s) => s.replace(/=+$/, ""))
    .refine((s) => s.length === Math.ceil((bytes * 4) / 3), message);

const subscriptionSchema = z.object({
  endpoint: z
    .string("This browser sent an invalid subscription.")
    .trim()
    .max(1000, "This browser sent an invalid subscription.")
    .refine((v) => {
      try {
        return new URL(v).protocol === "https:";
      } catch {
        return false;
      }
    }, "This browser sent an invalid subscription."),
  keys: z.object({
    p256dh: b64url(65, "This browser sent invalid encryption keys."),
    auth: b64url(16, "This browser sent invalid encryption keys."),
  }),
  label: z.string().trim().max(60).optional(),
});
export type SavePushSubscriptionInput = z.input<typeof subscriptionSchema>;

/** Register (or refresh) this browser's push subscription. */
export async function savePushSubscriptionAction(
  input: SavePushSubscriptionInput,
): Promise<ActionResult<{ device: PushDevice; devices: PushDevice[] }>> {
  await requireAdmin();
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid subscription." };
  const origin = await requestOrigin();
  if (!origin) return { ok: false, error: insecureOriginMessage() };
  const userAgent = (await headers()).get("user-agent");
  try {
    const { device, created } = upsertSubscription({ ...parsed.data, origin, userAgent });
    if (created) audit("push.subscribe", { id: device.id, label: device.label, service: device.host, origin });
    return { ok: true, data: { device, devices: devices() } };
  } catch (e) {
    if (isDataError(e)) {
      const f = e.fields ?? {};
      if (f.endpoint === "too_many") return { ok: false, error: "Too many devices registered — remove old ones below first." };
      if (f.endpoint) return { ok: false, error: "This browser’s push service isn’t supported. Use Safari, Chrome, Firefox or Edge." };
      if (f.keys) return { ok: false, error: "This browser sent invalid encryption keys." };
      return { ok: false, error: insecureOriginMessage() };
    }
    console.error("[admin push] save failed", e);
    return { ok: false, error: "Something went wrong — please try again." };
  }
}

const removeSchema = z.union([
  z.object({ id: z.number().int().positive() }),
  z.object({ endpoint: z.string().trim().min(1).max(1000) }),
]);

/** Stop sending to a device (by id from the list, or this browser's endpoint for “Turn off on this device”). */
export async function removePushSubscriptionAction(input: z.input<typeof removeSchema>): Promise<ActionResult<{ devices: PushDevice[] }>> {
  await requireAdmin();
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid device." };
  try {
    const removed = removeSubscription(parsed.data);
    if (removed) audit("push.remove", { id: removed.id, label: removed.label, service: removed.host });
    return { ok: true, data: { devices: devices() } };
  } catch (e) {
    console.error("[admin push] remove failed", e);
    return { ok: false, error: "Something went wrong — please try again." };
  }
}

/** Send the test notification to one device (id) or to all of them. */
export async function sendTestPushAction(input: { id?: number } = {}): Promise<ActionResult<{ results: PushResult[]; devices: PushDevice[] }>> {
  await requireAdmin();
  const parsed = z.object({ id: z.number().int().positive().optional() }).safeParse(input ?? {});
  if (!parsed.success) return { ok: false, error: "Invalid device." };
  try {
    const results = await sendTestNotification(parsed.data.id);
    const n = (o: PushResult["outcome"]) => results.filter((r) => r.outcome === o).length;
    audit("push.test", { devices: results.length, delivered: n("delivered"), removed: n("removed"), failed: n("failed"), ...(parsed.data.id ? { id: parsed.data.id } : {}) });
    return { ok: true, data: { results, devices: devices() } };
  } catch (e) {
    console.error("[admin push] test failed", e);
    return { ok: false, error: "Something went wrong — please try again." };
  }
}
