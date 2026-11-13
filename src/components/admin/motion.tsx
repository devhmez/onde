"use client";
// Subtle admin motion: card fade-ups (staggered by index) and count-up numbers. Reduced motion → instant.
import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { formatDT } from "@/lib/business";

const EASE = [0.16, 1, 0.3, 1] as const;

export function FadeUp({
  children,
  delay = 0,
  className,
  as = "div",
  style,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "article" | "aside";
  style?: CSSProperties;
}) {
  const Comp = motion[as];
  return (
    <Comp
      className={className}
      style={style}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.65, ease: EASE, delay }}
    >
      {children}
    </Comp>
  );
}

type Fmt = "int" | "money" | "pct";
const intFmt = new Intl.NumberFormat("en-US");
function format(v: number, f: Fmt, digits: number) {
  if (f === "money") return formatDT(Math.round(v), "en");
  if (f === "pct") {
    const s = v.toFixed(digits);
    return `${s.includes(".") ? s.replace(/\.?0+$/, "") : s}%`;
  }
  return intFmt.format(Math.round(v));
}

/** Counts from 0 to `value` once visible. Renders the final value on the server (no layout shift, no-JS safe). */
export function CountUp({ value, format: f = "int", digits = 1, duration = 1.4 }: { value: number; format?: Fmt; digits?: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20px" });
  const reduce = useReducedMotion();
  // While animating, `frame` holds the in-between text; otherwise the exact final value is shown.
  const [frame, setFrame] = useState<string | null>(null);
  const started = useRef(false);
  const last = useRef(value);

  useEffect(() => {
    if (!inView || reduce) return;
    const from = started.current ? last.current : 0;
    started.current = true;
    last.current = value;
    if (from === value) return;
    const controls = animate(from, value, {
      duration: from === 0 ? duration : 0.6,
      ease: EASE,
      onUpdate: (v) => setFrame(format(v, f, digits)),
      onComplete: () => setFrame(null),
    });
    return () => controls.stop();
  }, [inView, reduce, value, f, digits, duration]);
  const display = frame ?? format(value, f, digits);

  return (
    <span ref={ref} style={{ fontVariantNumeric: "tabular-nums" }}>
      {display}
    </span>
  );
}
