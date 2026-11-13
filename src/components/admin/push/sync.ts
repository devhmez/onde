// Keeps this browser's push subscription and the server's device list in step. Used by PushBootstrap (every app open)
// and the Settings card; every step runs behind one lock so the two never subscribe / unsubscribe at the same time.
//
// Why "replace", never "re-save": a push service can drop a subscription that the browser still reports (iPhone
// restored from a backup, FCM token rotated…). The server then gets 404/410 and deletes the device. Saving the same
// endpoint again would register a dead device that is deleted again on the next order, forever. So whenever the
// server does not know this browser's subscription (or it was made with another server key), the browser drops it
// and subscribes afresh — no tap needed once notifications are allowed. WebKit never fires `pushsubscriptionchange`,
// so this check on app open is the only repair path.
//
// A save that fails (too many devices, http origin, network) never leaves an orphan: the new subscription is dropped
// again, so "subscribed in the browser" always means "registered on the server".
import { removePushSubscriptionAction, savePushSubscriptionAction } from "@/app/(admin)/admin/push-actions";
import type { PushDevice } from "@/server/push";
import {
  currentSubscription,
  endpointFingerprint,
  friendlyError,
  isOptedOut,
  markSaved,
  pushSupport,
  readyRegistration,
  registerAdminSw,
  setOptedOut,
  shouldResave,
  subscriptionUsesKey,
  toPayload,
  urlBase64ToUint8Array,
} from "./client";

// ─── one step at a time ───
let queue: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

// ─── newest device list this page got from the server (save / remove results) ───
let newest: { devices: PushDevice[]; at: number } | null = null;
const remember = (devices: PushDevice[]) => {
  newest = { devices, at: Date.now() };
};
/** The remembered list when it is at least as recent as `asOf` (ms, client clock), else null. */
const newerThan = (asOf: number) => (newest && newest.at >= asOf ? newest.devices : null);

// A failed automatic registration is not retried on every visibility change / navigation for a minute.
const RETRY_AFTER_MS = 60_000;
let recentFailure: { error: string; at: number } | null = null;

type Saved = { ok: true; endpoint: string; device: PushDevice } | { ok: false; error: string };

async function save(sub: PushSubscription): Promise<Saved> {
  const payload = toPayload(sub);
  if (!payload) return { ok: false, error: "This browser returned an incomplete subscription." };
  const res = await savePushSubscriptionAction(payload);
  if (!res.ok) return { ok: false, error: res.error };
  markSaved(payload.endpoint);
  remember(res.data.devices);
  return { ok: true, endpoint: payload.endpoint, device: res.data.device };
}

/** Drop `old` (in the browser and on the server), subscribe afresh and save. A failed save drops the new one too. */
async function replace(reg: ServiceWorkerRegistration, key: Uint8Array<ArrayBuffer>, old: PushSubscription | null): Promise<Saved> {
  if (old) {
    const endpoint = old.endpoint;
    await old.unsubscribe().catch(() => false);
    markSaved(null);
    const res = await removePushSubscriptionAction({ endpoint }).catch(() => null);
    if (res?.ok) remember(res.data.devices);
  }
  let sub: PushSubscription;
  try {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
  let saved: Saved;
  try {
    saved = await save(sub);
  } catch (err) {
    saved = { ok: false, error: friendlyError(err) };
  }
  if (!saved.ok) {
    await sub.unsubscribe().catch(() => false);
    markSaved(null);
  }
  return saved;
}

export type SyncResult =
  /** Push unsupported, permission not granted, or turned off on this device: nothing done. */
  | { state: "idle" }
  /** The server has this browser's subscription. `devices`: a device list newer than `asOf`, if there is one. */
  | { state: "ok"; devices: PushDevice[] | null }
  /** This browser could not be registered (it is left unsubscribed). */
  | { state: "error"; error: string; devices: PushDevice[] | null };

/**
 * Background check, no tap involved (app open, Settings card, coming back to the app). `serverFps`: fingerprints of
 * the devices the server had at `asOf` (ms, client clock; 0 = from the server-rendered page).
 */
export function syncSubscription(vapidPublicKey: string, serverFps: readonly string[], asOf: number): Promise<SyncResult> {
  return locked(async (): Promise<SyncResult> => {
    if (pushSupport() !== "ok" || isOptedOut()) return { state: "idle" };
    const reg = await registerAdminSw();
    if (!reg?.pushManager || Notification.permission !== "granted") return { state: "idle" };
    const key = urlBase64ToUint8Array(vapidPublicKey);
    const sub = await reg.pushManager.getSubscription();

    if (sub && subscriptionUsesKey(sub, key) !== false) {
      const fps = newerThan(asOf)?.map((d) => d.fp) ?? serverFps;
      const fp = await endpointFingerprint(sub.endpoint);
      if (fp === null || fps.includes(fp)) {
        // Registered: re-save at most once a day (keeps "last seen" fresh). A failure here changes nothing.
        if (shouldResave(sub.endpoint)) await save(sub).catch(() => null);
        return { state: "ok", devices: newerThan(asOf) };
      }
    }

    // No subscription, one the server doesn't have (expired, removed) or one made with an old server key → a new one.
    if (recentFailure && Date.now() - recentFailure.at < RETRY_AFTER_MS) {
      return { state: "error", error: recentFailure.error, devices: newerThan(asOf) };
    }
    const saved = await replace(await readyRegistration(), key, sub);
    recentFailure = saved.ok ? null : { error: saved.error, at: Date.now() };
    return saved.ok ? { state: "ok", devices: newerThan(asOf) } : { state: "error", error: saved.error, devices: newerThan(asOf) };
  });
}

export type EnableResult = { ok: true; endpoint: string; fp: string; devices: PushDevice[] } | { ok: false; error: string };

/** "Enable notifications on this device" — after the permission prompt said yes: always a brand-new subscription. */
export function enableSubscription(vapidPublicKey: string): Promise<EnableResult> {
  return locked(async (): Promise<EnableResult> => {
    setOptedOut(false);
    const reg = await readyRegistration();
    const old = await reg.pushManager.getSubscription();
    const saved = await replace(reg, urlBase64ToUint8Array(vapidPublicKey), old);
    recentFailure = saved.ok ? null : { error: saved.error, at: Date.now() };
    if (!saved.ok) return saved;
    return { ok: true, endpoint: saved.endpoint, fp: saved.device.fp, devices: newest?.devices ?? [saved.device] };
  });
}

/** "Turn off on this device": unsubscribe, remember the choice (no silent re-subscribe), remove it on the server. */
export function disableSubscription(knownEndpoint: string | null): Promise<PushDevice[] | null> {
  return locked(async () => {
    setOptedOut(true);
    markSaved(null);
    const sub = await currentSubscription();
    const endpoint = sub?.endpoint ?? knownEndpoint;
    if (sub) await sub.unsubscribe().catch(() => false);
    if (!endpoint) return null;
    const res = await removePushSubscriptionAction({ endpoint });
    if (!res.ok) throw new Error(res.error);
    remember(res.data.devices);
    return res.data.devices;
  });
}
