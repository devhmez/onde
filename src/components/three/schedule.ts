"use client";

import { useEffect, useState, type RefObject } from "react";

// When the heavy 3D should start: once the page has settled (intro finished, load event, the reader not scrolling,
// an idle slot), or as soon as its section comes within a margin of the viewport — whichever happens first.
// Framework-light on purpose (React only): it is imported by components that render long before three.js is loaded.
//
// Why "not scrolling": evaluating three.js and building a canvas are 100–200 ms main-thread tasks on a phone. Right
// after the intro is exactly when the reader starts to scroll, and a long task there is a visible stutter.

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/** How long the page must have been still (no scroll event) before background 3D work may start. */
const STILL_MS = 700;

const introOver = () => {
  const s = document.documentElement.dataset.intro;
  return s !== "play" && s !== "reduced" && s !== "reveal";
};

/**
 * Calls `cb` once the intro is over, the page has loaded (or 4 s after the intro, if a slow asset holds the load
 * event back), the page has been still for STILL_MS (no scrolling — and not in the first STILL_MS after the intro,
 * when the reader typically starts to scroll) and the main thread is idle. Returns a canceller.
 */
export function afterPageSettled(cb: () => void, idleTimeout = 2500): () => void {
  if (typeof window === "undefined") return () => {};
  const w = window as IdleWindow;
  let done = false;
  let idleId: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let introSeenAt = 0;
  let lastScroll = 0;
  const onScroll = () => {
    lastScroll = performance.now();
  };
  // the end of the intro counts as activity: scrolling unlocks right then
  const scrolling = () => performance.now() - Math.max(lastScroll, introSeenAt) < STILL_MS;
  const fire = () => {
    idleId = undefined;
    timer = undefined;
    if (done) return;
    // the reader started scrolling while we waited for an idle slot: wait for the next still moment (the poll)
    if (scrolling()) return;
    done = true;
    stopListening();
    cb();
  };
  const step = () => {
    if (done || idleId !== undefined || timer !== undefined) return;
    if (!introOver()) return;
    introSeenAt ||= performance.now();
    if (document.readyState !== "complete" && performance.now() - introSeenAt < 4000) return;
    if (scrolling()) return; // the 500 ms poll retries
    if (w.requestIdleCallback) idleId = w.requestIdleCallback(fire, { timeout: idleTimeout });
    else timer = setTimeout(fire, 300);
  };
  // the intro can also end through its failsafe (no event), and scrolling stops without an event — a slow poll covers both
  const poll = setInterval(step, 500);
  function stopListening() {
    clearInterval(poll);
    window.removeEventListener("load", step);
    window.removeEventListener("onde:intro-done", step);
    window.removeEventListener("scroll", onScroll);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("load", step);
  window.addEventListener("onde:intro-done", step);
  step();
  return () => {
    done = true;
    stopListening();
    if (idleId !== undefined) w.cancelIdleCallback?.(idleId);
    if (timer !== undefined) clearTimeout(timer);
  };
}

/**
 * Latches to true once the page settled (see afterPageSettled) or when `ref` comes within `margin` of the viewport.
 * Touch devices skip the settled pre-warm — on a phone the build is a scroll stutter wherever it lands, and the
 * section's server-rendered shell already holds the stage — and start when the section is within 200 % instead.
 */
export function useWarmSoon(ref: RefObject<Element | null>, enabled = true, margin = "150% 0px"): boolean {
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (!enabled || go) return;
    const fire = () => setGo(true);
    const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    const cancel = coarse ? () => {} : afterPageSettled(fire);
    let io: IntersectionObserver | undefined;
    const el = ref.current;
    if (el && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && fire(), {
        rootMargin: coarse ? "200% 0px" : margin,
      });
      io.observe(el);
    }
    return () => {
      cancel();
      io?.disconnect();
    };
  }, [ref, enabled, go, margin]);
  return go;
}

/** Latches to true when `ref` comes within `margin` of the viewport (lazy media, off-screen videos). */
export function useNear(ref: RefObject<Element | null>, margin = "100% 0px", enabled = true): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!enabled || near || !el) return;
    if (typeof IntersectionObserver === "undefined") {
      const id = requestAnimationFrame(() => setNear(true));
      return () => cancelAnimationFrame(id);
    }
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), {
      rootMargin: margin,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin, enabled, near]);
  return near;
}
