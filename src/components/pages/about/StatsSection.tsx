// The numbers, the way the film shows them: warm bokeh, hairline numerals that count up, sources cited.
import Section, { Eyebrow } from "@/components/site/Section";
import Reveal from "@/components/site/Reveal";
import Counter from "@/components/site/Counter";
import type { Locale } from "@/i18n/config";
import { Bokeh } from "../Ambient";
import { RevealBlock, Tilt } from "../motion";
import type { AboutDict } from "../types";

export default function StatsSection({ t, locale }: { t: AboutDict["stats"]; locale: Locale }) {
  return (
    <Section spacing="lg" className="overflow-hidden" aria-labelledby="stats-title">
      <Bokeh className="opacity-80 [mask-image:linear-gradient(to_bottom,transparent,#000_20%,#000_80%,transparent)]" />
      <div className="relative">
        <Eyebrow>{t.eyebrow}</Eyebrow>
        <Reveal as="h2" id="stats-title" type="words" className="mt-5 max-w-3xl text-display text-[clamp(2rem,4.6vw,4rem)]">
          {t.title}
        </Reveal>

        <ul className="mt-[clamp(2.5rem,6vw,5rem)] grid gap-5 md:grid-cols-3">
          {t.items.map((s, i) => (
            <RevealBlock as="li" key={s.kicker} delay={i * 0.12} className="h-full">
              <Tilt className="h-full rounded-[28px]">
                <article className="relative flex h-full flex-col overflow-hidden rounded-[28px] border border-white/[0.07] bg-gradient-to-b from-panel/90 to-ink-2/90 p-7 shadow-[0_40px_80px_-40px_rgba(0,0,0,.9)] backdrop-blur-md md:p-8">
                  <span aria-hidden className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet/20 blur-3xl" />
                  <p className="eyebrow">{s.kicker}</p>
                  <p className="mt-6 font-sans text-[clamp(4rem,9vw,6.5rem)] font-extralight leading-none tracking-[-0.04em] text-white">
                    {s.from > 0 ? (
                      <>
                        <Counter to={s.from} locale={locale} duration={1.4} />
                        <span aria-hidden>–</span>
                        <span className="sr-only"> – </span>
                        <Counter to={s.to} locale={locale} duration={1.8} suffix={s.suffix} />
                      </>
                    ) : (
                      <Counter to={s.to} locale={locale} suffix={s.suffix} />
                    )}
                  </p>
                  <p className="mt-5 text-lg leading-snug text-text/90">{s.label}</p>
                  {s.note ? <p className="mt-4 text-base font-medium text-violet-3">{s.note}</p> : null}
                  <p className="mt-auto pt-8 text-xs leading-relaxed text-muted">
                    <span className="font-semibold text-muted">{t.sourceLabel} · </span>
                    {s.source}
                  </p>
                </article>
              </Tilt>
            </RevealBlock>
          ))}
        </ul>
      </div>
    </Section>
  );
}
