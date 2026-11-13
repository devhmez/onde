"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { detectDevice, type DeviceProfile } from "./device";

const noopSubscribe = () => () => {};

/**
 * Device tier, computed once per page load on the client (null during SSR / first hydration pass, and while
 * `enabled` is false — the probe creates a throwaway WebGL context, so callers defer it until 3D is actually wanted).
 */
export function useDeviceProfile(enabled = true): DeviceProfile | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => (enabled ? detectDevice() : null),
    () => null,
  );
}

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

function subscribeVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}

export function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState !== "hidden",
    () => true,
  );
}

/**
 * IntersectionObserver visibility of an element (with a margin so canvases wake up just before entering).
 * With `once`, it latches to true after the first intersection.
 */
export function useInView(ref: RefObject<Element | null>, rootMargin = "200px 0px", once = false): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      // Very old browsers: treat as visible (asynchronously, so render stays pure).
      const id = requestAnimationFrame(() => setInView(true));
      return () => cancelAnimationFrame(id);
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting || (once && entry.boundingClientRect.top < 0));
        if (once && entry.isIntersecting) io.disconnect();
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin, once]);
  return inView;
}

/** A shared "something is animating" deadline. Components bump it; the RenderDriver reads it. */
export type Pacer = { busyUntil: number };
export const bump = (pacer: Pacer, ms = 1200) => {
  pacer.busyUntil = Math.max(pacer.busyUntil, performance.now() + ms);
};
/** Keep rendering every frame until `release` (e.g. while a drag is in progress). */
export const hold = (pacer: Pacer) => {
  pacer.busyUntil = Number.POSITIVE_INFINITY;
};
export const release = (pacer: Pacer, ms = 1200) => {
  pacer.busyUntil = performance.now() + ms;
};

/** Normalized pointer position over the whole window (-1..1), written to a ref — no re-renders. */
export function useWindowPointer(onMove?: () => void) {
  const pointer = useRef({ x: 0, y: 0 });
  const cb = useRef(onMove);
  useEffect(() => {
    cb.current = onMove;
  }, [onMove]);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
      cb.current?.();
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, []);
  return pointer;
}
