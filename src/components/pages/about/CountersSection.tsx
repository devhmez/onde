"use client";
// "Made for every counter": business types light up one after another as you scroll (outline → solid),
// over the film's warm bokeh.
import { useRef } from "react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import Section, { Eyebrow } from "@/components/site/Section";
import Reveal from "@/components/site/Reveal";
import { Bokeh } from "../Ambient";
import { useReducedMotionPref } from "../motion";
import type { AboutDict } from "../types";

export default function CountersSection({ t }: { t: AboutDict["counters"] }) {
  const ref = useRef<HTMLUListElement>(null);
  const reduce = useReducedMotionPref();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.8", "end 0.45"] });
  const n = t.items.length;
  return (
    <Section spacing="lg" className="overflow-hidden" aria-labelledby="counters-title">
      <Bokeh density={0.5} className="opacity-70" />
      <div className="relative">
        <Eyebrow as="h2">
          <span id="counters-title">{t.eyebrow}</span>
        </Eyebrow>
        <ul ref={ref} className="mt-8 flex flex-wrap items-baseline gap-x-[0.35em] gap-y-1 text-display text-[clamp(2.2rem,6.2vw,6rem)] leading-[1.02]">
          {t.items.map((w, i) => (
            <li key={w} className="inline-flex items-baseline gap-[0.35em]">
              <CounterWord progress={scrollYProgress} start={i / n} end={(i + 1) / n} reduce={reduce}>
                {w}
              </CounterWord>
              {i < n - 1 ? (
                <span aria-hidden className="text-violet">
                  ·
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        <Reveal as="p" type="lines" className="mt-10 max-w-2xl text-lg text-muted md:text-xl">
          {t.tagline}
        </Reveal>
      </div>
    </Section>
  );
}

function CounterWord({ children, progress, start, end, reduce }: { children: string; progress: MotionValue<number>; start: number; end: number; reduce: boolean }) {
  const fill = useTransform(progress, [start, end], [0, 1]);
  const glow = useTransform(progress, [start, end], ["0 0 0 rgba(70,28,247,0)", "0 0 36px rgba(70,28,247,.55)"]);
  if (reduce) return <span className="text-text">{children}</span>;
  return (
    <span className="relative inline-block">
      <span className="text-outline [--outline-color:rgb(236_235_242/0.28)]">{children}</span>
      <motion.span aria-hidden className="absolute inset-0 text-text" style={{ opacity: fill, textShadow: glow }}>
        {children}
      </motion.span>
    </span>
  );
}
