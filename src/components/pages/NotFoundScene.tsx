"use client";
// Playful 404: "this link isn't on the menu". The 0 of 404 is an NFC disc you can tap (ripples burst where you
// tap, the digits glitch), the digits lean toward the cursor in 3D, and a digital menu lists what IS being served
// — with this page crossed out as "sold out". Used by [locale]/not-found and the global 404.
import { useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import { CharRise, useFinePointer, useReducedMotionPref } from "./motion";
import { waLink } from "./lib";
import type { NotFoundDict } from "./types";
import { IconArrowRight, IconFilm, IconNfc, IconPhone, IconStore, IconWhatsApp } from "./icons";

type Props = {
  dicts: Record<Locale, NotFoundDict>;
  /** Forced locale (global 404). Otherwise read from the [locale] route param. */
  locale?: Locale;
  whatsapp: string;
  /**
   * false on the global 404: a prefetch of /fr, /fr/shop… carries preload hints for the site's own font files, which
   * that page already loaded under other URLs (src/fonts/not-found.ts) — the same fonts would be downloaded twice.
   */
  prefetch?: boolean;
};

export default function NotFoundScene({ dicts, locale: forced, whatsapp, prefetch }: Props) {
  const params = useParams<{ locale?: string }>();
  const fromRoute = params?.locale;
  const locale: Locale = forced ?? (fromRoute && isLocale(fromRoute) ? fromRoute : defaultLocale);
  const t = dicts[locale];
  const base = `/${locale}`;
  const reduce = useReducedMotionPref();
  const fine = useFinePointer();
  const stageRef = useRef<HTMLDivElement>(null);
  const digitsRef = useRef<HTMLDivElement>(null);
  const [pops, setPops] = useState<{ id: number; x: number; y: number }[]>([]);

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = stageRef.current;
    if (!el || !fine || reduce) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--rx", `${((e.clientY - r.top) / r.height - 0.5) * -14}deg`);
    el.style.setProperty("--ry", `${((e.clientX - r.left) / r.width - 0.5) * 18}deg`);
  };
  const onLeave = () => {
    stageRef.current?.style.setProperty("--rx", "0deg");
    stageRef.current?.style.setProperty("--ry", "0deg");
  };

  const tapZero = (e: MouseEvent<HTMLButtonElement>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const r = stage.getBoundingClientRect();
    const b = e.currentTarget.getBoundingClientRect();
    // keyboard activation has no pointer position: burst from the center of the zero
    const x = e.clientX || b.left + b.width / 2;
    const y = e.clientY || b.top + b.height / 2;
    const id = Date.now() + Math.random();
    setPops((p) => [...p.slice(-5), { id, x: x - r.left, y: y - r.top }]);
    if (!reduce) {
      digitsRef.current?.animate(
        [
          { translate: "-5px 1px", filter: "drop-shadow(4px 0 rgba(123,92,255,.9)) drop-shadow(-4px 0 rgba(240,89,106,.7))" },
          { translate: "5px -2px", filter: "drop-shadow(-4px 0 rgba(123,92,255,.9)) drop-shadow(4px 0 rgba(43,212,138,.6))" },
          { translate: "-2px 0", filter: "drop-shadow(2px 0 rgba(123,92,255,.8))" },
          { translate: "0 0", filter: "none" },
        ],
        { duration: 420, easing: "steps(4, end)" },
      );
    }
    if (typeof navigator !== "undefined" && "vibrate" in navigator && (navigator.userActivation?.hasBeenActive ?? true)) {
      navigator.vibrate?.(12);
    }
  };

  const withPage = (e: MouseEvent<HTMLAnchorElement>) => {
    // Attach the missing URL to the help message at click time (no hydration mismatch, no server state).
    e.currentTarget.href = waLink(whatsapp, `${t.waMessage} ${window.location.href}`);
  };

  return (
    <section className="relative isolate flex min-h-[100svh] items-center overflow-hidden py-28" aria-labelledby="nf-title">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_35%,rgba(70,28,247,.35),transparent_70%)]" />
      <div className="container-site">
        <div className="grid items-center gap-14 lg:grid-cols-[1.15fr_1fr] lg:gap-20">
          <div>
            {/* 404 with a tappable NFC zero */}
            <div
              ref={stageRef}
              onPointerMove={onMove}
              onPointerLeave={onLeave}
              className="relative select-none [perspective:900px]"
            >
              <div
                ref={digitsRef}
                className="flex items-center gap-[0.04em] font-display text-[clamp(7rem,22vw,15rem)] font-extrabold leading-none tracking-[-0.06em] text-white transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] [transform:rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))]"
                style={{ transformStyle: "preserve-3d" } as CSSProperties}
              >
                <span className="sr-only">404</span>
                <span aria-hidden className="op-glitch">4</span>
                <button
                  type="button"
                  onClick={tapZero}
                  aria-label={t.tapHint}
                  className="group relative mx-[0.02em] grid aspect-square w-[0.82em] place-items-center rounded-full border-[0.07em] border-violet-2 bg-violet/15 text-violet-3 shadow-[0_0_80px_-10px_rgba(70,28,247,.9),inset_0_0_40px_rgba(70,28,247,.4)] outline-none transition-transform duration-300 hover:scale-[1.04] focus-visible:ring-4 focus-visible:ring-violet-2/60 active:scale-95 [transform:translateZ(40px)]"
                >
                  <span aria-hidden className="op-halo absolute inset-[-6%] rounded-full border border-violet-2/60" />
                  <span aria-hidden className="op-halo absolute inset-[-6%] rounded-full border border-violet-2/40 [animation-delay:1.2s]" />
                  <IconNfc className="h-[0.34em] w-[0.34em] transition-transform duration-500 group-hover:rotate-12" />
                </button>
                <span aria-hidden className="op-glitch [animation-delay:.35s]">4</span>
              </div>
              {pops.map((p) => (
                <span key={p.id} aria-hidden className="op-pop" style={{ "--x": `${p.x}px`, "--y": `${p.y}px` } as CSSProperties} onAnimationEnd={() => setPops((all) => all.filter((x) => x.id !== p.id))} />
              ))}
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.3em] text-muted">
                <span aria-hidden>↑ </span>
                {t.tapHint}
              </p>
            </div>

            <p className="eyebrow mt-10">{t.eyebrow}</p>
            <h1 id="nf-title" className="mt-4 text-display text-[clamp(2.2rem,5.4vw,4.6rem)]">
              <CharRise text={t.title} delayMs={120} />
            </h1>
            <p className="op-fade-up mt-5 max-w-xl text-lg leading-relaxed text-muted" style={{ "--d": "500ms" } as CSSProperties}>
              {t.lead}
            </p>

            <div className="op-fade-up mt-9 flex flex-wrap items-center gap-3" style={{ "--d": "650ms" } as CSSProperties}>
              <Link href={base} prefetch={prefetch} className="group inline-flex h-14 items-center gap-3 rounded-full bg-violet px-7 font-semibold text-white shadow-[0_10px_40px_-10px_rgba(70,28,247,.75)] transition hover:bg-violet-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-2">
                {t.home}
                <IconArrowRight size={18} className="transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
              <a
                href={waLink(whatsapp, t.waMessage)}
                onClick={withPage}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-14 items-center gap-2.5 rounded-full px-6 text-sm font-semibold text-text ring-1 ring-inset ring-white/12 transition hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-2"
              >
                <IconWhatsApp size={18} className="text-whatsapp" />
                {t.whatsapp}
              </a>
            </div>
          </div>

          {/* the digital menu */}
          <div className="op-fade-up" style={{ "--d": "400ms" } as CSSProperties}>
            <div className="op-float relative mx-auto max-w-md rounded-[32px] border border-white/10 bg-gradient-to-b from-[#1b1612] to-[#0d0b09] p-7 shadow-[0_40px_120px_-30px_rgba(0,0,0,.95)] md:p-9">
              <span aria-hidden className="absolute inset-x-10 -top-px h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
              <p className="text-center text-[11px] font-semibold uppercase tracking-[0.4em] text-gold/80">{t.menuTitle}</p>
              <ul className="mt-7 space-y-4">
                {t.menu.map((m) => (
                  <li key={m.label} className="flex items-baseline gap-3 text-[15px]">
                    <span className="font-display font-semibold text-white">{m.label}</span>
                    <span aria-hidden className="mb-1 flex-1 border-b border-dotted border-white/20" />
                    <span className="font-mono text-sm text-gold">{m.state}</span>
                  </li>
                ))}
                <li className="op-wobble flex items-baseline gap-3 text-[15px] text-off">
                  <span className="relative font-display font-semibold">
                    {t.missing}
                    <span aria-hidden className="absolute inset-x-0 top-1/2 h-[2px] origin-left bg-off [animation:op-strike_.9s_cubic-bezier(.16,1,.3,1)_1.1s_both]" />
                  </span>
                  <span aria-hidden className="mb-1 flex-1 border-b border-dotted border-off/40" />
                  <span className="rounded-full bg-off/15 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider">{t.missingState}</span>
                </li>
              </ul>
              <div className="mt-9 grid grid-cols-3 gap-2 border-t border-white/10 pt-6">
                <MenuLink prefetch={prefetch} href={`${base}/shop`} label={t.shop} icon={<IconStore size={18} />} />
                <MenuLink prefetch={prefetch} href={`${base}/about`} label={t.film} icon={<IconFilm size={18} />} />
                <MenuLink prefetch={prefetch} href={`${base}/contact`} label={t.contact} icon={<IconPhone size={18} />} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MenuLink({ href, label, icon, prefetch }: { href: string; label: string; icon: ReactNode; prefetch?: boolean }) {
  return (
    <Link href={href} prefetch={prefetch} className="group flex flex-col items-center gap-2 rounded-2xl px-2 py-3 text-center text-xs font-semibold text-text/80 transition hover:bg-white/[0.05] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-2">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-gold transition group-hover:bg-violet group-hover:text-white">{icon}</span>
      {label}
    </Link>
  );
}
