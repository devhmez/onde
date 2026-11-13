"use client";
// All 24 governorates as outlined words that light up in a wave when the block scrolls into view
// (replaces the old double marquee). Static and fully readable without JS / with reduced motion.
import { useEffect, useRef } from "react";

export default function GovernorateWave({ names, label }: { names: readonly string[]; label: string }) {
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.dataset.in = "true";
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <ul ref={ref} aria-label={label} className="gov-wave container-site flex flex-wrap items-baseline gap-x-[0.45em] gap-y-1">
      {names.map((g, i) => (
        <li
          key={g}
          className="gov text-display text-[clamp(1.7rem,4.2vw,3.6rem)] leading-[1.08]"
          style={{ "--i": i } as React.CSSProperties}
        >
          {g}
          {i < names.length - 1 ? <span aria-hidden className="gov-sep" /> : null}
        </li>
      ))}
    </ul>
  );
}
