"use client";
// Cinematic heading: each word rises out of a mask with a slight tilt and blur, staggered (on mount or in view).
import { motion, useReducedMotion, type Variants } from "motion/react";
import { Fragment } from "react";
import clsx from "clsx";

type Line = { text: string; className?: string; /** applied to each word (e.g. gradient text) */ wordClassName?: string };
type Props = {
  lines: Line[];
  as?: "h1" | "h2" | "h3";
  className?: string;
  delay?: number;
  /** Animate when scrolled into view instead of on mount. */
  inView?: boolean;
  id?: string;
  /** Small label rendered inside the heading, above the lines (e.g. what the page sells). Not animated. */
  kicker?: string;
  kickerClassName?: string;
};

const container: Variants = {
  hidden: {},
  show: (delay: number) => ({ transition: { staggerChildren: 0.07, delayChildren: delay } }),
};
const word: Variants = {
  hidden: { y: "112%", rotate: 5, opacity: 0, filter: "blur(8px)" },
  show: {
    y: "0%",
    rotate: 0,
    opacity: 1,
    filter: "blur(0px)",
    transition: { duration: 0.95, ease: [0.16, 1, 0.3, 1] },
  },
};
const wordReduced: Variants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.4 } } };

export default function SplitHeading({ lines, as = "h2", className, delay = 0, inView, id, kicker, kickerClassName }: Props) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  const trigger = inView
    ? { initial: "hidden", whileInView: "show", viewport: { once: true, margin: "0px 0px -12% 0px" } }
    : { initial: "hidden", animate: "show" };
  return (
    <Tag id={id} className={className} variants={container} custom={delay} {...trigger}>
      {kicker ? (
        <span className={clsx("flex", kickerClassName)}>
          {kicker}
          <span className="sr-only"> — </span>
        </span>
      ) : null}
      {lines.map((line, li) => (
        <span key={li} className={clsx("block", line.className)}>
          {line.text.split(/\s+/).filter(Boolean).map((w, wi, arr) => (
            <Fragment key={wi}>
              <span className="inline-block overflow-hidden pb-[0.12em] -mb-[0.12em] align-top">
                <motion.span
                  className={clsx("inline-block origin-bottom-left will-change-transform", line.wordClassName)}
                  variants={reduce ? wordReduced : word}
                >
                  {w}
                </motion.span>
              </span>
              {wi < arr.length - 1 ? " " : null}
            </Fragment>
          ))}
        </span>
      ))}
    </Tag>
  );
}
