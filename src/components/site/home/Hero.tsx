// 1 · Hero — living wave background, giant split headline (server-split, CSS-animated → paints instantly for
// LCP, choreographed after the intro), CTAs, trust row, floating product (poster → 3D), scroll cue.
import { Fragment, type CSSProperties } from "react";
import clsx from "clsx";
import type { Locale } from "@/i18n/config";
import WaveBackground from "../WaveBackground";
import MagneticButton from "../MagneticButton";
import HeroStage from "./HeroStage";
import HeroScrollFx from "./HeroScrollFx";
import type { HomeDict } from "../types";

type Props = { locale: Locale; dict: HomeDict["hero"]; trust: string[]; poster: string };

const d = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;

export default function Hero({ locale, dict, trust, poster }: Props) {
  let charIndex = 0;
  const full = dict.title.map((l) => l.text).join(" ");

  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-ink"
    >
      <WaveBackground className="absolute inset-0 -z-20" focus={[0.74, 0.42]} webglOnMobile={false} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[38%] bg-gradient-to-b from-transparent via-ink/60 to-ink"
      />

      <HeroScrollFx>
        <div data-hero-veil aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-ink opacity-0" />

        <div className="container-site relative grid flex-1 grid-rows-[auto_1fr] pb-[clamp(2.25rem,6vh,4.5rem)] pt-[4.5rem] lg:grid-cols-[1.32fr_1fr] lg:grid-rows-1 lg:items-end lg:gap-10 lg:pt-28">
          {/* Product stage */}
          <div
            data-hero-stage
            className="relative mx-auto h-[30svh] min-h-[200px] w-full max-w-[420px] lg:order-2 lg:mx-0 lg:h-[min(74vh,760px)] lg:max-w-none lg:self-center"
          >
            {/* transform-only entrance (no opacity): the stand still is the LCP element and paints as soon as it loads */}
            <div className="hero-zoom relative h-full w-full" style={d(0.35)}>
              <HeroStage alt={dict.standAlt} poster={poster} />
              <div
                className="hero-in absolute bottom-[14%] left-[2%] hidden items-center gap-2.5 rounded-full border border-white/10 bg-panel/60 py-2 pl-2 pr-4 text-xs font-medium text-text/90 backdrop-blur-md sm:flex md:bottom-[18%] md:left-[4%]"
                style={d(1.1)}
              >
                <span className="relative grid h-7 w-7 place-items-center rounded-full bg-violet/30">
                  <span className="pulse-ring absolute inset-0 rounded-full border border-violet-2/70" aria-hidden="true" />
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-violet-3" aria-hidden="true">
                    <path d="M8.5 9.5a3.5 3.5 0 0 1 0 5M11.5 7a7 7 0 0 1 0 10M14.5 4.5a10.5 10.5 0 0 1 0 15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
                {dict.badge}
              </div>
            </div>
          </div>

          {/* Copy */}
          <div data-hero-copy className="relative flex flex-col justify-end pt-6 lg:order-1 lg:pt-0">
            {/* The pill (what we sell, where) is part of the H1, then the headline; both read as one heading. */}
            <h1 id="hero-title">
              <span
                className="hero-in mb-5 flex w-fit items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 font-sans text-[0.72rem] font-medium tracking-wide text-text/80 backdrop-blur md:mb-7 md:text-xs"
                style={d(0)}
              >
                <span className="relative flex h-2 w-2" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-2 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-2" />
                </span>
                {dict.eyebrow}
                <span className="sr-only"> — </span>
              </span>
              <span className="block text-display text-[clamp(2.9rem,12.4vw,5.5rem)] leading-[0.95] lg:text-[clamp(4.25rem,6.7vw,8.75rem)] lg:leading-[0.9]">
              <span className="sr-only">{full}</span>
              <span aria-hidden="true">
                {dict.title.map((line, li) => (
                  <span key={li} className="block">
                    {line.text.split(" ").map((word, wi, words) => {
                      const accent = Boolean(line.accent) && word === line.accent;
                      return (
                        <Fragment key={wi}>
                          <span className={clsx("hero-word relative", accent && "hero-accent")}>
                            {Array.from(word).map((ch, ci) => (
                              <span key={ci} className="hero-char" style={{ "--i": charIndex++ } as CSSProperties}>
                                {ch}
                              </span>
                            ))}
                            {accent && (
                              <svg
                                className="hero-underline pointer-events-none absolute bottom-[0.02em] left-[2%] h-[0.16em] w-[96%] overflow-visible"
                                viewBox="0 0 300 20"
                                preserveAspectRatio="none"
                                aria-hidden="true"
                              >
                                <defs>
                                  <linearGradient id="hero-ul" x1="0" x2="1">
                                    <stop offset="0" stopColor="#461CF7" />
                                    <stop offset="1" stopColor="#8C7BFF" />
                                  </linearGradient>
                                </defs>
                                <path pathLength={1} d="M3 14 C 70 3, 160 3, 297 9" fill="none" stroke="url(#hero-ul)" strokeWidth="6" strokeLinecap="round" />
                              </svg>
                            )}
                          </span>
                          {wi < words.length - 1 && " "}
                        </Fragment>
                      );
                    })}
                  </span>
                ))}
              </span>
              </span>
            </h1>

            <div className="mt-6 md:mt-8">
              <div>
                <p className="hero-in max-w-[34rem] text-[0.98rem] leading-relaxed text-text/75 md:text-[1.12rem]" style={d(0.5)}>
                  {dict.sub}
                </p>
                <div className="hero-in mt-7 flex flex-wrap items-center gap-3" style={d(0.62)}>
                  <MagneticButton
                    href={`/${locale}/shop`}
                    size="lg"
                    icon={
                      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
                        <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    }
                  >
                    {dict.ctaOrder}
                  </MagneticButton>
                  <MagneticButton
                    href={`/${locale}/about`}
                    size="lg"
                    variant="ghost"
                    iconPosition="start"
                    icon={
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-white/10">
                        <svg viewBox="0 0 16 16" className="ml-0.5 h-3 w-3" aria-hidden="true">
                          <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
                        </svg>
                      </span>
                    }
                  >
                    {dict.ctaFilm}
                  </MagneticButton>
                </div>
              </div>

              <ul className="hero-in mt-8 flex flex-wrap gap-x-5 gap-y-2.5 text-[0.82rem] text-text/70" style={d(0.78)}>
                {trust.map((t) => (
                  <li key={t} className="inline-flex items-center gap-2">
                    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-ok" aria-hidden="true">
                      <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>

        </div>

        {/* Scroll cue */}
        <div
          data-hero-cue
          className="pointer-events-none absolute bottom-6 right-[clamp(1rem,4vw,3rem)] hidden lg:block"
          aria-hidden="true"
        >
          <div className="hero-fade flex flex-col items-center gap-3" style={d(1.2)}>
            <span className="text-[0.65rem] font-medium uppercase tracking-[0.3em] text-muted [writing-mode:vertical-rl]">{dict.scroll}</span>
            <span className="relative h-12 w-px overflow-hidden bg-white/10">
              <span className="scroll-cue-line absolute inset-0 bg-gradient-to-b from-violet-3 to-transparent" />
            </span>
          </div>
        </div>
      </HeroScrollFx>
    </section>
  );
}
