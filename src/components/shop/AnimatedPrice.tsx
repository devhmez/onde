"use client";
// A price that rolls to its new value (transform-free text tween on a ref — no React re-render per frame).
import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { formatDT } from "@/lib/business";
import type { Locale } from "@/i18n/config";

type Props = { value: number; locale: Locale; className?: string; duration?: number };

export default function AnimatedPrice({ value, locale, className, duration = 0.7 }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  // React renders the first value only; afterwards this component owns the text node (no flash of the final value).
  const [initialText] = useState(() => formatDT(value, locale));
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = shown.current;
    if (from === value || reduce) {
      shown.current = value;
      el.textContent = formatDT(value, locale);
      return;
    }
    const controls = animate(from, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        shown.current = v;
        // whole dinars while rolling (no flickering decimals), exact value on the last frame
        el.textContent = formatDT(Math.round(v / 1000) * 1000, locale);
      },
      onComplete: () => {
        shown.current = value;
        el.textContent = formatDT(value, locale);
      },
    });
    return () => controls.stop();
  }, [value, locale, reduce, duration]);

  return (
    <span className={className}>
      <span ref={ref} aria-hidden="true" className="tabular-nums">
        {initialText}
      </span>
      <span className="sr-only">{formatDT(value, locale)}</span>
    </span>
  );
}
