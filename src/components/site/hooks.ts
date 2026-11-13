"use client";
// Hydration-safe environment hooks (useSyncExternalStore: server value first, live value after hydration).
import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => undefined;

export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/** false during SSR + hydration, true afterwards. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/** Live value of <html data-intro> ("play" | "reduced" | "reveal" | "done"); server snapshot = "play". */
export function useIntroAttr(): string {
  return useSyncExternalStore(
    (onChange) => {
      const mo = new MutationObserver(onChange);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-intro"] });
      return () => mo.disconnect();
    },
    () => document.documentElement.dataset.intro ?? "done",
    () => "play",
  );
}
