"use client";

import { Suspense, lazy, useRef, useState } from "react";
import { PRODUCTS } from "./config";
import { CanvasBoundary } from "./boundary";
import { useDeviceProfile, useInView, usePageVisible, useReducedMotion } from "./hooks";
import styles from "./three.module.css";

const HeroCanvas = lazy(() => import("./HeroCanvas"));

export type HeroStandProps = {
  className?: string;
  /**
   * Render the built-in still (floating stand + glow) while the model loads and on devices that get no 3D.
   * Off by default because the home hero already paints its own LCP poster underneath.
   */
  poster?: boolean;
  /** Accessible description; without it the stage is decorative (aria-hidden). */
  alt?: string;
};

/**
 * Floating white review stand in a pool of violet light: slow idle orbit + bob, cursor parallax tilt, real
 * clear-acrylic reflections, contact shadow and a subtle bloom on the violet rim (bloom only on capable GPUs).
 * Transparent canvas — it composes over whatever the hero paints behind it.
 */
export default function HeroStand({ className, poster = false, alt }: HeroStandProps) {
  const device = useDeviceProfile();
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, "100px 0px");
  const pageVisible = usePageVisible();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const use3D = !!device && device.webgl && device.tier !== "low" && !failed;
  const showStill = poster && (!use3D || !ready);

  return (
    <div
      ref={ref}
      className={[styles.hero, className].filter(Boolean).join(" ")}
      role={alt ? "img" : undefined}
      aria-label={alt}
      aria-hidden={alt ? undefined : true}
    >
      {showStill ? (
        <>
          <span className={styles.heroGlow} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.heroStill} src={PRODUCTS["stand-white"].still} alt="" decoding="async" />
        </>
      ) : null}
      {use3D && device ? (
        <div className={styles.canvasWrap} data-ready={ready ? "true" : "false"}>
          <CanvasBoundary onError={() => setFailed(true)}>
            <Suspense fallback={null}>
              <HeroCanvas
                tier={device.tier === "high" ? "high" : "mid"}
                anisotropy={device.maxAnisotropy}
                active={inView && pageVisible}
                reduced={reduced}
                onReady={() => setReady(true)}
              />
            </Suspense>
          </CanvasBoundary>
        </div>
      ) : null}
    </div>
  );
}
