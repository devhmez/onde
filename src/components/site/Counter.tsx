"use client";
// Number that counts up when scrolled into view. Server-renders the final value (SEO / no-JS / reduced motion).
import { useRef } from "react";
import clsx from "clsx";
import { gsap, useGSAP, registerGsap, prefersReducedMotion } from "@/lib/motion";

type CounterProps = {
  to: number;
  from?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  delay?: number;
  locale?: string;
  className?: string;
  start?: string;
};

function format(n: number, decimals: number, locale?: string) {
  return n.toLocaleString(locale === "fr" ? "fr-FR" : "en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function Counter({
  to,
  from = 0,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 2.2,
  delay = 0,
  locale,
  className,
  start = "top 88%",
}: CounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const finalText = format(to, decimals, locale);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || prefersReducedMotion()) return;
      registerGsap();
      const obj = { v: from };
      el.textContent = format(from, decimals, locale);
      gsap.to(obj, {
        v: to,
        duration,
        delay,
        ease: "expo.out",
        scrollTrigger: { trigger: el, start, once: true },
        onUpdate: () => {
          el.textContent = format(obj.v, decimals, locale);
        },
        onComplete: () => {
          el.textContent = finalText;
        },
      });
    },
    { scope: ref },
  );

  return (
    <span className={clsx("tabular-nums", className)}>
      {prefix}
      <span ref={ref} suppressHydrationWarning>
        {finalText}
      </span>
      {suffix}
    </span>
  );
}
