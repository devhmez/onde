"use client";
// 5 · How it works — Tap / Review / Grow. Desktop: sticky left rail (rolling step number, titles with
// scroll-driven progress bars, crossfading copy) + right column of media panels (looping videos, review UI,
// Google-Maps rank climb). Mobile: stacked steps with a sticky 3-segment progress bar.
import { memo, useRef, useState } from "react";
import clsx from "clsx";
import type { Locale } from "@/i18n/config";
import { gsap, ScrollTrigger, useGSAP, registerGsap, prefersReducedMotion } from "@/lib/motion";
import { Eyebrow } from "../Section";
import Reveal from "../Reveal";
import LoopVideo from "../LoopVideo";
import RankClimb from "./RankClimb";
import type { HomeDict } from "../types";

type Props = { locale: Locale; dict: HomeDict["how"] };

// 4:5 (1080x1350) loops rendered for these panels (onde/blender/onde_scene.py --shot w_tap / w_review), localized
// phone screens; the panel is 4:5 at every breakpoint, so one source fits without cropping.
const panelMedia = (l: Locale) => [
  { src: `/media/loop-w_tap-${l}.mp4`, poster: `/media/loop-w_tap-${l}.webp` },
  { src: `/media/loop-w_review-${l}.mp4`, poster: `/media/loop-w_review-${l}.webp` },
];

const ReviewOverlay = memo(function ReviewOverlay({ label, rating }: { label: string; rating: string }) {
  return (
    <div className="review-overlay absolute bottom-4 left-4 right-4 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-ink/70 p-4 backdrop-blur-xl sm:right-auto sm:min-w-[300px] md:bottom-6 md:left-6">
      <div>
        <p className="text-[0.68rem] uppercase tracking-[0.2em] text-muted">{rating}</p>
        <div className="mt-1.5 flex gap-1" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <svg key={i} viewBox="0 0 20 20" className="review-star h-6 w-6 text-gold">
              <path d="M10 1.5l2.6 5.5 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L1.4 7.7l6-.7z" fill="currentColor" />
            </svg>
          ))}
        </div>
      </div>
      <span className="review-posted inline-flex items-center gap-1.5 rounded-full bg-google px-3 py-1.5 text-xs font-semibold text-white">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {label}
      </span>
    </div>
  );
});

export default function HowItWorks({ locale, dict }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const steps = dict.steps;

  useGSAP(
    () => {
      const root = ref.current;
      if (!root) return;
      registerGsap();
      const reduced = prefersReducedMotion();
      const panels = gsap.utils.toArray<HTMLElement>("[data-step-panel]", root);
      const bars = gsap.utils.toArray<HTMLElement>("[data-step-bar]", root);
      const mobileBars = gsap.utils.toArray<HTMLElement>("[data-step-mbar]", root);

      panels.forEach((panel, i) => {
        ScrollTrigger.create({
          trigger: panel,
          start: "top 60%",
          end: "bottom 40%",
          onToggle: (self) => {
            if (self.isActive) setActive(i);
          },
          onUpdate: (self) => {
            const p = self.progress;
            if (bars[i]) bars[i].style.transform = `scaleX(${p})`;
            if (mobileBars[i]) mobileBars[i].style.transform = `scaleX(${p})`;
          },
          onLeave: () => {
            if (bars[i]) bars[i].style.transform = "scaleX(1)";
            if (mobileBars[i]) mobileBars[i].style.transform = "scaleX(1)";
          },
          onLeaveBack: () => {
            if (bars[i]) bars[i].style.transform = "scaleX(0)";
            if (mobileBars[i]) mobileBars[i].style.transform = "scaleX(0)";
          },
        });

        if (reduced) return;
        // media panels: subtle scale/clip-in as they arrive
        const media = panel.querySelector<HTMLElement>("[data-step-media]");
        if (media) {
          gsap.fromTo(
            media,
            { clipPath: "inset(8% 6% 8% 6% round 32px)", scale: 1.08 },
            {
              clipPath: "inset(0% 0% 0% 0% round 28px)",
              scale: 1,
              ease: "none",
              scrollTrigger: { trigger: panel, start: "top bottom", end: "top 35%", scrub: 0.8 },
            },
          );
        }
      });

      if (!reduced) {
        // Review stars fill one by one each time panel 2 becomes active
        const reviewPanel = panels[1];
        if (reviewPanel) {
          const stars = reviewPanel.querySelectorAll(".review-star");
          const posted = reviewPanel.querySelector(".review-posted");
          const tl = gsap.timeline({ paused: true });
          tl.fromTo(stars, { scale: 0.4, opacity: 0.15 }, { scale: 1, opacity: 1, duration: 0.45, stagger: 0.16, ease: "back.out(3)" })
            .fromTo(posted, { opacity: 0, y: 8, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(2)" }, "+=0.15");
          ScrollTrigger.create({
            trigger: reviewPanel,
            start: "top 65%",
            onEnter: () => tl.restart(),
            onEnterBack: () => tl.restart(),
            onLeaveBack: () => tl.pause(0),
          });
        }
      }
    },
    { scope: ref },
  );

  const stepMedia = (i: number) => {
    if (i === 2) {
      return (
        <div className="relative grid h-full w-full place-items-center overflow-hidden bg-[#08070c] bg-[radial-gradient(80%_70%_at_50%_30%,rgb(70_28_247/0.35),transparent_70%)] p-4 md:p-10">
          <RankClimb locale={locale} dict={dict.rank} />
        </div>
      );
    }
    const m = panelMedia(locale)[i];
    if (!m) return null;
    return (
      <div className="relative h-full w-full">
        <LoopVideo src={m.src} poster={m.poster} label={steps[i]?.alt} />
        <div
          aria-hidden="true"
          className={
            i === 1
              ? "pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/60 via-transparent via-25% to-transparent"
              : "pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent"
          }
        />
        {i === 1 && <ReviewOverlay label={dict.review.posted} rating={dict.review.rating} />}
      </div>
    );
  };

  return (
    <section ref={ref} id="how" aria-labelledby="how-title" className="relative bg-ink py-[clamp(5rem,12vw,10rem)]">
      <div className="container-site">
        <div className="max-w-3xl">
          <Eyebrow>{dict.eyebrow}</Eyebrow>
          <Reveal as="h2" type="lines" id="how-title" className="text-display mt-6 text-[clamp(2.3rem,6vw,5.4rem)] leading-[0.96]">
            {dict.title}
          </Reveal>
        </div>

        {/* Mobile sticky progress */}
        <div className="sticky top-[72px] z-20 -mx-4 mt-10 px-4 lg:hidden">
          <div className="glass flex items-center gap-3 rounded-full border border-white/[0.08] px-4 py-2.5">
            <span className="font-mono text-xs text-violet-3">{steps[active]?.n}</span>
            <span className="min-w-[6.5rem] text-sm font-semibold">{steps[active]?.title}</span>
            <div className="flex flex-1 gap-1.5" aria-hidden="true">
              {steps.map((s) => (
                <span key={s.n} className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                  <span data-step-mbar className="absolute inset-0 origin-left rounded-full bg-violet-2" style={{ transform: "scaleX(0)" }} />
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-12 lg:mt-20 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20">
          {/* Desktop sticky rail (visual duplicate of the panel headings → hidden from assistive tech) */}
          <div className="hidden lg:block" aria-hidden="true">
            <div className="sticky top-0 flex h-[100svh] flex-col justify-center">
              <div className="relative h-[clamp(7rem,12vw,11rem)] overflow-hidden" aria-hidden="true">
                <div
                  className="transition-transform duration-[900ms] ease-expo"
                  style={{ transform: `translateY(-${active * 100}%)` }}
                >
                  {steps.map((s) => (
                    <p
                      key={s.n}
                      className="h-[clamp(7rem,12vw,11rem)] font-display text-[clamp(7rem,12vw,11rem)] font-light leading-none tracking-[-0.05em] text-violet-3/90"
                    >
                      {s.n}
                    </p>
                  ))}
                </div>
              </div>
              <ol className="mt-10 space-y-5">
                {steps.map((s, i) => (
                  <li key={s.n}>
                    <p
                      className={clsx(
                        "text-display text-[clamp(2rem,3.4vw,3.2rem)] transition-all duration-700 ease-expo",
                        i === active ? "translate-x-0 text-text" : "-translate-x-1 text-text/25",
                      )}
                    >
                      {s.title}
                    </p>
                    <span className="mt-3 block h-px w-full max-w-sm overflow-hidden bg-white/10">
                      <span data-step-bar className="block h-full origin-left bg-gradient-to-r from-violet to-violet-3" style={{ transform: "scaleX(0)" }} />
                    </span>
                  </li>
                ))}
              </ol>
              <div className="relative mt-10 min-h-[7.5rem] max-w-md">
                {steps.map((s, i) => (
                  <p
                    key={s.n}
                    className={clsx(
                      "absolute inset-0 text-[1.08rem] leading-relaxed text-muted transition-all duration-700 ease-expo",
                      i === active ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
                    )}
                  >
                    {s.body}
                  </p>
                ))}
              </div>
            </div>
          </div>

          {/* Panels */}
          <ol className="flex flex-col gap-16 lg:gap-[22vh] lg:py-[18vh]">
            {steps.map((s, i) => (
              <li key={s.n} data-step-panel className="relative">
                <div className="mb-6 lg:sr-only">
                  <p className="font-mono text-xs text-violet-3">{s.n}</p>
                  <h3 className="text-display mt-2 text-[clamp(2.2rem,9vw,3.2rem)]">{s.title}</h3>
                  <p className="mt-3 text-[1rem] leading-relaxed text-muted">{s.body}</p>
                </div>
                <div
                  data-step-media
                  className="relative mx-auto aspect-[4/5] w-full max-w-[calc(86svh*0.8)] overflow-hidden rounded-[28px] border border-white/[0.06] bg-panel"
                >
                  {stepMedia(i)}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
