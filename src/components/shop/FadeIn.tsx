"use client";
// Small reveal wrapper for server-rendered shop content (fade + rise + de-blur), on mount or when scrolled into view.
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  inView?: boolean;
  as?: "div" | "section" | "li" | "p" | "header";
};

export default function FadeIn({ children, className, delay = 0, y = 28, inView, as = "div" }: Props) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  const hidden = reduce ? { opacity: 0 } : { opacity: 0, y, filter: "blur(6px)" };
  const shown = { opacity: 1, y: 0, filter: "blur(0px)" };
  const transition = { duration: reduce ? 0.3 : 0.9, delay, ease: [0.16, 1, 0.3, 1] as const };
  return inView ? (
    <Tag
      className={className}
      initial={hidden}
      whileInView={shown}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={transition}
    >
      {children}
    </Tag>
  ) : (
    <Tag className={className} initial={hidden} animate={shown} transition={transition}>
      {children}
    </Tag>
  );
}
