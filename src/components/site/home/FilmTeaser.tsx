"use client";
// 9 · Film teaser — a muted loop of the trailer in a frame that opens from a rounded card to full-bleed as
// you scroll (desktop, sticky), with the title/CTA rising in. Mobile: portrait frame with a vertical cut.
// No audio autoplay; the film with sound (the 41 s trailer) lives on /about. The loop here is the SAME trailer,
// re-encoded silent at 1600x900 (trailer-loop.mp4, ~7.7 MB instead of the 26 MB master with its audio track).
import Link from "next/link";
import { useRef } from "react";
import type { Locale } from "@/i18n/config";
import { gsap, useGSAP, registerGsap, prefersReducedMotion } from "@/lib/motion";
import LoopVideo from "../LoopVideo";
import MagneticButton from "../MagneticButton";
import type { HomeDict } from "../types";

type Props = { locale: Locale; dict: HomeDict["film"]; cursorLabel: string };

export default function FilmTeaser({ locale, dict, cursorLabel }: Props) {
  const ref = useRef<HTMLElement>(null);
  const href = `/${locale}/about`;

  useGSAP(
    () => {
      const root = ref.current;
      if (!root || prefersReducedMotion()) return;
      registerGsap();
      const mm = gsap.matchMedia();
      mm.add("(min-width: 1024px)", () => {
        const frame = root.querySelector<HTMLElement>("[data-film-frame]");
        const media = root.querySelector<HTMLElement>("[data-film-media]");
        const copy = root.querySelectorAll<HTMLElement>("[data-film-copy]");
        if (!frame || !media) return;
        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: { trigger: root, start: "top top", end: "bottom bottom", scrub: 0.8 },
        });
        tl.fromTo(
          frame,
          { clipPath: "inset(16% 20% 16% 20% round 40px)" },
          { clipPath: "inset(0% 0% 0% 0% round 0px)", duration: 0.6 },
          0,
        )
          .fromTo(media, { scale: 1.3 }, { scale: 1, duration: 0.8 }, 0)
          .fromTo(copy, { y: 80, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.06, duration: 0.3, ease: "power2.out" }, 0.38);
      });
      mm.add("(max-width: 1023px)", () => {
        const frame = root.querySelector<HTMLElement>("[data-film-frame]");
        if (!frame) return;
        gsap.fromTo(
          frame,
          { clipPath: "inset(6% 6% 6% 6% round 32px)" },
          {
            clipPath: "inset(0% 0% 0% 0% round 24px)",
            ease: "none",
            scrollTrigger: { trigger: frame, start: "top bottom", end: "top 30%", scrub: 0.6 },
          },
        );
      });
      return () => mm.revert();
    },
    { scope: ref },
  );

  return (
    <section ref={ref} id="film" aria-labelledby="film-title" className="relative bg-ink lg:h-[220vh]">
      <div className="lg:sticky lg:top-0 lg:h-[100svh] lg:overflow-hidden">
        <div className="container-site py-[clamp(4rem,10vw,6rem)] lg:contents">
          <div
            data-film-frame
            className="relative aspect-[4/5] overflow-hidden rounded-[24px] bg-panel md:aspect-[16/10] lg:absolute lg:inset-0 lg:aspect-auto lg:rounded-none"
          >
            <div data-film-media className="absolute inset-0">
              <LoopVideo
                src="/media/trailer-loop.mp4"
                poster="/media/trailer-poster.webp"
                mobileSrc="/media/loop-v_screen.mp4"
                mobilePoster="/media/loop-v_screen.webp"
                threshold={0.15}
              />
            </div>
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-ink/10" />
            <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_50%,transparent,rgb(5_4_7/0.55))]" />
            <Link href={href} tabIndex={-1} aria-hidden="true" data-cursor={cursorLabel} className="absolute inset-0 z-[1]" />

            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] p-6 md:p-10 lg:p-[clamp(2.5rem,6vw,6rem)]">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <p data-film-copy className="eyebrow inline-flex items-center gap-3">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-off" aria-hidden="true" />
                    {dict.eyebrow} · {dict.duration}
                  </p>
                  <h2 id="film-title" data-film-copy className="text-display mt-4 text-[clamp(2.2rem,6vw,6rem)] leading-[0.95]">
                    {dict.title}
                  </h2>
                  <p data-film-copy className="mt-4 max-w-lg text-[1rem] text-text/70 md:text-[1.1rem]">
                    {dict.caption}
                  </p>
                </div>
                <div data-film-copy className="pointer-events-auto shrink-0">
                  <MagneticButton
                    href={href}
                    size="lg"
                    variant="light"
                    iconPosition="start"
                    data-cursor={cursorLabel}
                    icon={
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-violet text-white">
                        <svg viewBox="0 0 16 16" className="ml-0.5 h-3 w-3" aria-hidden="true">
                          <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
                        </svg>
                      </span>
                    }
                  >
                    {dict.cta}
                  </MagneticButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
