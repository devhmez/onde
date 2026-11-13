"use client";
// Scroll-triggered reveals. Text: GSAP SplitText line / word / char reveals behind masks (auto re-split on resize).
// Blocks: fade-up, fade, scale, or staggered children. Content is server-rendered and readable without JS;
// while JS boots it is held hidden (html.js [data-reveal]) with a CSS failsafe. Reduced motion → no motion.
import { useRef, type CSSProperties, type ReactNode } from "react";
import clsx from "clsx";
import {
  gsap,
  SplitText,
  useGSAP,
  registerGsap,
  prefersReducedMotion,
  whenIntroRevealed,
} from "@/lib/motion";

export type RevealType = "lines" | "words" | "chars" | "up" | "fade" | "scale" | "stagger";

type RevealProps = {
  as?: "div" | "p" | "span" | "h1" | "h2" | "h3" | "h4" | "li" | "ul" | "ol" | "blockquote" | "figure" | "section";
  type?: RevealType;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  id?: string;
  delay?: number;
  duration?: number;
  stagger?: number;
  /** distance for "up" / "stagger" (px) */
  y?: number;
  /** ScrollTrigger start (default "top 86%") */
  start?: string;
  /** Play on mount (after the intro) instead of on scroll. */
  immediate?: boolean;
};

export default function Reveal({
  as = "div",
  type = "up",
  children,
  className,
  style,
  id,
  delay = 0,
  duration,
  stagger,
  y = 42,
  start = "top 86%",
  immediate = false,
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const Tag = as as "div";

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      registerGsap();
      const ready = () => el.setAttribute("data-reveal-ready", "");
      if (prefersReducedMotion()) {
        ready();
        return;
      }

      const scrollTrigger = immediate ? undefined : { trigger: el, start, once: true };
      const holdForIntro = (anim: gsap.core.Animation) => {
        if (!immediate) return anim;
        anim.pause();
        whenIntroRevealed().then(() => anim.play());
        return anim;
      };

      if (type === "lines" || type === "words" || type === "chars") {
        const split = SplitText.create(el, {
          type: type === "lines" ? "lines" : type === "words" ? "words,lines" : "chars,words,lines",
          mask: type === "words" ? "words" : "lines",
          autoSplit: true,
          linesClass: "reveal-line",
          onSplit(self: SplitText) {
            const targets = type === "lines" ? self.lines : type === "words" ? self.words : self.chars;
            return holdForIntro(
              gsap.from(targets, {
                yPercent: type === "chars" ? 115 : 108,
                rotate: type === "chars" ? 8 : type === "words" ? 4 : 2.5,
                transformOrigin: "0% 100%",
                duration: duration ?? (type === "chars" ? 1.1 : 1.25),
                stagger: stagger ?? (type === "chars" ? 0.022 : type === "words" ? 0.045 : 0.09),
                delay,
                ease: "onde.expo",
                scrollTrigger,
              }),
            );
          },
        });
        ready();
        return () => split.revert();
      }

      // Block reveals: lift the CSS pre-state (html.js [data-reveal] → opacity 0) BEFORE creating the tween.
      // gsap.from() records the element's current computed values as the end state, so creating it while the CSS
      // still hides the element would tween opacity 0 → 0 and leave the block invisible. from-tweens render their
      // start state synchronously, so there is no visible flash between ready() and the tween.
      ready();

      if (type === "stagger") {
        const items = el.querySelectorAll<HTMLElement>("[data-reveal-item]");
        const targets = items.length ? Array.from(items) : Array.from(el.children);
        holdForIntro(
          gsap.from(targets, {
            y,
            opacity: 0,
            duration: duration ?? 1.1,
            stagger: stagger ?? 0.09,
            delay,
            ease: "onde.expo",
            scrollTrigger,
          }),
        );
        return;
      }

      const from: gsap.TweenVars =
        type === "fade"
          ? { opacity: 0 }
          : type === "scale"
            ? { opacity: 0, scale: 0.92, y: y * 0.5 }
            : { opacity: 0, y };
      holdForIntro(
        gsap.from(el, { ...from, duration: duration ?? 1.2, delay, ease: "onde.expo", scrollTrigger }),
      );
    },
    { scope: ref },
  );

  return (
    <Tag ref={ref} id={id} data-reveal={type} className={clsx(className)} style={style}>
      {children}
    </Tag>
  );
}
