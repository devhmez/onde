"use client";
// Product-page TapStory: the pinned, scroll-scrubbed "tap → NFC banner → Google review → ★★★★★" sequence.
// A server-rendered shell (product still, pinned height) holds the place until TapStory's light module arrives right
// after hydration, so the section has its final height and content from the first paint; its WebGL stage (three.js)
// is built off-screen once the page has settled (three/TapStoryLazy.tsx, three/schedule.ts). If rendering fails, a
// cinematic still + silent film loop + the 4 steps.
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, type ComponentProps } from "react";
import type { Locale } from "@/i18n/config";
import TapStory from "@/components/three/TapStoryLazy";
import type { StoryProduct } from "./catalog";
import ErrorBoundary from "./ErrorBoundary";

type Media = { poster: string; video: string; posterV: string; videoV: string };
type Props = {
  product: StoryProduct;
  locale: Locale;
  dict: ComponentProps<typeof TapStory>["dict"];
  media: Media;
  steps: string[];
};

function Poster({ media, steps, withVideo }: { media: Media; steps: string[]; withVideo?: boolean }) {
  const reduce = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = videoRef.current;
    if (!v || reduce) return;
    v.src = window.matchMedia("(max-width: 767px)").matches ? media.videoV : media.video;
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? v.play().catch(() => undefined) : v.pause()), {
      threshold: 0.1,
    });
    io.observe(v);
    return () => io.disconnect();
  }, [media, reduce]);

  return (
    <div className="relative isolate flex min-h-[100svh] items-end overflow-hidden">
      <Image src={media.poster} alt="" fill sizes="100vw" className="-z-20 hidden object-cover md:block" />
      <Image src={media.posterV} alt="" fill sizes="100vw" className="-z-20 object-cover md:hidden" />
      {withVideo && (
        <video ref={videoRef} muted loop playsInline preload="none" aria-hidden="true" className="absolute inset-0 -z-10 size-full object-cover" />
      )}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/55 to-ink/30" />
      <ol className="mx-auto grid w-full max-w-[90rem] gap-3 px-[clamp(1rem,4vw,3rem)] pb-16 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <motion.li
            key={s}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-4 rounded-2xl border border-white/10 bg-ink/60 p-4 backdrop-blur-md"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-violet font-display text-sm font-bold text-white">
              {i + 1}
            </span>
            <span className="text-sm font-medium leading-snug">{s}</span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

export default function TapStorySection({ product, locale, dict, media, steps }: Props) {
  return (
    <div id="tap-story" className="relative">
      <ErrorBoundary fallback={<Poster media={media} steps={steps} withVideo />}>
        <TapStory product={product} locale={locale} dict={dict} />
      </ErrorBoundary>
    </div>
  );
}
