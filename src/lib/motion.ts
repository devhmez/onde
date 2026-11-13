// ONDE motion system — GSAP registration, shared eases, environment checks, Lenis access and scroll locking.
// Client-side helpers: every function is a no-op (or returns a safe default) during SSR.
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { CustomEase } from "gsap/CustomEase";
import { useGSAP } from "@gsap/react";
import type Lenis from "lenis";

export { gsap, ScrollTrigger, SplitText, DrawSVGPlugin, CustomEase, useGSAP };

/** Named eases — GSAP strings (registered in registerGsap) and the CSS equivalents. */
export const EASE = {
  /** fast-in, slow-settle — the house ease (cubic-bezier(.16,1,.3,1)) */
  expo: "onde.expo",
  expoIn: "expo.in",
  expoInOut: "expo.inOut",
  power4: "power4.out",
  soft: "power2.out",
  inOut: "power3.inOut",
  back: "back.out(1.8)",
  elastic: "elastic.out(1, 0.45)",
  linear: "none",
} as const;

export const CSS_EASE = {
  expo: "cubic-bezier(0.16, 1, 0.3, 1)",
  inOutExpo: "cubic-bezier(0.87, 0, 0.13, 1)",
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
} as const;

export const DURATION = { xs: 0.25, sm: 0.45, md: 0.8, lg: 1.2, xl: 1.6 } as const;

let registered = false;

/** Registers GSAP plugins + custom eases once (browser only). Safe to call many times. */
export function registerGsap(): typeof gsap {
  if (registered || typeof window === "undefined") return gsap;
  gsap.registerPlugin(ScrollTrigger, SplitText, DrawSVGPlugin, CustomEase, useGSAP);
  CustomEase.create("onde.expo", "0.16,1,0.3,1");
  CustomEase.create("onde.inOut", "0.87,0,0.13,1");
  CustomEase.create("onde.spring", "0.34,1.56,0.64,1");
  // Mobile address-bar show/hide must not trigger full refreshes (jank on iOS).
  ScrollTrigger.config({ ignoreMobileResize: true });
  registered = true;
  return gsap;
}

if (typeof window !== "undefined") registerGsap();

// ---------------------------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------------------------

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Desktop-class pointer (mouse / trackpad). */
export function isFinePointer(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

type NavigatorWithHints = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
};

/** True on devices where heavy WebGL / autoplaying video should be avoided. */
export function isLowPowerDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const n = navigator as NavigatorWithHints;
  if (n.connection?.saveData) return true;
  if (n.connection?.effectiveType && /(^|-)2g$/.test(n.connection.effectiveType)) return true;
  const cores = n.hardwareConcurrency ?? 8;
  const mem = n.deviceMemory ?? 8;
  return cores <= 2 || mem <= 2;
}

export function prefersSaveData(): boolean {
  if (typeof navigator === "undefined") return false;
  return Boolean((navigator as NavigatorWithHints).connection?.saveData);
}

/** Clamp devicePixelRatio for canvases (spec: ≤ 1.5 for full-screen shaders, ≤ 1.75 for 3D). */
export function clampDpr(max = 1.5): number {
  if (typeof window === "undefined") return 1;
  return Math.min(window.devicePixelRatio || 1, max);
}

// ---------------------------------------------------------------------------------------------
// Lenis (smooth scroll) access — set by <SmoothScroll/>; null when reduced motion or not mounted.
// ---------------------------------------------------------------------------------------------

let lenisInstance: Lenis | null = null;

export function setLenis(l: Lenis | null) {
  lenisInstance = l;
  if (l && locks.size > 0) l.stop();
}

export function getLenis(): Lenis | null {
  return lenisInstance;
}

/** Current scroll velocity in px/frame-ish units (Lenis when available, else 0). */
export function getScrollVelocity(): number {
  return lenisInstance?.velocity ?? 0;
}

/** Smooth-scroll to a target (selector, element or y). Falls back to native scrolling. */
export function scrollToTarget(
  target: string | HTMLElement | number,
  opts: { offset?: number; immediate?: boolean; duration?: number } = {},
) {
  if (typeof window === "undefined") return;
  const { offset = 0, immediate = false, duration = 1.2 } = opts;
  if (lenisInstance) {
    lenisInstance.scrollTo(target, { offset, immediate, duration, force: true });
    return;
  }
  let y: number | null = null;
  if (typeof target === "number") y = target;
  else {
    const el = typeof target === "string" ? document.querySelector<HTMLElement>(target) : target;
    if (el) y = el.getBoundingClientRect().top + window.scrollY;
  }
  if (y === null) return;
  window.scrollTo({ top: y + offset, behavior: immediate || prefersReducedMotion() ? "auto" : "smooth" });
}

// ---------------------------------------------------------------------------------------------
// Scroll lock (intro, mobile menu, cart drawer…). Keyed so independent owners don't fight.
// Other modules can also lock via:  window.dispatchEvent(new CustomEvent("onde:scroll-lock", { detail: { key, locked } }))
// ---------------------------------------------------------------------------------------------

const locks = new Set<string>();

function applyLock() {
  if (typeof document === "undefined") return;
  const locked = locks.size > 0;
  if (lenisInstance) {
    if (locked) lenisInstance.stop();
    else lenisInstance.start();
  }
  document.documentElement.classList.toggle("scroll-locked", locked);
}

export function lockScroll(key: string) {
  locks.add(key);
  applyLock();
}

export function unlockScroll(key: string) {
  locks.delete(key);
  applyLock();
}

export function isScrollLocked(): boolean {
  return locks.size > 0;
}

// ---------------------------------------------------------------------------------------------
// Intro coordination — <IntroLoader/> flips html[data-intro] to "reveal" then "done".
// ---------------------------------------------------------------------------------------------

export type IntroState = "play" | "reduced" | "reveal" | "done";

export function getIntroState(): IntroState {
  if (typeof document === "undefined") return "done";
  const v = document.documentElement.dataset.intro;
  return v === "play" || v === "reduced" || v === "reveal" ? v : "done";
}

/** Resolves once the intro has revealed the page (immediately when no intro plays). */
export function whenIntroRevealed(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve();
    const s = getIntroState();
    if (s === "reveal" || s === "done") return resolve();
    const onReveal = () => {
      window.removeEventListener("onde:intro-reveal", onReveal);
      resolve();
    };
    window.addEventListener("onde:intro-reveal", onReveal);
  });
}

/** Debounced global ScrollTrigger refresh (used after async content changes height). */
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
export function scheduleRefresh(delay = 150) {
  if (typeof window === "undefined") return;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    ScrollTrigger.refresh();
  }, delay);
}
