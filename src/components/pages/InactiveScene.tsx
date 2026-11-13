// Branded landing for smart links that can't redirect (not configured, paused, unknown code) — usually reached
// by a customer tapping a product in a shop, sometimes by the owner. Speaks to both, on the living wave.
import type { CSSProperties } from "react";
import Link from "next/link";
import clsx from "clsx";
import type { Locale } from "@/i18n/config";
import WaveBackground from "@/components/site/WaveBackground";
import MagneticButton from "@/components/site/MagneticButton";
import Logo from "@/components/site/Logo";
import { Ripples } from "./Ambient";
import { CharRise } from "./motion";
import { fmt, waLink } from "./lib";
import type { TagState } from "./data";
import type { InactiveProduct } from "./inactive-data";
import type { InactiveDict } from "./types";
import { IconArrowRight, IconFilm, IconNfc, IconStore, IconWhatsApp } from "./icons";

const TONE: Record<TagState, { rgb: string; dot: string }> = {
  inactive: { rgb: "123 92 255", dot: "bg-violet-2" },
  paused: { rgb: "245 165 36", dot: "bg-gold" },
  unknown: { rgb: "240 89 106", dot: "bg-off" },
  active: { rgb: "43 212 138", dot: "bg-ok" },
};

export default function InactiveScene({
  t,
  locale,
  code,
  state,
  kind = null,
  whatsapp,
}: {
  t: InactiveDict;
  locale: Locale;
  code: string | null;
  state: TagState;
  /** Product behind the code, when known: names it in the title ("Ce présentoir ONDE n'est pas encore activé."). */
  kind?: InactiveProduct | null;
  whatsapp: string;
}) {
  const copy = t.states[state];
  const title = kind && (state === "inactive" || state === "paused") ? t.products[kind][state] : copy.title;
  const tone = TONE[state];
  const ownerMessage = fmt(t.owner.message, { codePart: code ? fmt(t.owner.codePart, { code }) : "" });
  const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

  return (
    <section className="relative isolate flex min-h-[100svh] items-center overflow-hidden pb-16 pt-[clamp(7rem,12vw,9rem)]" aria-labelledby="inactive-title">
      <WaveBackground intensity={0.75} focus={[0.5, 0.3]} className="absolute inset-0 -z-20" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_30%,transparent,rgba(5,4,7,.88))]" />

      <div className="container-site">
        <div className="mx-auto max-w-3xl text-center">
          {/* the chip, calling into the void */}
          <div className="op-fade-in relative mx-auto grid h-36 w-36 place-items-center md:h-44 md:w-44" style={d(0)}>
            <Ripples count={4} duration={5} size="min(70vmin,520px)" strong rgb={tone.rgb} clip={false} />
            <span className="relative grid h-full w-full place-items-center rounded-full border border-white/10 bg-ink-2/90 shadow-[0_0_80px_-10px_rgba(70,28,247,.8)] backdrop-blur">
              <Logo className="w-[62%] text-white" title="ONDE" />
            </span>
          </div>

          <p className="op-fade-up mt-10 inline-flex items-center gap-3" style={d(200)}>
            <span className={clsx("h-2 w-2 rounded-full", tone.dot)} aria-hidden />
            <span className="eyebrow">{t.eyebrow}</span>
            {code ? (
              <span className="rounded-full border border-line bg-panel/80 px-3 py-1 font-mono text-xs tracking-[0.2em] text-text">
                <span className="sr-only">{t.codeLabel} </span>
                {code}
              </span>
            ) : null}
          </p>
          <h1 id="inactive-title" className="mt-6 text-display text-[clamp(2.3rem,6.4vw,5.4rem)]">
            <CharRise text={title} delayMs={280} />
          </h1>
          <p className="op-fade-up mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted md:text-xl" style={d(700)}>
            {copy.lead}
          </p>

          {state === "active" && code ? (
            <div className="op-fade-up mt-8" style={d(850)}>
              {/* Plain <a>, not next/link: a prefetch of /t/ would hit the redirect route and count a fake tap. */}
              <a
                href={`/t/${encodeURIComponent(code)}`}
                className="group inline-flex h-14 items-center gap-3 rounded-full bg-violet px-8 font-semibold text-white shadow-[0_10px_40px_-10px_rgba(70,28,247,.75)] transition hover:bg-violet-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-2"
              >
                {t.states.active.open}
                <IconArrowRight size={20} className="transition-transform duration-300 group-hover:translate-x-1" />
              </a>
            </div>
          ) : null}
        </div>

        {state !== "active" ? (
          <div className="mx-auto mt-14 grid max-w-5xl gap-4 md:grid-cols-2">
            <article className="op-fade-up relative overflow-hidden rounded-[28px] border border-violet/40 bg-gradient-to-br from-violet/25 via-panel/90 to-ink-2/90 p-7 text-left backdrop-blur-md md:p-8" style={d(950)}>
              <span aria-hidden className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-violet/30 blur-3xl" />
              <span className="relative grid h-11 w-11 place-items-center rounded-2xl bg-violet text-white">
                <IconNfc size={22} />
              </span>
              <h2 className="relative mt-5 font-display text-2xl font-bold tracking-tight">{t.owner.title}</h2>
              <p className="relative mt-3 text-base leading-relaxed text-text/80">{t.owner.body}</p>
              <div className="relative mt-7">
                <MagneticButton href={waLink(whatsapp, ownerMessage)} target="_blank" rel="noopener noreferrer" variant="whatsapp" icon={<IconWhatsApp size={20} />} iconPosition="start">
                  {t.owner.cta}
                </MagneticButton>
              </div>
            </article>
            <article className="op-fade-up rounded-[28px] border border-white/[0.07] bg-panel/80 p-7 text-left backdrop-blur-md md:p-8" style={d(1050)}>
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/[0.06] text-violet-3">
                <IconStore size={22} />
              </span>
              <h2 className="mt-5 font-display text-2xl font-bold tracking-tight">{t.visitor.title}</h2>
              <p className="mt-3 text-base leading-relaxed text-muted">{t.visitor.body}</p>
            </article>
          </div>
        ) : null}

        <div className="op-fade-up mx-auto mt-14 flex max-w-5xl flex-col items-center justify-between gap-5 border-t border-white/10 pt-8 text-center md:flex-row md:text-left" style={d(1150)}>
          <p className="font-display text-lg font-semibold tracking-tight text-text/90">{t.discover.title}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <MagneticButton href={`/${locale}/shop`} variant="ghost" icon={<IconArrowRight size={18} />}>
              {t.discover.cta}
            </MagneticButton>
            <Link href={`/${locale}/about`} className="inline-flex h-12 items-center gap-2 rounded-full px-5 text-sm font-semibold text-muted transition hover:text-white">
              <IconFilm size={18} /> {t.discover.film}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
