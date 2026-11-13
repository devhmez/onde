"use client";
// Film-look backdrop: silent loop from the ONDE film (16:9 desktop / 9:16 mobile) under a violet grade, NFC ripple
// rings and drifting warm bokeh. Poster only for reduced motion / Save-Data; the video pauses when off-screen.
// The poster is the page's LCP image: one art-directed <picture> (mobile / desktop still), loaded eagerly at high
// priority, so only the still that matches the viewport is downloaded and it does not wait behind the JS bundle.
import { motion, useReducedMotion } from "motion/react";
import { getImageProps } from "next/image";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

type Props = {
  video: string;
  poster: string;
  videoMobile?: string;
  posterMobile?: string;
  className?: string;
  /** NFC ripple origin, in % of the backdrop. */
  ringsAt?: { x: number; y: number };
  dim?: number;
};

const BOKEH = [
  { x: 8, y: 18, s: 120, d: 0 },
  { x: 22, y: 70, s: 70, d: 1.2 },
  { x: 46, y: 12, s: 54, d: 2.1 },
  { x: 64, y: 78, s: 140, d: 0.6 },
  { x: 82, y: 24, s: 90, d: 1.7 },
  { x: 92, y: 62, s: 60, d: 2.6 },
  { x: 36, y: 44, s: 40, d: 3.2 },
];

type NetworkInfo = { saveData?: boolean };

export default function CinematicBackdrop({
  video,
  poster,
  videoMobile,
  posterMobile,
  className,
  ringsAt = { x: 72, y: 46 },
  dim = 0.62,
}: Props) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    const conn = (navigator as Navigator & { connection?: NetworkInfo }).connection;
    if (conn?.saveData) return;
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    const src = mobile && videoMobile ? videoMobile : video;
    if (el.getAttribute("src") !== src) el.setAttribute("src", src);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.play().then(
            () => setPlaying(true),
            () => {
              /* autoplay refused: the poster stays */
            },
          );
        } else el.pause();
      },
      { threshold: 0.05 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      el.pause();
    };
  }, [reduce, video, videoMobile]);

  const still = { alt: "", fill: true, sizes: "100vw", loading: "eager", fetchPriority: "high" } as const;
  const { props: desktopStill } = getImageProps({ ...still, src: poster });
  const mobileSrcSet = posterMobile ? getImageProps({ ...still, src: posterMobile }).props.srcSet : undefined;

  return (
    <div aria-hidden="true" className={clsx("pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-ink", className)}>
      <picture>
        {mobileSrcSet && <source media="(max-width: 767px)" srcSet={mobileSrcSet} sizes="100vw" />}
        {/* next/image props via getImageProps (art direction): optimized srcset, fill styles, eager + high priority */}
        <img {...desktopStill} alt="" className="object-cover" />
      </picture>
      {/* 1px inset: the loop's first frame is the same scene as the poster, so when it fades in seconds later it must
          not be re-reported as a new, larger Largest Contentful Paint (equal boxes can differ by a sub-pixel). */}
      <video
        ref={ref}
        muted
        loop
        playsInline
        preload="none"
        className={clsx(
          "absolute left-px top-px h-[calc(100%-2px)] w-[calc(100%-2px)] object-cover transition-opacity duration-[1.6s]",
          playing ? "opacity-100" : "opacity-0",
        )}
      />
      {/* grade */}
      <div className="absolute inset-0 bg-ink" style={{ opacity: dim }} />
      <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_70%_40%,rgba(70,28,247,0.38),transparent_70%)] mix-blend-screen" />
      <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/60 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-ink via-ink/70 to-transparent" />

      {/* NFC ripple rings */}
      <div className="absolute size-0" style={{ left: `${ringsAt.x}%`, top: `${ringsAt.y}%` }}>
        {[0, 1, 2, 3].map((i) => (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 size-[46vmin] -translate-x-1/2 -translate-y-1/2 rounded-full border border-violet-2/50"
            style={{ boxShadow: "0 0 40px rgba(123,92,255,0.25), inset 0 0 40px rgba(123,92,255,0.15)" }}
            initial={{ scale: 0.3, opacity: 0 }}
            animate={reduce ? { scale: 0.45 + i * 0.25, opacity: 0.25 } : { scale: [0.3, 0.62, 1.7], opacity: [0, 0.75, 0] }}
            transition={
              reduce ? { duration: 0 } : { duration: 5.2, repeat: Infinity, delay: i * 1.3, ease: [0.16, 1, 0.3, 1], times: [0, 0.2, 1] }
            }
          />
        ))}
        <span className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-3 shadow-[0_0_30px_10px_rgba(123,92,255,0.65)]" />
      </div>

      {/* warm bokeh */}
      {BOKEH.map((b, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${b.x}%`,
            top: `${b.y}%`,
            width: b.s,
            height: b.s,
            background: "radial-gradient(circle, rgba(245,165,36,0.22), rgba(245,165,36,0.06) 60%, transparent 70%)",
            filter: "blur(2px)",
          }}
          animate={reduce ? undefined : { y: [0, -26, 0], x: [0, 10, 0], opacity: [0.5, 0.95, 0.5] }}
          transition={{ duration: 9 + i * 1.3, repeat: Infinity, delay: b.d, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}
