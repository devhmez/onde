"use client";
// Scroll-out choreography for the hero: copy drifts up and fades, the product sinks and shrinks,
// a dark veil rises — depth parallax on wrappers only (the CSS entrance animations stay untouched).
import { useRef, type ReactNode } from "react";
import { gsap, useGSAP, registerGsap, prefersReducedMotion } from "@/lib/motion";

export default function HeroScrollFx({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || prefersReducedMotion()) return;
      registerGsap();
      const section = el.closest("section") ?? el;
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: { trigger: section, start: "top top", end: "bottom top", scrub: 0.6 },
      });
      tl.to(el.querySelector("[data-hero-copy]"), { yPercent: -18, opacity: 0.15 }, 0)
        .to(el.querySelector("[data-hero-stage]"), { yPercent: 14, scale: 0.88, opacity: 0.4 }, 0)
        .to(el.querySelector("[data-hero-cue]"), { opacity: 0, y: 30 }, 0)
        .fromTo(el.querySelector("[data-hero-veil]"), { opacity: 0 }, { opacity: 0.85 }, 0);
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className="contents">
      {children}
    </div>
  );
}
