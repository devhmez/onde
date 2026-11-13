"use client";
// "Why ONDE exists": the film's line lights up word by word as you scroll, then the five friction steps of
// leaving a review get struck through one by one and collapse into a single glowing "1 tap."
import { useRef } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import clsx from "clsx";
import Section, { Eyebrow } from "@/components/site/Section";
import Reveal from "@/components/site/Reveal";
import { ScrollWords, useReducedMotionPref } from "../motion";
import { IconArrowRight, IconNfc } from "../icons";
import type { AboutDict } from "../types";

export default function WhySection({ t }: { t: AboutDict["why"] }) {
  return (
    <Section spacing="lg" aria-labelledby="why-title">
      <Eyebrow>{t.eyebrow}</Eyebrow>
      <h2 id="why-title" className="sr-only">
        {t.line1} {t.line2}
      </h2>
      <div aria-hidden>
        <ScrollWords
          className="mt-6 text-display text-[clamp(2.3rem,6.6vw,6.4rem)] leading-[0.98]"
          lines={[
            { text: t.line1, className: "text-text" },
            { text: t.line2, className: "text-violet-3 text-glow" },
          ]}
        />
      </div>
      <div className="mt-[clamp(3rem,7vw,6rem)] grid items-start gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-20">
        <Reveal as="p" type="lines" className="max-w-xl text-lg leading-relaxed text-muted md:text-xl">
          {t.body}
        </Reveal>
        <FrictionSteps steps={t.steps} label={t.stepsLabel} oneTap={t.oneTap} oneTapSub={t.oneTapSub} />
      </div>
    </Section>
  );
}

function FrictionSteps({ steps, label, oneTap, oneTapSub }: { steps: string[]; label: string; oneTap: string; oneTapSub: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotionPref();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.45"] });
  const n = steps.length;
  const tapScale = useTransform(scrollYProgress, [n / (n + 1), 1], [0.6, 1]);
  const tapOpacity = useTransform(scrollYProgress, [n / (n + 1), 1], [0, 1]);

  return (
    <div ref={ref} className="relative">
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.24em] text-muted">{label}</p>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <FrictionStep progress={scrollYProgress} start={i / (n + 1)} end={(i + 1) / (n + 1)} reduce={reduce}>
              {s}
            </FrictionStep>
            {i < n - 1 ? <IconArrowRight size={16} className="text-line" /> : null}
          </li>
        ))}
      </ol>
      <motion.div
        className="mt-8 inline-flex items-center gap-4 rounded-full border border-violet/50 bg-violet/15 py-3 pl-3 pr-6 shadow-[0_0_60px_-10px_rgba(70,28,247,.7)]"
        style={reduce ? undefined : { scale: tapScale, opacity: tapOpacity, transformOrigin: "left center" }}
      >
        <span className="relative grid h-11 w-11 place-items-center rounded-full bg-violet text-white">
          <span aria-hidden className="pulse-ring absolute inset-0 rounded-full border border-violet-2" />
          <IconNfc size={22} />
        </span>
        <span className="font-display text-2xl font-extrabold tracking-tight text-white">{oneTap}</span>
        <span className="text-sm font-medium text-violet-3">{oneTapSub}</span>
      </motion.div>
    </div>
  );
}

function FrictionStep({ children, progress, start, end, reduce }: { children: string; progress: MotionValue<number>; start: number; end: number; reduce: boolean }) {
  const strike = useTransform(progress, [start, end], [0, 1]);
  const opacity = useTransform(progress, [start, end], [1, 0.38]);
  return (
    <motion.span
      className={clsx("relative inline-flex items-center rounded-full border border-line bg-panel/70 px-4 py-2 text-sm text-text/90 backdrop-blur", reduce && "opacity-40 line-through")}
      style={reduce ? undefined : { opacity }}
    >
      {children}
      {!reduce ? (
        <motion.span aria-hidden className="absolute left-3 right-3 top-1/2 h-[2px] origin-left rounded-full bg-off" style={{ scaleX: strike }} />
      ) : null}
    </motion.span>
  );
}
