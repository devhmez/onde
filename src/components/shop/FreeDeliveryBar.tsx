"use client";
// "Plus que X DT pour la livraison gratuite" → "Livraison gratuite débloquée ✓" with a particle burst on unlock.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import clsx from "clsx";
import { formatDT } from "@/lib/business";
import type { Locale } from "@/i18n/config";
import { fmt, type ShopMessages } from "./messages";
import { TruckIcon } from "./Icons";

type Props = {
  subtotal: number;
  threshold: number;
  locale: Locale;
  t: ShopMessages["freeDelivery"];
  className?: string;
};

const BURST = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2 + (i % 2 ? 0.2 : -0.1);
  const dist = 26 + (i % 3) * 10;
  return {
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
    color: ["#2BD48A", "#8C7BFF", "#F5A524", "#ECEBF2"][i % 4],
    size: i % 3 === 0 ? 6 : 4,
  };
});

export default function FreeDeliveryBar({ subtotal, threshold, locale, t, className }: Props) {
  const reduce = useReducedMotion();
  const free = threshold <= 0 || subtotal >= threshold;
  const progress = threshold > 0 ? Math.min(1, Math.max(0, subtotal / threshold)) : 1;
  const remaining = Math.max(0, threshold - subtotal);
  const text = free ? t.unlocked : fmt(t.remaining, { amount: formatDT(remaining, locale) });

  // Burst only when crossing the threshold after mount (not when the drawer opens already unlocked).
  const [wasFree, setWasFree] = useState(free);
  const [burst, setBurst] = useState(0);
  if (wasFree !== free) {
    setWasFree(free);
    if (free && !reduce) setBurst((n) => n + 1);
  }

  return (
    <div className={clsx("relative", className)}>
      <div className="mb-2 flex items-center gap-2 text-[13px] leading-snug">
        <TruckIcon size={17} className={clsx("shrink-0 transition-colors duration-500", free ? "text-ok" : "text-violet-3")} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={free ? "free" : "remaining"}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className={clsx("font-medium", free ? "text-ok" : "text-text")}
          >
            {text}
          </motion.p>
        </AnimatePresence>
      </div>
      <div
        role="progressbar"
        aria-label={t.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-valuetext={text}
        className="relative h-2 overflow-visible rounded-full bg-white/[0.07]"
      >
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <motion.div
            className={clsx(
              "absolute inset-y-0 left-0 rounded-full",
              free
                ? "bg-gradient-to-r from-ok/80 to-ok"
                : "bg-gradient-to-r from-violet via-violet-2 to-violet-3",
            )}
            initial={false}
            animate={{ width: `${progress * 100}%` }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 140, damping: 22 }}
          />
          {!reduce && !free && progress > 0 && (
            <div
              aria-hidden="true"
              className="absolute inset-y-0 left-0 overflow-hidden rounded-full transition-[width] duration-700 ease-expo"
              style={{ width: `${progress * 100}%` }}
            >
              <motion.div
                className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/35 to-transparent"
                initial={{ x: "-100%" }}
                animate={{ x: "200%" }}
                transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 1.4, ease: "easeInOut" }}
              />
            </div>
          )}
        </div>
        <AnimatePresence>
          {burst > 0 && (
            <motion.span
              key={burst}
              aria-hidden="true"
              className="pointer-events-none absolute right-0 top-1/2"
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.2, delay: 0.75 }}
              onAnimationComplete={() => setBurst(0)}
            >
              <motion.span
                className="absolute -left-5 -top-5 size-10 rounded-full border-2 border-ok"
                initial={{ scale: 0.2, opacity: 0.9 }}
                animate={{ scale: 2.2, opacity: 0 }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              />
              {BURST.map((p, i) => (
                <motion.span
                  key={i}
                  className="absolute rounded-full"
                  style={{ width: p.size, height: p.size, background: p.color, left: -p.size / 2, top: -p.size / 2 }}
                  initial={{ x: 0, y: 0, scale: 1 }}
                  animate={{ x: p.x, y: p.y, scale: 0 }}
                  transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                />
              ))}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
