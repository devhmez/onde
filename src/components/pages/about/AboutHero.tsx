// About hero: "Le film." title (CSS letter rise, no JS needed for LCP) + the full-bleed cinematic film player.
import type { CSSProperties } from "react";
import { Eyebrow } from "@/components/site/Section";
import FilmPlayer from "../FilmPlayer";
import { LightPool, Ripples } from "../Ambient";
import { CharRise } from "../motion";
import { IconArrowDown } from "../icons";
import type { AboutDict } from "../types";

// The ONDE film = the 41 s fast-cut trailer of the real stand (it replaced the 2:35 presentation film, too long).
// 720p encode for phones / Save-Data / slow networks; poster = the "Meet the ONDE stand" frame (13.8 s).
// Chapter marks live in messages/{fr,en}/about.json (`chapters`, seconds) and must stay within `duration`.
export const FILM = {
  src1080: "/media/trailer-1080.mp4",
  src720: "/media/trailer-720.mp4",
  poster: "/media/trailer-poster.webp",
  duration: 41,
} as const;

export default function AboutHero({ t, chapters, player }: { t: AboutDict["hero"]; chapters: AboutDict["chapters"]; player: AboutDict["player"] }) {
  return (
    // Deliberately no `isolate`/z-index/transform here: the docked mini player (position: fixed) must escape this section.
    <section className="relative overflow-x-clip pb-[clamp(3rem,8vw,6rem)] pt-[clamp(7.5rem,14vw,11rem)]" aria-labelledby="film-title">
      <Ripples count={4} duration={9} size="min(140vmin,1400px)" className="opacity-40 [mask-image:radial-gradient(closest-side,#000,transparent)]" />
      <LightPool className="left-1/2 top-[-20%] h-[80vh] w-[110vw] -translate-x-1/2" opacity={0.3} />
      <div className="container-site relative">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div>
            {/* The eyebrow ("About ONDE") is part of the H1: the heading names the brand, not just "The film." */}
            <h1 id="film-title" className="text-display text-[clamp(3.6rem,12vw,10rem)]">
              <span className="op-fade-up mb-5 flex" style={{ "--d": "120ms" } as CSSProperties}>
                <Eyebrow as="span">{t.eyebrow}</Eyebrow>
                <span className="sr-only"> — </span>
              </span>
              <CharRise text={t.title} delayMs={200} />
            </h1>
          </div>
          <p className="op-fade-up max-w-md text-lg leading-relaxed text-muted md:pb-4 md:text-right md:text-xl" style={{ "--d": "650ms" } as CSSProperties}>
            {t.lead}
          </p>
        </div>

        {/* opacity-only entrance: a transformed ancestor would break the docked (position: fixed) mini player */}
        <div className="op-fade-in mt-10 md:mt-14" style={{ "--d": "850ms" } as CSSProperties}>
          <FilmPlayer src1080={FILM.src1080} src720={FILM.src720} poster={FILM.poster} durationHint={FILM.duration} chapters={chapters} labels={player} frameClassName="max-sm:-mx-[clamp(1rem,4vw,3rem)]" />
        </div>

        <a href="#story" className="group mt-14 inline-flex items-center gap-3 text-sm text-muted transition hover:text-white">
          <span className="relative block h-10 w-px overflow-hidden bg-white/10">
            <span className="scroll-cue-line absolute inset-0 bg-violet-3" />
          </span>
          {t.scroll}
          <IconArrowDown size={16} className="transition-transform duration-500 group-hover:translate-y-1" />
        </a>
      </div>
    </section>
  );
}
