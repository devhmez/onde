"use client";
// "The chip never changes. The destination can." — an interactive version of the film's diagram:
// chip → permanent link → ONDE Cloud → destinations. The live route cycles on its own while visible; visitors
// can also click a destination to "switch" it themselves (with the green "Updated live" confirmation).
import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import Section, { Eyebrow } from "@/components/site/Section";
import Reveal from "@/components/site/Reveal";
import Logo from "@/components/site/Logo";
import { RevealBlock, useReducedMotionPref } from "../motion";
import { IconCheck, IconChip, IconContact, IconGlobe, IconInstagram, IconMenu, IconStar, IconTikTok } from "../icons";
import type { AboutDict } from "../types";

const DEST_ICONS = [IconStar, IconInstagram, IconTikTok, IconMenu, IconGlobe, IconContact];
const EXAMPLE_LINK = "onde.tn/t/A7K92X";

// Desktop diagram geometry (SVG viewBox 1000 × 440)
const VB_W = 1000;
const VB_H = 440;
const CY = 220;
const CLOUD = { x: 600, r: 64 };
const DEST_X = 760;
const destY = (i: number, n: number) => CY + (i - (n - 1) / 2) * 62;

export default function SmartLinkSection({ t }: { t: AboutDict["link"] }) {
  const reduce = useReducedMotionPref();
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [pulse, setPulse] = useState(0);
  const [visible, setVisible] = useState(false);
  const [manual, setManual] = useState(false);
  const n = t.destinations.length;

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || reduce || manual) return;
    const id = window.setInterval(() => {
      setActive((a) => (a + 1) % n);
      setPulse((p) => p + 1);
    }, 2600);
    return () => window.clearInterval(id);
  }, [visible, reduce, manual, n]);

  const choose = (i: number) => {
    setManual(true);
    setActive(i);
    setPulse((p) => p + 1);
  };

  return (
    <Section spacing="lg" className="overflow-hidden" aria-labelledby="link-title">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_60%_55%,rgba(70,28,247,.28),transparent_70%)]" />
      <div className="relative">
        <Eyebrow>{t.eyebrow}</Eyebrow>
        <h2 id="link-title" className="mt-5 text-display text-[clamp(2.3rem,6vw,5.6rem)]">
          <Reveal as="span" type="words" className="block">
            {t.titleA}
          </Reveal>
          <Reveal as="span" type="words" delay={0.15} className="block text-violet-3 text-glow">
            {t.titleB}
          </Reveal>
        </h2>
        <Reveal as="p" type="lines" className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
          {t.body}
        </Reveal>

        <div ref={rootRef} className="mt-[clamp(2.5rem,6vw,5rem)]" data-play={visible ? "true" : "false"}>
          {/* ---------- desktop diagram ---------- */}
          <div className="@container relative mx-auto hidden w-full max-w-[1100px] lg:block" style={{ aspectRatio: `${VB_W} / ${VB_H}` }}>
            <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="absolute inset-0 h-full w-full" aria-hidden>
              <defs>
                <filter id="op-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <line x1={190} y1={CY} x2={262} y2={CY} stroke="#7b5cff" strokeWidth={2} className="op-dash" />
              <line x1={478} y1={CY} x2={CLOUD.x - CLOUD.r - 6} y2={CY} stroke="#7b5cff" strokeWidth={2} className="op-dash" />
              {t.destinations.map((_, i) => {
                const y = destY(i, n);
                const x0 = CLOUD.x + CLOUD.r;
                const d = `M${x0} ${CY} C ${x0 + 50} ${CY}, ${DEST_X - 60} ${y}, ${DEST_X} ${y}`;
                const on = i === active;
                return (
                  <g key={i}>
                    <path d={d} fill="none" stroke={on ? "#7b5cff" : "#24222e"} strokeWidth={on ? 2.5 : 1.5} style={{ transition: "stroke .5s" }} filter={on ? "url(#op-glow)" : undefined} />
                    {on && !reduce ? <path key={pulse} d={d} fill="none" stroke="#c9bfff" strokeWidth={2.5} className="op-dash" /> : null}
                  </g>
                );
              })}
              <circle cx={CLOUD.x} cy={CY} r={CLOUD.r + 14} fill="none" stroke="rgba(123,92,255,.25)" />
              <circle cx={CLOUD.x} cy={CY} r={CLOUD.r} fill="#0b0a10" stroke="rgba(123,92,255,.6)" strokeWidth={1.5} />
            </svg>

            {/* chip */}
            <Node x={20} y={CY - 52} w={170} h={104}>
              <div className="flex h-full flex-col justify-center rounded-[1.4cqw] border border-white/10 bg-panel/90 px-[1.6cqw] shadow-xl">
                <IconChip className="h-[2.6cqw] w-[2.6cqw] text-violet-3" />
                <span className="mt-[0.8cqw] text-[1.5cqw] font-semibold leading-none text-white">{t.chip}</span>
                <span className="mt-[0.4cqw] text-[1.1cqw] text-muted">{t.chipSub}</span>
              </div>
            </Node>

            {/* permanent link */}
            <Node x={262} y={CY - 26} w={216} h={52}>
              <span className="absolute -top-[2.6cqw] left-0 right-0 text-center text-[0.95cqw] font-semibold uppercase tracking-[0.3em] text-violet-3">{t.permanent}</span>
              <div className="grid h-full place-items-center rounded-full border border-violet/50 bg-ink-2/90 font-mono text-[1.45cqw] text-white shadow-[0_0_40px_-10px_rgba(70,28,247,.8)]">{EXAMPLE_LINK}</div>
              <span className="absolute -bottom-[2.2cqw] left-0 right-0 text-center text-[0.9cqw] text-muted">{t.exampleNote}</span>
            </Node>

            {/* cloud */}
            <Node x={CLOUD.x - CLOUD.r} y={CY - CLOUD.r} w={CLOUD.r * 2} h={CLOUD.r * 2}>
              <div className="grid h-full place-items-center">
                <Logo className="w-[70%] text-white" />
              </div>
              <span className="absolute -bottom-[3.2cqw] left-1/2 -translate-x-1/2 whitespace-nowrap text-[1.3cqw] font-semibold text-white">{t.cloud}</span>
              <span
                key={pulse}
                className={clsx(
                  "absolute -bottom-[6.6cqw] left-1/2 inline-flex -translate-x-1/2 items-center gap-[0.5cqw] whitespace-nowrap rounded-full border border-ok/40 bg-ok/10 px-[1.1cqw] py-[0.45cqw] text-[1.05cqw] font-semibold text-ok",
                  pulse > 0 && !reduce && "[animation:op-blink-ok_2.2s_cubic-bezier(.16,1,.3,1)_forwards]",
                  pulse === 0 && "opacity-0",
                )}
              >
                <IconCheck className="h-[1.2cqw] w-[1.2cqw]" /> {t.updated}
              </span>
            </Node>

            {/* destinations */}
            {t.destinations.map((label, i) => {
              const Icon = DEST_ICONS[i] ?? IconGlobe;
              const on = i === active;
              return (
                <Node key={label} x={DEST_X} y={destY(i, n) - 22} w={220} h={44}>
                  <DestButton on={on} onClick={() => choose(i)} className="h-full w-full gap-[1cqw] rounded-[1.2cqw] px-[1.4cqw] text-[1.45cqw]">
                    <Icon className="h-[1.7cqw] w-[1.7cqw] shrink-0" />
                    <span className="truncate">{label}</span>
                  </DestButton>
                </Node>
              );
            })}
          </div>

          {/* ---------- phones & tablets: vertical stack ---------- */}
          <div className="mx-auto max-w-xl lg:hidden">
            <div className="flex flex-col items-center">
              <div className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-panel/90 p-4">
                <IconChip className="h-7 w-7 shrink-0 text-violet-3" />
                <div>
                  <p className="font-semibold text-white">{t.chip}</p>
                  <p className="text-xs text-muted">{t.chipSub}</p>
                </div>
              </div>
              <span aria-hidden className="h-6 w-px bg-violet-2/70" />
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-3">{t.permanent}</p>
              <div className="w-full rounded-full border border-violet/50 bg-ink-2 py-3 text-center font-mono text-sm text-white shadow-[0_0_40px_-10px_rgba(70,28,247,.8)]">{EXAMPLE_LINK}</div>
              <p className="mt-1.5 text-[10px] text-muted">{t.exampleNote}</p>
              <span aria-hidden className="h-6 w-px bg-violet-2/70" />
              <div className="relative grid h-24 w-24 place-items-center rounded-full border border-violet/60 bg-ink-2 shadow-[0_0_50px_-10px_rgba(70,28,247,.9)]">
                <Logo className="w-[68%] text-white" />
              </div>
              <p className="mt-2 text-sm font-semibold text-white">{t.cloud}</p>
              <p key={pulse} className={clsx("mt-2 inline-flex items-center gap-1.5 rounded-full border border-ok/40 bg-ok/10 px-3 py-1 text-xs font-semibold text-ok", pulse === 0 && "opacity-0", pulse > 0 && !reduce && "[animation:op-blink-ok_2.2s_cubic-bezier(.16,1,.3,1)_forwards]")}>
                <IconCheck size={14} /> {t.updated}
              </p>
              <span aria-hidden className="h-6 w-px bg-violet-2/70" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {t.destinations.map((label, i) => {
                const Icon = DEST_ICONS[i] ?? IconGlobe;
                return (
                  <DestButton key={label} on={i === active} onClick={() => choose(i)} className="gap-2 rounded-xl px-3 py-3 text-sm">
                    <Icon size={18} className="shrink-0" />
                    <span className="truncate">{label}</span>
                  </DestButton>
                );
              })}
            </div>
          </div>

          <p className="sr-only" aria-live="polite">
            {manual ? `${t.updated} — ${t.destinations[active]}` : ""}
          </p>
        </div>

        <RevealBlock className="mt-[clamp(3rem,6vw,5rem)] border-t border-line pt-8">
          <p className="text-display text-[clamp(1.5rem,3vw,2.4rem)]">{t.futureTitle}</p>
          <p className="mt-2 text-muted">{t.futureBody}</p>
        </RevealBlock>
      </div>
    </Section>
  );
}

function Node({ x, y, w, h, children }: { x: number; y: number; w: number; h: number; children: ReactNode }) {
  return (
    <div className="absolute" style={{ left: `${(x / VB_W) * 100}%`, top: `${(y / VB_H) * 100}%`, width: `${(w / VB_W) * 100}%`, height: `${(h / VB_H) * 100}%` }}>
      {children}
    </div>
  );
}

function DestButton({ on, onClick, className, children }: { on: boolean; onClick: () => void; className?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={clsx(
        "inline-flex items-center border font-medium transition duration-500 ease-[cubic-bezier(.16,1,.3,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-2",
        on ? "scale-[1.04] border-violet-2 bg-violet text-white shadow-[0_0_40px_-6px_rgba(70,28,247,.9)]" : "border-white/10 bg-panel/80 text-text/80 hover:border-violet/50 hover:text-white",
        className,
      )}
    >
      {children}
    </button>
  );
}
