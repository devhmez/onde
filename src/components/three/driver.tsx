"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Pacer } from "./hooks";

/**
 * Canvas sizing for every stage (R3F `resize` prop). R3F's default re-measures getBoundingClientRect on every scroll
 * (re-rendering the canvas root ~20×/s while scrolling) and, because that rect includes CSS transforms, it resized —
 * i.e. reallocated — the hero's drawing buffer on every frame of its scroll-out scale. Layout size only, no scroll
 * listener: the canvas is resized only when its box really changes. (No stage uses R3F pointer events.)
 */
export const CANVAS_RESIZE = { scroll: false, offsetSize: true } as const;

/**
 * Drives an on-demand (`frameloop="demand"`) canvas:
 *  - renders nothing while `active` is false (off-screen or hidden tab),
 *  - renders every display frame while the pacer is busy (scroll, drag, transitions),
 *  - otherwise renders at `idleFps` to keep ambient motion alive at a fraction of the cost.
 */
export function RenderDriver({ active, pacer, idleFps = 30 }: { active: boolean; pacer: Pacer; idleFps?: number }) {
  const invalidate = useThree((s) => s.invalidate);
  const last = useRef(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const minGap = idleFps >= 60 ? 0 : 1000 / Math.max(1, idleFps) - 2;
    const tick = (now: number) => {
      if (now < pacer.busyUntil || now - last.current >= minGap) {
        last.current = now;
        invalidate();
      }
      raf = requestAnimationFrame(tick);
    };
    invalidate();
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, pacer, idleFps, invalidate]);
  return null;
}

/**
 * Measures frame pacing while the canvas renders at full rate and calls `onSlow` when frames are consistently
 * slower than ~40 fps (callers step the DPR down, then switch to the cheaper material set).
 *
 * Judged on the median of 90 frames, after a 2.5 s grace period: one-off work around the first frames (chunk
 * evaluation, uploads, another canvas warming up, a long task elsewhere on the page) used to drag the average over
 * the limit and lower the resolution for good — a false positive that also cost a synchronous buffer reallocation.
 */
export function PerfGuard({ pacer, onSlow, always = false }: { pacer: Pacer; onSlow: () => void; always?: boolean }) {
  const acc = useRef({ samples: [] as number[], last: 0, since: 0, cooldown: 0 });
  const cb = useRef(onSlow);
  useEffect(() => {
    cb.current = onSlow;
  }, [onSlow]);
  useFrame(() => {
    const now = performance.now();
    const a = acc.current;
    if (!a.since) a.since = now;
    const busy = always || now < pacer.busyUntil;
    if (busy && a.last && now - a.last < 250 && now - a.since > 2500) a.samples.push(now - a.last);
    a.last = now;
    if (a.samples.length >= 90) {
      a.samples.sort((x, y) => x - y);
      const median = a.samples[a.samples.length >> 1];
      a.samples.length = 0;
      if (median > 25 && now > a.cooldown) {
        a.cooldown = now + 3000;
        cb.current();
      }
    }
  });
  return null;
}
