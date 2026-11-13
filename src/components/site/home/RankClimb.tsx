"use client";
// "Grow" visual: an illustrative Google-Maps-style local ranking where the business collects reviews,
// its rating climbs and it overtakes the competition to #1. Built in HTML + GSAP, replays on re-entry.
import { useRef } from "react";
import clsx from "clsx";
import type { Locale } from "@/i18n/config";
import { gsap, useGSAP, registerGsap, prefersReducedMotion } from "@/lib/motion";
import type { HomeDict } from "../types";

type Props = { locale: Locale; dict: HomeDict["how"]["rank"]; className?: string };

const ROW = 74; // px per row (incl. gap)

function fmt(n: number, locale: Locale, decimals = 1) {
  return n.toLocaleString(locale === "fr" ? "fr-FR" : "en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function Stars({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  const row = (
    <span className="flex gap-[2px]">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} viewBox="0 0 20 20" className="h-3 w-3" aria-hidden="true">
          <path d="M10 1.5l2.6 5.5 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L1.4 7.7l6-.7z" fill="currentColor" />
        </svg>
      ))}
    </span>
  );
  return (
    <span className={clsx("relative inline-flex", className)} aria-hidden="true">
      <span className="text-white/15">{row}</span>
      <span className="rank-stars-fill absolute inset-y-0 left-0 overflow-hidden text-gold" style={{ width: `${pct}%` }}>
        {row}
      </span>
    </span>
  );
}

export default function RankClimb({ locale, dict, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const you = dict.you;
  const competitors = dict.entries;
  const total = competitors.length + 1;

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      registerGsap();
      const q = gsap.utils.selector(el);
      const youRow = q(".rank-you")[0] as HTMLElement | undefined;
      const others = q(".rank-other") as HTMLElement[];
      const ratingEl = q(".rank-you-rating")[0] as HTMLElement | undefined;
      const reviewsEl = q(".rank-you-reviews")[0] as HTMLElement | undefined;
      const fill = q(".rank-you .rank-stars-fill")[0] as HTMLElement | undefined;
      const badge = q(".rank-badge")[0] as HTMLElement | undefined;
      if (!youRow || !ratingEl || !reviewsEl || !fill || !badge) return;

      const setStart = () => {
        gsap.set(youRow, { y: competitors.length * ROW });
        others.forEach((o, i) => gsap.set(o, { y: i * ROW }));
        ratingEl.textContent = fmt(you.fromRating, locale);
        reviewsEl.textContent = String(you.fromReviews);
        gsap.set(fill, { width: `${(you.fromRating / 5) * 100}%` });
        gsap.set(badge, { scale: 0, opacity: 0 });
        youRow.dataset.top = "false";
      };
      const setEnd = () => {
        gsap.set(youRow, { y: 0 });
        others.forEach((o, i) => gsap.set(o, { y: (i + 1) * ROW }));
        ratingEl.textContent = fmt(you.toRating, locale);
        reviewsEl.textContent = String(you.toReviews);
        gsap.set(fill, { width: `${(you.toRating / 5) * 100}%` });
        gsap.set(badge, { scale: 1, opacity: 1 });
        youRow.dataset.top = "true";
      };

      if (prefersReducedMotion()) {
        setEnd();
        return;
      }
      setStart();
      const counter = { r: you.fromRating, n: you.fromReviews };
      const tl = gsap.timeline({
        paused: true,
        defaults: { ease: "onde.expo" },
        onStart: () => setStart(),
      });
      tl.to(
        counter,
        {
          r: you.toRating,
          n: you.toReviews,
          duration: 2.2,
          ease: "power2.inOut",
          onUpdate: () => {
            ratingEl.textContent = fmt(counter.r, locale);
            reviewsEl.textContent = String(Math.round(counter.n));
          },
        },
        0.2,
      )
        .to(fill, { width: `${(you.toRating / 5) * 100}%`, duration: 2.2, ease: "power2.inOut" }, 0.2)
        .to(youRow, { y: 0, duration: 1.4 }, 1.1)
        .to(others, { y: (i: number) => (i + 1) * ROW, duration: 1.2, stagger: 0.08 }, 1.15)
        .call(() => {
          youRow.dataset.top = "true";
        }, [], 1.9)
        .to(badge, { scale: 1, opacity: 1, duration: 0.6, ease: "back.out(2.5)" }, 2.05);

      gsap.timeline({
        scrollTrigger: {
          trigger: el,
          start: "top 70%",
          end: "bottom top",
          onEnter: () => tl.restart(),
          onEnterBack: () => tl.restart(),
          onLeaveBack: () => {
            tl.pause(0);
            setStart();
          },
        },
      });
    },
    { scope: ref },
  );

  return (
    <div
      ref={ref}
      className={clsx(
        "w-full max-w-[460px] rounded-[26px] border border-white/[0.08] bg-[#0c0b12]/90 p-3.5 shadow-[0_40px_120px_-30px_rgb(70_28_247/0.45)] backdrop-blur-xl md:p-5",
        className,
      )}
    >
      <div className="flex items-center gap-3 rounded-full bg-white/[0.05] px-4 py-3 text-sm text-text/80">
        <svg viewBox="0 0 20 20" className="h-4 w-4 text-muted" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M13 13l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {dict.query}
      </div>

      <div className="relative mt-3 flex gap-2.5">
        <ol className="flex flex-col" aria-hidden="true">
          {Array.from({ length: total }).map((_, i) => (
            <li key={i} className="grid w-6 place-items-center font-mono text-xs text-muted" style={{ height: ROW }}>
              {i + 1}
            </li>
          ))}
        </ol>
        <div className="relative flex-1" style={{ height: total * ROW }}>
          {competitors.map((c, i) => (
            <div
              key={c.name}
              className="rank-other absolute inset-x-0 top-0 flex items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.025] px-4"
              style={{ height: ROW - 10, transform: `translateY(${i * ROW}px)` }}
            >
              <div className="min-w-0">
                <p className="truncate text-[0.95rem] font-semibold text-text/85">{c.name}</p>
                <p className="mt-1 flex items-center gap-2 text-xs text-muted">
                  <Stars value={c.rating} />
                  <span>
                    {fmt(c.rating, locale)} · {c.reviews} {dict.reviews}
                  </span>
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted">{c.distance}</span>
            </div>
          ))}
          <div
            className="rank-you group/you absolute inset-x-0 top-0 z-10 flex items-center justify-between rounded-2xl border border-violet-2/40 bg-violet/[0.12] px-4 transition-[box-shadow,border-color] duration-700 data-[top=true]:border-violet-2 data-[top=true]:shadow-[0_0_0_1px_rgb(123_92_255/0.6),0_18px_50px_-12px_rgb(70_28_247/0.8)]"
            style={{ height: ROW - 10, transform: `translateY(${competitors.length * ROW}px)` }}
            data-top="false"
          >
            <div className="min-w-0">
              <p className="truncate text-[0.95rem] font-semibold text-text">{you.name}</p>
              <p className="mt-1 flex items-center gap-2 text-xs text-text/70">
                <Stars value={you.fromRating} />
                <span>
                  <span className="rank-you-rating tabular-nums">{fmt(you.fromRating, locale)}</span> ·{" "}
                  <span className="rank-you-reviews tabular-nums">{you.fromReviews}</span> {dict.reviews}
                </span>
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-xs text-text/60">{you.distance}</span>
              <span className="rank-badge inline-flex items-center gap-1 rounded-full bg-ok/15 px-2 py-0.5 text-[0.68rem] font-bold text-ok opacity-0">
                ▲ #1
              </span>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-2 text-right text-[0.65rem] uppercase tracking-[0.2em] text-muted/70">{dict.illustrative}</p>
    </div>
  );
}
