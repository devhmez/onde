"use client";
// Horizontal product gallery: native scroll on every device, arrow buttons, scroll progress bar, cards fly in on
// first view. Touch screens use native CSS snap; mouse/trackpad scroll freely and then settle on the nearest card
// (CSS mandatory snap fights trackpad momentum on desktop browsers). Mouse drag with momentum; clicks are
// suppressed after a drag.
//
// Wheel / trackpad — every gesture is locked to ONE axis after a few pixels of travel:
//  · vertical   → belongs to the PAGE (Lenis or native). The rail never captures it: it is not vertically
//                 scrollable (overflow-y hidden) and keeps overscroll-behavior-y: auto, so nothing can trap it.
//  · horizontal → belongs to the rail (native scrolling, then a settle onto a card); the page never sees it.
//  · Shift + mouse wheel (Windows/Linux; macOS already reports it as a horizontal delta) → one card per notch.
// No `data-lenis-prevent-*` attribute on purpose: Lenis' stylesheet turns it into `overscroll-behavior: contain`
// on BOTH axes, and with `allowNestedScroll` Lenis then handed vertical wheels to a rail that can neither scroll
// vertically nor chain them to the page — the section used to get "stuck".
import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { gsap, useGSAP, registerGsap, prefersReducedMotion } from "@/lib/motion";

type Props = { children: ReactNode; prevLabel: string; nextLabel: string; dragLabel: string; label: string };

/** A pause longer than this between wheel events ends a gesture (trackpad momentum streams at ~16 ms). */
const GESTURE_GAP_MS = 150;
/** Travel needed before a gesture is locked to an axis (filters the noisy first events of a trackpad swipe). */
const AXIS_LOCK_PX = 8;
const GUTTER = "max(clamp(1rem, 4vw, 3rem), calc((100vw - 90rem) / 2 + clamp(1rem, 4vw, 3rem)))";

/** Scroll positions where a card sits on the start edge (same rule as CSS snap-start + scroll-padding). */
function snapPoints(el: HTMLElement): number[] {
  const cs = getComputedStyle(el);
  const pad = parseFloat(cs.scrollPaddingLeft) || parseFloat(cs.paddingLeft) || 0;
  const max = Math.max(0, el.scrollWidth - el.clientWidth);
  const points = Array.from(el.children, (c) => Math.min(max, Math.max(0, (c as HTMLElement).offsetLeft - pad)));
  points.push(max);
  return [...new Set(points.map(Math.round))].sort((a, b) => a - b);
}

function nearestIndex(points: number[], x: number): number {
  let best = 0;
  for (let i = 1; i < points.length; i++) if (Math.abs(points[i] - x) < Math.abs(points[best] - x)) best = i;
  return best;
}

const smooth = (): ScrollBehavior => (prefersReducedMotion() ? "auto" : "smooth");

export default function ProductRail({ children, prevLabel, nextLabel, dragLabel, label }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLUListElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  /** Last programmatic target, so quick repeated steps (arrows, Shift+wheel) chain instead of re-aiming. */
  const pending = useRef<{ left: number; at: number } | null>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const [dragging, setDragging] = useState(false);

  /** One card left/right, from the card we are on (or heading to). */
  const step = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const points = snapPoints(el);
    const p = pending.current;
    const from = p && performance.now() - p.at < 450 ? p.left : el.scrollLeft;
    const i = nearestIndex(points, from);
    const left = points[Math.min(points.length - 1, Math.max(0, i + dir))];
    pending.current = { left, at: performance.now() };
    el.scrollTo({ left, behavior: smooth() });
  };

  /** Glide onto the nearest card (desktop: after a trackpad swipe). No-op when already there. */
  const settle = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const points = snapPoints(el);
    const left = points[nearestIndex(points, el.scrollLeft)];
    if (Math.abs(left - el.scrollLeft) > 1) el.scrollTo({ left, behavior: smooth() });
  };
  const stepRef = useRef(step);
  const settleRef = useRef(settle);
  useEffect(() => {
    stepRef.current = step;
    settleRef.current = settle;
  });

  // progress + edge state
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = el.scrollWidth - el.clientWidth;
      const p = max > 0 ? el.scrollLeft / max : 1;
      if (barRef.current) barRef.current.style.transform = `scaleX(${Math.max(0.08, p)})`;
      const start = el.scrollLeft < 4;
      const end = el.scrollLeft > max - 4;
      setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // wheel / trackpad: one axis per gesture (see header)
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let axis: "x" | "y" | null = null;
    let sumX = 0;
    let sumY = 0;
    let last = 0;
    let shiftAcc = 0;
    let lastStep = 0;
    let settleTimer = 0;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return; // pinch-zoom / browser zoom
      const now = performance.now();
      if (now - last > GESTURE_GAP_MS) {
        axis = null;
        sumX = sumY = 0;
        shiftAcc = 0;
      }
      last = now;
      const ax = Math.abs(e.deltaX);
      const ay = Math.abs(e.deltaY);

      // Shift + vertical mouse wheel → step through the cards.
      if (e.shiftKey && ay > ax) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        shiftAcc += e.deltaY;
        if (Math.abs(shiftAcc) >= 40 && now - lastStep > 160) {
          stepRef.current(shiftAcc > 0 ? 1 : -1);
          shiftAcc = 0;
          lastStep = now;
        }
        return;
      }

      sumX += ax;
      sumY += ay;
      if (!axis) {
        // Lock as soon as one axis clearly dominates; a near-diagonal start waits for more travel.
        const travel = sumX + sumY;
        if (travel >= AXIS_LOCK_PX && sumX > sumY * 1.5) axis = "x";
        else if (travel >= AXIS_LOCK_PX && sumY >= sumX) axis = "y";
        else if (travel >= AXIS_LOCK_PX * 5) axis = sumX > sumY ? "x" : "y";
        if (axis) sumX = sumY = 0;
      } else if (axis === "x" && sumY > 60 && sumY > sumX * 2) {
        axis = "y"; // clearly a vertical gesture after all: hand it back to the page, never trap it
      }

      if (axis === "x") {
        // The rail's gesture: native horizontal scrolling, kept away from the page scroller.
        e.stopPropagation();
        pending.current = null;
      } else if (axis === "y" && ax >= ay && e.cancelable) {
        // A vertical gesture belongs to the page: sideways noise must not nudge the rail.
        e.preventDefault();
      }
      // Vertical (or still undecided) events bubble on to Lenis / native scrolling → the page moves.

      // Once the gesture (momentum included) is over, glide onto the nearest card — a no-op when already aligned.
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => settleRef.current(), GESTURE_GAP_MS);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      window.clearTimeout(settleTimer);
    };
  }, []);

  // mouse drag with momentum — lands on a card
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let down = false;
    let moved = false;
    let startX = 0;
    let startLeft = 0;
    let lastX = 0;
    let lastT = 0;
    let vel = 0;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      down = true;
      moved = false;
      startX = lastX = e.clientX;
      startLeft = el.scrollLeft;
      lastT = performance.now();
      vel = 0;
      gsap.killTweensOf(el);
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > 6) {
        moved = true;
        setDragging(true);
        el.setPointerCapture(e.pointerId);
      }
      if (!moved) return;
      e.preventDefault();
      el.scrollLeft = startLeft - dx;
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      vel = 0.8 * ((e.clientX - lastX) / dt) + 0.2 * vel;
      lastX = e.clientX;
      lastT = now;
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      down = false;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      if (!moved) return;
      if (performance.now() - lastT > 90) vel = 0; // paused before releasing → no fling
      const points = snapPoints(el);
      const target = points[nearestIndex(points, el.scrollLeft - vel * 380)];
      pending.current = null;
      gsap.to(el, {
        scrollLeft: target,
        duration: prefersReducedMotion() ? 0 : 0.9,
        ease: "power3.out",
        overwrite: true,
        onComplete: () => setDragging(false),
      });
    };
    const onClick = (e: MouseEvent) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    };
    const onDragStart = (e: DragEvent) => e.preventDefault();

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    el.addEventListener("click", onClick, true);
    el.addEventListener("dragstart", onDragStart);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      el.removeEventListener("click", onClick, true);
      el.removeEventListener("dragstart", onDragStart);
      gsap.killTweensOf(el);
    };
  }, []);

  // entrance
  useGSAP(
    () => {
      const el = scrollerRef.current;
      if (!el || prefersReducedMotion()) return;
      registerGsap();
      gsap.from(el.children, {
        x: 140,
        opacity: 0,
        rotateY: -10,
        duration: 1.3,
        stagger: 0.08,
        ease: "onde.expo",
        clearProps: "transform", // no lingering 3D layers once the cards have landed
        scrollTrigger: { trigger: el, start: "top 85%", once: true },
      });
    },
    { scope: rootRef },
  );

  const arrow = (dir: 1 | -1, disabled: boolean, text: string) => (
    <button
      type="button"
      onClick={() => step(dir)}
      disabled={disabled}
      aria-label={text}
      className="grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-text transition-all duration-300 hover:border-violet-2 hover:bg-violet/25 disabled:opacity-30 disabled:hover:border-white/10 disabled:hover:bg-transparent"
    >
      <svg viewBox="0 0 16 16" className={clsx("h-4 w-4", dir === -1 && "rotate-180")} aria-hidden="true">
        <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );

  return (
    <div ref={rootRef} className="relative">
      <ul
        ref={scrollerRef}
        aria-label={label}
        data-cursor={dragLabel}
        className={clsx(
          // overflow-y hidden + overscroll-y auto: a vertical gesture can never be trapped by the rail;
          // overscroll-x contain: a swipe past the last card never triggers the browser's back/forward gesture.
          "no-scrollbar relative flex gap-4 overflow-x-auto overflow-y-hidden overscroll-x-contain overscroll-y-auto pb-6 pt-2 [perspective:1400px]",
          dragging ? "cursor-grabbing select-none" : "pointer-coarse:snap-x pointer-coarse:snap-mandatory md:cursor-grab",
        )}
        style={{ paddingInline: GUTTER, scrollPaddingInline: GUTTER }}
      >
        {children}
      </ul>
      <div className="container-site mt-6 flex items-center gap-6">
        <div className="relative h-px flex-1 overflow-hidden bg-white/10">
          <span ref={barRef} className="absolute inset-0 origin-left bg-gradient-to-r from-violet to-violet-3" style={{ transform: "scaleX(0.08)" }} />
        </div>
        <div className="flex gap-2">
          {arrow(-1, edges.start, prevLabel)}
          {arrow(1, edges.end, nextLabel)}
        </div>
      </div>
    </div>
  );
}
