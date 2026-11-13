"use client";
// Lenis smooth scrolling, driven by gsap.ticker and synced with ScrollTrigger.
// Disabled for prefers-reduced-motion (native scroll). Also:
//  - locks scrolling while the cart drawer is open (cart store) or when another module asks (onde:scroll-lock)
//  - refreshes ScrollTrigger when the document height changes (lazy 3D sections, images, fonts)
//  - scrolls to top on forward navigations, leaves back/forward restoration to the browser
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";
import { useCart } from "@/lib/cart";
import {
  gsap,
  ScrollTrigger,
  registerGsap,
  prefersReducedMotion,
  setLenis,
  getLenis,
  lockScroll,
  unlockScroll,
  scheduleRefresh,
} from "@/lib/motion";

type LockDetail = { key?: string; locked?: boolean } | boolean;

export default function SmoothScroll() {
  const pathname = usePathname();
  const { open: cartOpen } = useCart();
  const popRef = useRef(false);
  const firstPath = useRef(true);

  // Lenis + ticker
  useEffect(() => {
    registerGsap();
    if (prefersReducedMotion()) return;

    const lenis = new Lenis({
      lerp: 0.095,
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.4,
      allowNestedScroll: true,
      anchors: { offset: -88 },
      autoRaf: false,
    });
    setLenis(lenis);
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      setLenis(null);
    };
  }, []);

  // Height changes → refresh triggers (debounced)
  useEffect(() => {
    let last = document.documentElement.scrollHeight;
    const ro = new ResizeObserver(() => {
      const h = document.documentElement.scrollHeight;
      if (Math.abs(h - last) < 2) return;
      last = h;
      getLenis()?.resize();
      scheduleRefresh(180);
    });
    ro.observe(document.body);
    const onLoad = () => scheduleRefresh(60);
    window.addEventListener("load", onLoad);
    document.fonts?.ready.then(() => scheduleRefresh(60)).catch(() => undefined);
    return () => {
      ro.disconnect();
      window.removeEventListener("load", onLoad);
    };
  }, []);

  // Generic lock channel for other modules
  useEffect(() => {
    const onLock = (e: Event) => {
      const d = (e as CustomEvent<LockDetail>).detail;
      const key = typeof d === "object" && d?.key ? `ext:${d.key}` : "ext";
      const locked = typeof d === "boolean" ? d : Boolean(d?.locked ?? true);
      if (locked) lockScroll(key);
      else unlockScroll(key);
    };
    window.addEventListener("onde:scroll-lock", onLock);
    return () => window.removeEventListener("onde:scroll-lock", onLock);
  }, []);

  // Cart drawer open → lock page scroll
  useEffect(() => {
    if (cartOpen) lockScroll("cart");
    else unlockScroll("cart");
    return () => unlockScroll("cart");
  }, [cartOpen]);

  // Navigation: remember back/forward so we don't fight scroll restoration
  useEffect(() => {
    const onPop = () => {
      popRef.current = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    const wasPop = popRef.current;
    popRef.current = false;
    const lenis = getLenis();
    if (!wasPop && !window.location.hash && lenis) lenis.scrollTo(0, { immediate: true, force: true });
    const id = requestAnimationFrame(() => {
      getLenis()?.resize();
      ScrollTrigger.refresh();
    });
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  return null;
}
