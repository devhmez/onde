"use client";
// Self-contained motion primitives for the pages module (About / Contact / Legal / Inactive / 404).
// All of them degrade to static content under prefers-reduced-motion and on coarse pointers where relevant.
import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import clsx from "clsx";

/* ------------------------------------------------------------------ media queries */

export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export const useReducedMotionPref = () => useMediaQuery("(prefers-reduced-motion: reduce)");
export const useFinePointer = () => useMediaQuery("(hover: hover) and (pointer: fine)");

/* ------------------------------------------------------------------ CharRise (CSS-only, for above-the-fold titles) */

/**
 * Letter-by-letter blur→sharp rise driven by CSS (no JS needed). `paint`: "fade" (default) also fades each letter in
 * from opacity 0; "visible" keeps the letters opaque from the first frame (blur + rise only, quicker stagger), so a
 * title that is the page's Largest Contentful Paint counts as painted at first paint instead of letter by letter.
 */
export function CharRise({
  text,
  className,
  delayMs = 0,
  charClassName,
  paint = "fade",
}: {
  text: string;
  className?: string;
  delayMs?: number;
  charClassName?: string;
  paint?: "fade" | "visible";
}) {
  const charClass = paint === "visible" ? "op-char-v" : "op-char";
  let i = 0;
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      {text.split(" ").map((word, wi, arr) => (
        <span key={`${word}-${wi}`} aria-hidden className="inline-block whitespace-nowrap">
          {Array.from(word).map((ch, ci) => (
            <span key={ci} className={clsx(charClass, charClassName)} style={{ "--i": i++, "--d": `${delayMs}ms` } as CSSProperties}>
              {ch}
            </span>
          ))}
          {wi < arr.length - 1 ? <span className="inline-block">&nbsp;</span> : null}
        </span>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ ScrollWords */

type ScrollLine = { text: string; className?: string };

/** Apple-style "words light up as you scroll" paragraph. No pinning (robust to any overflow context). */
export function ScrollWords({ lines, className }: { lines: ScrollLine[]; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const reduce = useReducedMotionPref();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.4"] });
  const total = lines.reduce((n, l) => n + l.text.split(" ").length, 0);
  let k = 0;
  return (
    <p ref={ref} className={className}>
      {lines.map((line, li) => (
        <span key={li} className={clsx("block", line.className)}>
          {line.text.split(" ").map((w, wi) => {
            const idx = k++;
            return (
              <ScrollWord key={`${li}-${wi}`} progress={scrollYProgress} start={idx / total} end={(idx + 1) / total} reduce={reduce}>
                {w}
              </ScrollWord>
            );
          })}
        </span>
      ))}
    </p>
  );
}

function ScrollWord({ children, progress, start, end, reduce }: { children: string; progress: MotionValue<number>; start: number; end: number; reduce: boolean }) {
  const opacity = useTransform(progress, [start, end], [0.14, 1]);
  const y = useTransform(progress, [start, end], [10, 0]);
  return (
    <>
      <motion.span className="inline-block will-change-[opacity]" style={reduce ? undefined : { opacity, y }}>
        {children}
      </motion.span>{" "}
    </>
  );
}

/* ------------------------------------------------------------------ RevealBlock */

type RevealTag = "div" | "li" | "p" | "section" | "article";

/**
 * Fade + rise of a block when it scrolls into view. Server HTML stays fully visible (no-JS, crawlers, failed
 * bundles); only blocks that start below the fold get the pre-state, set after hydration, then animate once with
 * WAAPI (transform/opacity, no lingering transform afterwards). Reduced motion: no animation at all.
 */
export function RevealBlock({ children, className, delay = 0, y = 32, scale = 1, as = "div", id }: { children: ReactNode; className?: string; delay?: number; y?: number; scale?: number; as?: RevealTag; id?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return; // already on screen: leave it be
    const from = { opacity: "0", transform: `translate3d(0, ${y}px, 0) scale(${scale})` };
    el.style.opacity = from.opacity;
    el.style.transform = from.transform;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        el.style.opacity = "";
        el.style.transform = "";
        el.animate([from, { opacity: "1", transform: "none" }], { duration: 1000, delay: delay * 1000, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" });
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      el.style.opacity = "";
      el.style.transform = "";
    };
  }, [delay, y, scale]);
  const Tag = as as "div";
  return (
    <Tag ref={ref} id={id} className={className}>
      {children}
    </Tag>
  );
}

/* ------------------------------------------------------------------ Tilt (3D card + glare) */

/** Perspective tilt toward the cursor with a moving specular glare. Pure CSS vars, no re-renders. */
export function Tilt({ children, className, max = 7, glare = true }: { children: ReactNode; className?: string; max?: number; glare?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const fine = useFinePointer();
  const reduce = useReducedMotionPref();
  const active = fine && !reduce;
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || !active) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", `${(0.5 - py) * max * 2}deg`);
    el.style.setProperty("--ry", `${(px - 0.5) * max * 2}deg`);
    el.style.setProperty("--gx", `${px * 100}%`);
    el.style.setProperty("--gy", `${py * 100}%`);
    el.style.setProperty("--go", "1");
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--go", "0");
  };
  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={clsx("group/tilt relative [transform-style:preserve-3d] transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] [transform:perspective(1000px)_rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))]", className)}
    >
      {children}
      {glare && active ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-[var(--go,0)] transition-opacity duration-500 [background:radial-gradient(420px_circle_at_var(--gx,50%)_var(--gy,50%),rgb(255_255_255/.09),transparent_45%)]"
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ InViewPlay */

/** Pauses every CSS animation inside while off-screen (sets data-play="false"). */
export function InViewPlay({ children, className, style, id, ariaHidden }: { children: ReactNode; className?: string; style?: CSSProperties; id?: string; ariaHidden?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => el.setAttribute("data-play", entry.isIntersecting ? "true" : "false"), { rootMargin: "120px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={className} style={style} id={id} data-play="true" aria-hidden={ariaHidden || undefined}>
      {children}
    </div>
  );
}
