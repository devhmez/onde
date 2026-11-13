// Browser-side Web Push helpers for the admin (imported by client components only; every function touches window
// lazily, so importing this module during server rendering is harmless).
// iOS facts this relies on: push only exists in Home Screen web apps (iOS/iPadOS 16.4+); permission must be asked from a
// tap with no await before it; once granted, subscribing needs no tap; WebKit never fires `pushsubscriptionchange`
// (so the panel re-checks the subscription every time the app opens).

export const SW_URL = "/admin-sw.js";
export const SW_SCOPE = "/admin"; // script at the root, narrower scope: valid without Service-Worker-Allowed

type NavigatorExtras = Navigator & {
  standalone?: boolean;
  setAppBadge?: (n?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};
const nav = () => navigator as NavigatorExtras;

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function isIPad(): boolean {
  const ua = navigator.userAgent;
  return /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Running as an installed app (Home Screen on iOS, Dock / installed PWA on desktop). */
export function isStandalone(): boolean {
  try {
    return nav().standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    return false;
  }
}

export type PushSupport =
  | "ok"
  | "ios-install" // iPhone/iPad in a browser tab: push only works from the Home Screen app
  | "ios-update" // Home Screen app on iOS < 16.4
  | "insecure" // plain http (not localhost)
  | "unsupported";

export function pushSupport(): PushSupport {
  const hasPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (isIOS()) {
    if (!isStandalone()) return "ios-install";
    return hasPush ? "ok" : "ios-update";
  }
  if (!window.isSecureContext) return "insecure";
  return hasPush ? "ok" : "unsupported";
}

/** "iPhone", "iPad", "Mac · Safari", "Windows · Chrome", … (shown in the device list). */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (isIPad()) return "iPad";
  if (/iPhone|iPod/.test(ua)) return "iPhone";
  const os = /Android/.test(ua)
    ? "Android"
    : /Windows/.test(ua)
      ? "Windows"
      : /CrOS/.test(ua)
        ? "ChromeOS"
        : /Macintosh|Mac OS X/.test(ua)
          ? "Mac"
          : /Linux/.test(ua)
            ? "Linux"
            : "Computer";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /SamsungBrowser/.test(ua)
          ? "Samsung Internet"
          : /Chrome\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "Browser";
  return `${os} · ${browser}`;
}

export function urlBase64ToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url + "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** true / false when the subscription's server key is known, null when the browser does not expose it. */
export function subscriptionUsesKey(sub: PushSubscription, key: Uint8Array): boolean | null {
  const current = sub.options?.applicationServerKey;
  if (!current) return null;
  const a = new Uint8Array(current);
  if (a.length !== key.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== key[i]) return false;
  return true;
}

/** Register (or re-use) the admin service worker. Never throws; null when unavailable. */
export async function registerAdminSw(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE, updateViaCache: "none" });
  } catch {
    return null;
  }
}

/** The active admin registration (waits for the worker to activate), rejecting after `ms`. */
export async function readyRegistration(ms = 10_000): Promise<ServiceWorkerRegistration> {
  await registerAdminSw();
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("The notification service didn’t start. Reload the page and try again.")), ms)),
  ]);
}

/** Current subscription of the admin registration (null when none / unsupported). Never throws. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  try {
    if (!("serviceWorker" in navigator)) return null;
    const reg = (await navigator.serviceWorker.getRegistration(SW_SCOPE)) ?? null;
    return reg?.pushManager ? await reg.pushManager.getSubscription() : null;
  } catch {
    return null;
  }
}

/**
 * Ask for notification permission. Must be called synchronously inside the tap handler, before any `await`
 * (iOS only shows the prompt within a user gesture). Supports the old callback form too.
 */
export function requestPermission(): Promise<NotificationPermission> {
  return new Promise((resolve) => {
    try {
      const maybe = Notification.requestPermission((p) => resolve(p));
      if (maybe && typeof maybe.then === "function") maybe.then(resolve, () => resolve(Notification.permission));
    } catch {
      resolve(typeof Notification === "undefined" ? "denied" : Notification.permission);
    }
  });
}

export type SubscriptionPayload = { endpoint: string; keys: { p256dh: string; auth: string }; label: string };

export function toPayload(sub: PushSubscription): SubscriptionPayload | null {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth }, label: deviceLabel() };
}

/** sha256(endpoint) prefix — matches PushDevice.fp on the server ("this device" in the list). */
export async function endpointFingerprint(endpoint: string): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
    return Array.from(new Uint8Array(digest).slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/** A browser / network failure in plain words for the owner. */
export function friendlyError(err: unknown): string {
  const name = err && typeof err === "object" && "name" in err ? String((err as { name: unknown }).name) : "";
  const msg = err instanceof Error ? err.message : "";
  if (name === "NotAllowedError") return "Notifications are blocked for this site. Allow them in your device settings, then try again.";
  if (name === "AbortError") return "The push service didn’t answer. Check your connection and try again.";
  if (name === "InvalidStateError") return "Close and reopen the app, then try again.";
  if (name === "TypeError" && /fetch|network|load failed/i.test(msg)) return "No connection to the server. Check your internet and try again.";
  return msg || "Please try again.";
}

/** App icon badge (installed app only; ignored elsewhere). 0 clears it. Never throws. */
export function setBadge(n: number): void {
  try {
    const nv = nav();
    if (n > 0 && typeof nv.setAppBadge === "function") void nv.setAppBadge(n).catch(() => {});
    else if (n <= 0 && typeof nv.clearAppBadge === "function") void nv.clearAppBadge().catch(() => {});
  } catch {
    /* unsupported */
  }
}

// "Seen" bookkeeping: re-save an existing subscription at most once a day (keeps last_seen fresh, catches a new endpoint).
const SAVED_KEY = "onde-admin-push-saved";
const DAY_MS = 24 * 60 * 60 * 1000;

export function shouldResave(endpoint: string): boolean {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return true;
    const v = JSON.parse(raw) as { endpoint?: string; at?: number };
    return v.endpoint !== endpoint || typeof v.at !== "number" || Date.now() - v.at > DAY_MS || v.at > Date.now();
  } catch {
    return true;
  }
}

export function markSaved(endpoint: string | null): void {
  try {
    if (endpoint) localStorage.setItem(SAVED_KEY, JSON.stringify({ endpoint, at: Date.now() }));
    else localStorage.removeItem(SAVED_KEY);
  } catch {
    /* storage blocked */
  }
}

// "Turn off on this device" must stick: permission stays granted, so without this flag the panel would silently
// subscribe again on the next app open. "Enable" clears it.
const OFF_KEY = "onde-admin-push-off";

export function isOptedOut(): boolean {
  try {
    return localStorage.getItem(OFF_KEY) === "1";
  } catch {
    return false;
  }
}

export function setOptedOut(off: boolean): void {
  try {
    if (off) localStorage.setItem(OFF_KEY, "1");
    else localStorage.removeItem(OFF_KEY);
  } catch {
    /* storage blocked */
  }
}
