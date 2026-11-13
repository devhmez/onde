"use client";
// − 2 + stepper; the number rolls up/down in the direction of the change.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import clsx from "clsx";
import { MinusIcon, PlusIcon } from "./Icons";

type Props = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "md";
  labels: { decrease: string; increase: string; qty: string };
  className?: string;
  id?: string;
};

export default function QtyStepper({ value, onChange, min = 1, max = 99, size = "md", labels, className, id }: Props) {
  const [prev, setPrev] = useState(value);
  const [dir, setDir] = useState(1);
  if (prev !== value) {
    setDir(value > prev ? 1 : -1);
    setPrev(value);
  }
  const reduce = useReducedMotion();
  const sm = size === "sm";
  const btn = clsx(
    "grid place-items-center rounded-full text-text transition-colors duration-200",
    "hover:bg-white/10 active:bg-white/15 disabled:opacity-35 disabled:hover:bg-transparent",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-2",
    sm ? "size-8" : "size-11",
  );

  return (
    <div
      role="group"
      aria-label={labels.qty}
      id={id}
      className={clsx(
        "inline-flex items-center rounded-full border border-line bg-panel/80 p-1 backdrop-blur",
        className,
      )}
    >
      <motion.button
        type="button"
        className={btn}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={labels.decrease}
        whileTap={reduce ? undefined : { scale: 0.86 }}
      >
        <MinusIcon size={sm ? 15 : 18} />
      </motion.button>
      <span
        className={clsx(
          "relative grid overflow-hidden text-center font-display font-semibold tabular-nums",
          sm ? "h-8 w-7 text-sm" : "h-11 w-10 text-base",
        )}
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="sr-only">{labels.qty}: </span>
        <AnimatePresence initial={false} mode="popLayout" custom={dir}>
          <motion.span
            key={value}
            custom={dir}
            className="col-start-1 row-start-1 grid place-items-center"
            initial={reduce ? { opacity: 0 } : { y: dir * 18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { y: dir * -18, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            {value}
          </motion.span>
        </AnimatePresence>
      </span>
      <motion.button
        type="button"
        className={btn}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={labels.increase}
        whileTap={reduce ? undefined : { scale: 0.86 }}
      >
        <PlusIcon size={sm ? 15 : 18} />
      </motion.button>
    </div>
  );
}
