"use client";
// Order success hero: ✓ drawn on inside a glowing ring, NFC ripples, brand-colour confetti (once per order per session),
// and the order number with a copy button.
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon } from "./Icons";

type Props = { number: string; labels: { number: string; copy: string; copied: string } };

const COLORS = ["#461CF7", "#7B5CFF", "#8C7BFF", "#ECEBF2", "#F5A524"];

export default function OrderCelebration({ number, labels }: Props) {
  const reduce = useReducedMotion();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (reduce) return;
    const key = `onde-celebrated-${number}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {
      /* storage unavailable: celebrate anyway */
    }
    let cancelled = false;
    const timers: number[] = [];
    import("canvas-confetti")
      .then(({ default: confetti }) => {
        if (cancelled) return;
        const base = { colors: COLORS, disableForReducedMotion: true, zIndex: 80, ticks: 280 };
        timers.push(
          window.setTimeout(() => {
            try {
              sessionStorage.setItem(key, "1");
            } catch {
              /* ignore */
            }
            confetti({ ...base, particleCount: 110, spread: 80, startVelocity: 46, origin: { x: 0.5, y: 0.32 } });
            confetti({ ...base, particleCount: 55, angle: 60, spread: 62, startVelocity: 55, origin: { x: 0, y: 0.75 } });
            confetti({ ...base, particleCount: 55, angle: 120, spread: 62, startVelocity: 55, origin: { x: 1, y: 0.75 } });
          }, 700),
          window.setTimeout(() => {
            confetti({ ...base, particleCount: 36, spread: 110, startVelocity: 28, shapes: ["star"], scalar: 1.25, origin: { x: 0.5, y: 0.28 } });
          }, 1150),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [number, reduce]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(number);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative grid size-40 place-items-center sm:size-48">
        {!reduce &&
          [0, 1, 2].map((i) => (
            <motion.span
              key={i}
              aria-hidden="true"
              className="absolute inset-0 rounded-full border border-violet-2/50"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: [0.7, 1.9], opacity: [0.7, 0] }}
              transition={{ duration: 2.8, repeat: Infinity, delay: 0.9 + i * 0.9, ease: "easeOut" }}
            />
          ))}
        <motion.div
          aria-hidden="true"
          className="absolute inset-4 rounded-full bg-violet/40 blur-2xl"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        />
        <svg viewBox="0 0 120 120" className="relative size-full" aria-hidden="true">
          <defs>
            <linearGradient id="onde-check-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#8C7BFF" />
              <stop offset="100%" stopColor="#461CF7" />
            </linearGradient>
          </defs>
          <motion.circle
            cx="60"
            cy="60"
            r="50"
            fill="rgba(70,28,247,0.16)"
            stroke="url(#onde-check-ring)"
            strokeWidth="4"
            strokeLinecap="round"
            transform="rotate(-90 60 60)"
            initial={{ pathLength: reduce ? 1 : 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.9, ease: [0.65, 0, 0.35, 1] }}
          />
          <motion.path
            d="M38 62 L54 77 L83 46"
            fill="none"
            stroke="#ECEBF2"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: reduce ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.55, delay: reduce ? 0 : 0.75, ease: [0.16, 1, 0.3, 1] }}
          />
        </svg>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="mt-8 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pl-5 pr-1.5 backdrop-blur"
      >
        <span className="text-xs uppercase tracking-[0.24em] text-muted">{labels.number}</span>
        <span className="font-mono text-lg font-semibold tracking-wider text-text">{number}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? labels.copied : labels.copy}
          className="grid size-9 place-items-center rounded-full bg-white/[0.06] text-muted transition-colors hover:bg-white/[0.12] hover:text-text focus-visible:outline-2 focus-visible:outline-violet-2"
        >
          {copied ? <CheckIcon size={16} className="text-ok" /> : <CopyIcon size={16} />}
        </button>
        <span className="sr-only" aria-live="polite">
          {copied ? labels.copied : ""}
        </span>
      </motion.div>
    </div>
  );
}
