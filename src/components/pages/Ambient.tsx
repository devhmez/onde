// Cheap, GPU-friendly atmosphere layers (CSS only, paused off-screen, static under reduced motion):
// NFC ripple rings like the film's opening, warm bokeh like the stats shots, and a violet light pool.
import type { CSSProperties } from "react";
import clsx from "clsx";
import { InViewPlay } from "./motion";

/** Concentric NFC rings emanating from the center of the parent. */
export function Ripples({ count = 4, duration = 7, size = "min(120vmin, 1100px)", className, strong = false, rgb, clip = true }: { count?: number; duration?: number; size?: string; className?: string; strong?: boolean; /** ring color as "r g b" */ rgb?: string; clip?: boolean }) {
  return (
    <InViewPlay className={clsx("pointer-events-none absolute inset-0", clip && "overflow-hidden", className)} ariaHidden>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="op-ring"
          style={
            {
              "--ring-size": size,
              "--ring-dur": `${duration}s`,
              "--ring-delay": `${(-duration / count) * i}s`,
              "--ring-o": strong ? 0.95 : 0.7,
              "--ring-static": `${0.3 + (0.7 * (i + 1)) / count}`,
              ...(rgb ? { "--ring-rgb": rgb } : {}),
            } as CSSProperties
          }
        />
      ))}
    </InViewPlay>
  );
}

const BOKEH: { l: number; t: number; s: number; b: number; o: number; d: number; dl: number; dx: number; dy: number }[] = [
  { l: 6, t: 12, s: 120, b: 2, o: 0.32, d: 19, dl: -2, dx: 22, dy: -30 },
  { l: 18, t: 64, s: 70, b: 1, o: 0.28, d: 15, dl: -7, dx: -18, dy: -22 },
  { l: 30, t: 30, s: 180, b: 6, o: 0.18, d: 24, dl: -11, dx: 30, dy: 18 },
  { l: 44, t: 78, s: 96, b: 3, o: 0.24, d: 21, dl: -4, dx: -26, dy: -16 },
  { l: 55, t: 8, s: 64, b: 1, o: 0.3, d: 17, dl: -9, dx: 16, dy: 24 },
  { l: 63, t: 46, s: 150, b: 5, o: 0.2, d: 26, dl: -13, dx: -30, dy: -26 },
  { l: 74, t: 18, s: 110, b: 2, o: 0.3, d: 20, dl: -6, dx: 24, dy: 20 },
  { l: 82, t: 70, s: 200, b: 8, o: 0.16, d: 28, dl: -15, dx: -20, dy: -34 },
  { l: 90, t: 36, s: 80, b: 1, o: 0.3, d: 16, dl: -3, dx: -14, dy: 26 },
  { l: 38, t: 55, s: 54, b: 1, o: 0.26, d: 14, dl: -8, dx: 18, dy: -18 },
  { l: 12, t: 88, s: 140, b: 5, o: 0.18, d: 23, dl: -12, dx: 28, dy: -12 },
  { l: 96, t: 90, s: 90, b: 2, o: 0.24, d: 18, dl: -5, dx: -24, dy: -20 },
];

/** Warm out-of-focus lights drifting slowly (the film's stats look). */
export function Bokeh({ className, density = 1 }: { className?: string; density?: 0.5 | 1 }) {
  const dots = density === 1 ? BOKEH : BOKEH.filter((_, i) => i % 2 === 0);
  return (
    <InViewPlay className={clsx("pointer-events-none absolute inset-0 overflow-hidden", className)} ariaHidden>
      {dots.map((b, i) => (
        <span
          key={i}
          className="op-bokeh"
          style={
            {
              left: `${b.l}%`,
              top: `${b.t}%`,
              width: `${b.s}px`,
              height: `${b.s}px`,
              marginLeft: `${-b.s / 2}px`,
              marginTop: `${-b.s / 2}px`,
              "--blur": `${b.b}px`,
              "--o": b.o,
              "--dur": `${b.d}s`,
              "--delay": `${b.dl}s`,
              "--dx": `${b.dx}px`,
              "--dy": `${b.dy}px`,
            } as CSSProperties
          }
        />
      ))}
    </InViewPlay>
  );
}

/** Soft violet pool of light (static). */
export function LightPool({ className, color = "70 28 247", opacity = 0.35 }: { className?: string; color?: string; opacity?: number }) {
  return (
    <div
      aria-hidden
      className={clsx("pointer-events-none absolute", className)}
      style={{ background: `radial-gradient(closest-side, rgb(${color} / ${opacity}), rgb(${color} / ${opacity * 0.35}) 45%, transparent 75%)` }}
    />
  );
}
