"use client";
// Giant outlined "onde" wordmark: strokes draw on as the footer scrolls in, then a violet light sweeps across.
import { useRef } from "react";
import { gsap, useGSAP, registerGsap, prefersReducedMotion } from "@/lib/motion";
import Logo from "./Logo";

export default function FooterWordmark() {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || prefersReducedMotion()) return;
      registerGsap();
      const paths = el.querySelectorAll<SVGPathElement>(".wm-path");
      const tl = gsap.timeline({
        scrollTrigger: { trigger: el, start: "top 92%", end: "bottom 85%", scrub: 1.2 },
      });
      tl.fromTo(paths, { drawSVG: "0%" }, { drawSVG: "100%", stagger: 0.08, ease: "none", duration: 1 });
      tl.fromTo(
        el.querySelector(".wm-sweep"),
        { xPercent: -120 },
        { xPercent: 120, ease: "none", duration: 0.8 },
        0.35,
      );
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className="relative overflow-hidden" aria-hidden="true">
      <Logo
        variant="outline"
        strokeWidth={1.25}
        pathClassName="wm-path"
        className="h-auto w-full text-text/35"
      />
      <div
        className="wm-sweep pointer-events-none absolute inset-y-0 left-0 w-1/2 mix-blend-screen"
        style={{ background: "linear-gradient(90deg, transparent, rgb(123 92 255 / 0.22), transparent)" }}
      />
    </div>
  );
}
