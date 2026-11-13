// 3 · Why reviews matter — film-style thin giant numbers that count up, with source lines.
import type { Locale } from "@/i18n/config";
import Section, { Eyebrow } from "../Section";
import Reveal from "../Reveal";
import clsx from "clsx";
import Counter from "../Counter";
import type { HomeDict } from "../types";

export default function Stats({ locale, dict }: { locale: Locale; dict: HomeDict["stats"] }) {
  return (
    <Section id="why" aria-labelledby="stats-title" className="overflow-hidden bg-ink">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-[70%] w-[90%] -translate-x-1/2"
        style={{ background: "radial-gradient(50% 50% at 50% 30%, rgb(70 28 247 / 0.14), transparent 70%)" }}
      />
      <div className="relative max-w-4xl">
        <Eyebrow>{dict.eyebrow}</Eyebrow>
        <Reveal as="h2" type="lines" id="stats-title" className="text-display mt-6 text-[clamp(2.2rem,5.6vw,4.9rem)] leading-[0.98]">
          {dict.title}
        </Reveal>
        <Reveal as="p" type="up" delay={0.15} className="mt-6 max-w-xl text-[1.05rem] leading-relaxed text-muted">
          {dict.sub}
        </Reveal>
      </div>

      <Reveal type="stagger" as="ul" className="relative mt-[clamp(3rem,7vw,5.5rem)] grid gap-px overflow-hidden rounded-[28px] border border-white/[0.06] bg-white/[0.06] md:grid-cols-3">
        {dict.items.map((s, i) => (
          <li key={i} data-reveal-item className="group relative flex flex-col bg-ink-2 p-7 md:p-9 lg:p-11">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-700 group-hover:opacity-100"
              style={{ background: "radial-gradient(70% 60% at 30% 0%, rgb(70 28 247 / 0.16), transparent 70%)" }}
            />
            <p
              className={clsx(
                "relative whitespace-nowrap font-display font-light leading-none tracking-[-0.04em] text-text",
                // a range ("+5–9 %") is two numbers wide: smaller type so it stays on one line in a 1/3 column
                s.valueTo !== undefined ? "text-[clamp(3.4rem,6.4vw,6rem)]" : "text-[clamp(4.2rem,9vw,7.5rem)]",
              )}
            >
              {s.prefix}
              <Counter to={s.value} locale={locale} duration={s.valueTo ? 1.6 : 2.2} />
              {s.valueTo !== undefined && (
                <>
                  <span className="text-muted">–</span>
                  <Counter to={s.valueTo} locale={locale} duration={2} delay={0.15} />
                </>
              )}
              <span className="text-violet-3">{s.suffix}</span>
            </p>
            <p className="relative mt-5 max-w-[22rem] text-[1rem] leading-relaxed text-text/80">{s.label}</p>
            <p className="relative mt-auto pt-8 text-[0.72rem] leading-snug tracking-wide text-muted/80">{s.source}</p>
          </li>
        ))}
      </Reveal>

      <Reveal as="p" type="words" className="relative mx-auto mt-[clamp(3rem,7vw,5rem)] max-w-3xl text-center font-display text-[clamp(1.5rem,3.2vw,2.5rem)] font-semibold leading-tight tracking-[-0.02em] text-text/90">
        {dict.outro}
      </Reveal>
    </Section>
  );
}
