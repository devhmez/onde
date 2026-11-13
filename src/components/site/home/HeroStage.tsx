"use client";
// Hero product stage: an LCP-safe poster (floating stand still) that cross-fades into the 3D <HeroStand/>
// once its first frame is on screen (data-ready). The 3D chunk (three.js) is requested only once the page has settled
// — intro finished, load event, the reader not scrolling (and not in the moment right after the intro, when scrolling
// starts), idle time — so neither its evaluation nor the canvas build lands on the LCP or on a scroll. Never on
// low-power / save-data devices. Its shaders are linked in the background before it draws (three/warmup.ts).
import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { isLowPowerDevice } from "@/lib/motion";
import { afterPageSettled } from "@/components/three/schedule";

const HeroStand = dynamic(() => import("@/components/three/HeroStand"), { ssr: false });

type Props = { alt: string; poster: string };

export default function HeroStage({ alt, poster }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [use3D, setUse3D] = useState(false);
  const [posterGone, setPosterGone] = useState(false);

  useEffect(() => {
    if (isLowPowerDevice()) return;
    return afterPageSettled(() => setUse3D(true), 1200);
  }, []);

  // Fade the poster only once the 3D stage reports its model is on screen (HeroStand sets data-ready="true").
  useEffect(() => {
    const el = wrapRef.current;
    if (!use3D || !el) return;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (el.querySelector('[data-ready="true"]')) {
        mo.disconnect();
        setPosterGone(true);
        return;
      }
      // Safety net if the stage ever stops exposing data-ready: a live canvas for 8 s means the model is up.
      if (!fallback && el.querySelector("canvas")) {
        fallback = setTimeout(() => {
          if (!el.querySelector("[data-ready]") && el.querySelector("canvas")) setPosterGone(true);
        }, 8000);
      }
    };
    const mo = new MutationObserver(check);
    mo.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-ready"] });
    check();
    return () => {
      mo.disconnect();
      if (fallback) clearTimeout(fallback);
    };
  }, [use3D]);

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      {/* pool of light under the product */}
      <div
        aria-hidden="true"
        className="absolute bottom-[6%] left-1/2 h-[16%] w-[70%] -translate-x-1/2 rounded-[50%] blur-2xl"
        style={{ background: "radial-gradient(closest-side, rgb(123 92 255 / 0.55), rgb(70 28 247 / 0.18) 60%, transparent)" }}
      />
      <div
        className={clsx(
          "absolute inset-0 transition-opacity duration-[1200ms] ease-out",
          posterGone ? "opacity-0" : "opacity-100",
        )}
      >
        <div className="animate-float absolute inset-[4%]">
          <Image
            src={poster}
            alt={alt}
            fill
            loading="eager"
            fetchPriority="high"
            sizes="(min-width: 768px) 42vw, 86vw"
            className="object-contain drop-shadow-[0_40px_70px_rgb(70_28_247/0.35)]"
          />
        </div>
      </div>
      {use3D && (
        <div className="absolute inset-0">
          <HeroStand className="h-full w-full" />
        </div>
      )}
    </div>
  );
}
