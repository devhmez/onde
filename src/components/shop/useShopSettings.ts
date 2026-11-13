"use client";
// Client access to public shop settings (delivery fee, free-delivery threshold, discount %, WhatsApp number).
// Pages that already loaded settings on the server pass them as `initial` (no request); components mounted globally
// (cart drawer, cart button) fetch /api/settings/public once per page load and fall back to DEFAULT_RULES.
import { useEffect, useState } from "react";
import { DEFAULT_SHOP_SETTINGS, normalizeShopSettings, type ShopSettings } from "./rules";

let cached: ShopSettings | null = null;
let inflight: Promise<ShopSettings> | null = null;
const subscribers = new Set<(s: ShopSettings) => void>();

function publish(s: ShopSettings) {
  cached = s;
  subscribers.forEach((fn) => fn(s));
}

function load(): Promise<ShopSettings> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetch("/api/settings/public", { cache: "no-store", headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json: unknown) => {
        const s = normalizeShopSettings(json);
        publish(s);
        return s;
      })
      .catch(() => {
        inflight = null; // allow a retry on the next mount
        return DEFAULT_SHOP_SETTINGS;
      });
  }
  return inflight;
}

export function useShopSettings(initial?: ShopSettings | null): ShopSettings {
  const [settings, setSettings] = useState<ShopSettings>(initial ?? DEFAULT_SHOP_SETTINGS);

  useEffect(() => {
    if (initial) {
      publish(initial);
      return;
    }
    let alive = true;
    const onChange = (s: ShopSettings) => alive && setSettings(s);
    subscribers.add(onChange);
    load().then(onChange);
    return () => {
      alive = false;
      subscribers.delete(onChange);
    };
  }, [initial]);

  return initial ?? settings;
}
