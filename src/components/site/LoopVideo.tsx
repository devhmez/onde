"use client";
// Silent looping video that only downloads/plays while visible (preload none, IntersectionObserver).
// Nothing is fetched while it is far away: the poster and the source are attached ~1.5 viewports ahead (metadata
// only), the clip downloads and plays once it is on screen, and pauses when it leaves.
// Reduced motion or save-data → the poster stays (no autoplay). Optional per-breakpoint sources.
import { useEffect, useRef } from "react";
import clsx from "clsx";
import { prefersSaveData } from "@/lib/motion";
import { useNear } from "@/components/three/schedule";
import { useHydrated, useMediaQuery } from "./hooks";

type LoopVideoProps = {
  src: string;
  poster: string;
  /** used below 768px when provided (e.g. a 9:16 cut) */
  mobileSrc?: string;
  mobilePoster?: string;
  className?: string;
  /** fraction of the element that must be visible to play */
  threshold?: number;
  label?: string;
};

export default function LoopVideo({
  src,
  poster,
  mobileSrc,
  mobilePoster,
  className,
  threshold = 0.2,
  label,
}: LoopVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const hydrated = useHydrated();
  const small = useMediaQuery("(max-width: 767px)");
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)", true);
  const near = useNear(ref, "150% 0px");
  const allowed = hydrated && near && !reduced && !prefersSaveData();
  const source = {
    src: small && mobileSrc ? mobileSrc : src,
    poster: small && mobilePoster ? mobilePoster : poster,
  };
  const activeSrc = allowed ? source.src : undefined;

  useEffect(() => {
    const v = ref.current;
    if (!v || !activeSrc) return;
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e) return;
        if (e.isIntersecting) {
          if (v.preload !== "auto") v.preload = "auto";
          const p = v.play();
          if (p) p.catch(() => undefined);
        } else {
          v.pause();
        }
      },
      { threshold },
    );
    io.observe(v);
    const onVis = () => {
      if (document.hidden) v.pause();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      v.pause();
    };
  }, [activeSrc, threshold]);

  return (
    <video
      ref={ref}
      className={clsx("h-full w-full object-cover", className)}
      src={activeSrc}
      poster={near ? source.poster : undefined}
      muted
      loop
      playsInline
      preload={activeSrc ? "metadata" : "none"}
      disablePictureInPicture
      disableRemotePlayback
      aria-label={label}
      aria-hidden={label ? undefined : true}
      tabIndex={-1}
    />
  );
}
