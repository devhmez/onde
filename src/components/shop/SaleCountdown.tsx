"use client";
// Live countdown for a time-limited sale ("Offre de lancement · fin dans 31 j 04 h 12 min 09 s").
// Renders nothing once the sale is over; the server switches back to the regular price on its own.
import { useEffect, useState } from "react";
import clsx from "clsx";

type Props = { endsAt: number | null | undefined; label: string; locale: string; compact?: boolean; className?: string };

const pad = (n: number) => String(n).padStart(2, "0");

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

export default function SaleCountdown({ endsAt, label, locale, compact = false, className }: Props) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!endsAt) return null;
  const left = now == null ? null : endsAt - now;
  if (left != null && left <= 0) return null;
  const p = left == null ? null : parts(left);
  const fr = locale === "fr";
  const u = fr ? { d: " j", h: " h", m: " min", s: " s" } : { d: "d", h: "h", m: "m", s: "s" };
  const time = p
    ? compact
      ? `${p.d}${u.d} ${pad(p.h)}${u.h}`
      : `${p.d}${u.d} ${pad(p.h)}${u.h} ${pad(p.m)}${u.m} ${pad(p.s)}${u.s}`
    : "—";

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 rounded-full bg-gold/12 px-3 py-1 text-xs font-semibold text-gold ring-1 ring-gold/30",
        className,
      )}
    >
      <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-70" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-gold" />
      </span>
      <span>{label}</span>
      <span className="font-mono tabular-nums" suppressHydrationWarning>
        {time}
      </span>
    </span>
  );
}
