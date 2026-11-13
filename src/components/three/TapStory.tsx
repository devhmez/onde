"use client";

import {
  Suspense,
  lazy,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import Image from "next/image";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { FALLBACK_VIDEOS, phoneTextures, PRODUCTS, TAP_PRODUCTS, type TapProduct } from "./config";
import { createScalarFrame, evaluateScalars, smooth } from "./timeline";
import { resolveTapDict, type TapStoryDict, type ThreeLocale } from "./dict";
import { bump, useDeviceProfile, useInView, usePageVisible, useReducedMotion, type Pacer } from "./hooks";
import { applyBanner, applyCaptions, applyToast, type OverlayRefs, type StyleCache } from "./overlay";
import { CanvasBoundary } from "./boundary";
import { useNear, useWarmSoon } from "./schedule";
import styles from "./three.module.css";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger, useGSAP);

const TapCanvas = lazy(() => import("./TapCanvas"));

export type { TapProduct } from "./config";
export { TAP_PRODUCTS } from "./config";

export type TapStoryProps = {
  product: TapProduct;
  locale: ThreeLocale | string;
  /** The whole dictionary from getDictionary(locale) or just its `tapstory` namespace. */
  dict?: unknown;
  className?: string;
  /** Pinned scroll distance in viewport heights (default 3 → ~300vh of scrubbing). */
  distance?: number;
  /** Render the built-in product switcher inside the pinned stage. */
  switcher?: boolean;
  /** Called when the built-in switcher picks another product. */
  onProductChange?: (product: TapProduct) => void;
  /** Extra UI rendered inside the pinned stage (e.g. a site-owned switcher or CTA). */
  children?: ReactNode;
};

type Mode = "3d" | "video" | "static";
const STEP_KEYS = ["tap", "notification", "review"] as const;

/**
 * Signature pinned, scroll-scrubbed sequence (ARCHITECTURE §6.3): the product rises into a pool of light, a phone
 * taps it (NFC rings + shake + flash), an iOS NFC banner drops on the phone, gets tapped, the camera dives into
 * the screen and the Google review page fills 5 stars, types the review, turns Post blue, then "+1 review" + stars.
 * Weak GPUs get the vertical film loops scrubbed by scroll; reduced-motion users get three static beats.
 */
export default function TapStory({
  product,
  locale,
  dict,
  className,
  distance = 3,
  switcher = false,
  onProductChange,
  children,
}: TapStoryProps) {
  const t = useMemo(() => resolveTapDict(dict, locale), [dict, locale]);
  const reduced = useReducedMotion();
  // The WebGL stage (three.js chunk, models, phone screens, shader warm-up) is built off-screen as soon as the page
  // has settled — or earlier if the reader scrolls towards it — so it is ready before the section is reached. Until
  // then (and until its first frame) the product still holds the stage. The GPU probe itself waits for that moment.
  const sectionRef = useRef<HTMLElement>(null);
  const soon = useWarmSoon(sectionRef, !reduced);
  const device = useDeviceProfile(soon);
  const [crashed, setCrashed] = useState(false);

  const [current, setCurrent] = useState<TapProduct>(product);
  const [prevProp, setPrevProp] = useState<TapProduct>(product);
  if (product !== prevProp) {
    setPrevProp(product);
    setCurrent(product);
  }

  const mode: Mode = reduced ? "static" : !device ? "3d" : device.tier === "low" || crashed ? "video" : "3d";

  if (mode === "static") return <StaticStory product={current} t={t} locale={locale} className={className} />;

  return (
    <PinnedStory
      mode={mode}
      tier={device?.tier === "high" ? "high" : "mid"}
      anisotropy={device?.maxAnisotropy ?? 4}
      deviceReady={!!device}
      sectionRef={sectionRef}
      product={current}
      locale={locale}
      t={t}
      className={className}
      distance={distance}
      switcher={switcher}
      onChoose={(p) => {
        setCurrent(p);
        onProductChange?.(p);
      }}
      onCrash={() => setCrashed(true)}
    >
      {children}
    </PinnedStory>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Pinned stage (3D or video)
// ---------------------------------------------------------------------------------------------------------------

function stickyBlocked(el: HTMLElement): boolean {
  const scrolls = (v: string) => v === "hidden" || v === "auto" || v === "scroll" || v === "overlay";
  const html = getComputedStyle(document.documentElement);
  const htmlClips = html.overflowX !== "visible" || html.overflowY !== "visible";
  for (let node = el.parentElement; node && node !== document.documentElement; node = node.parentElement) {
    const cs = getComputedStyle(node);
    const clips = scrolls(cs.overflowX) || scrolls(cs.overflowY);
    if (node === document.body ? clips && htmlClips : clips) return true;
  }
  return false;
}

type PinnedProps = {
  locale: string;
  mode: "3d" | "video";
  tier: "high" | "mid";
  anisotropy: number;
  deviceReady: boolean;
  sectionRef: RefObject<HTMLElement | null>;
  product: TapProduct;
  t: TapStoryDict;
  className?: string;
  distance: number;
  switcher: boolean;
  onChoose: (p: TapProduct) => void;
  onCrash: () => void;
  children?: ReactNode;
};

function PinnedStory({
  mode,
  tier,
  anisotropy,
  deviceReady,
  sectionRef,
  product,
  locale,
  t,
  className,
  distance,
  switcher,
  onChoose,
  onCrash,
  children,
}: PinnedProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const pacer = useMemo<Pacer>(() => ({ busyUntil: 0 }), []);
  const overlays = useRef<OverlayRefs>({
    stage: null,
    screenLayer: null,
    banner: null,
    touch: null,
    toast: null,
    note: null,
    steps: [null, null, null],
  });
  const [pin, setPin] = useState<"sticky" | "gsap">("sticky");
  const [ready, setReady] = useState(false);
  const inView = useInView(sectionRef, "120px 0px");
  const pageVisible = usePageVisible();
  const active = inView && pageVisible;
  // video fallback: the clips only download near the section
  const nearVideo = useNear(sectionRef, "150% 0px", mode === "video");

  useLayoutEffect(() => {
    if (sectionRef.current && stickyBlocked(sectionRef.current)) setPin("gsap");
  }, [sectionRef]);

  useGSAP(
    () => {
      const section = sectionRef.current;
      const stage = stageRef.current;
      if (!section || !stage) return;
      const proxy = { p: 0 };
      gsap.fromTo(
        proxy,
        { p: 0 },
        {
          p: 1,
          ease: "none",
          scrollTrigger: {
            trigger: section,
            start: "top top",
            end: pin === "sticky" ? "bottom bottom" : `+=${distance * 100}%`,
            scrub: 0.65,
            invalidateOnRefresh: true,
            ...(pin === "gsap" ? { pin: stage, pinSpacing: true, anticipatePin: 1 } : {}),
          },
          onUpdate: () => {
            progressRef.current = proxy.p;
            bump(pacer, 900);
          },
        },
      );
      // A new trigger measures itself; only a GSAP pin (spacer) moves the content below and needs a global refresh.
      // In sticky mode the section already has its final height (TapStoryLazy's shell reserves it), and a global
      // refresh re-runs every scroll animation on the page (SplitText re-splits included): ~300 ms on a mid phone.
      if (pin !== "gsap") return;
      const id = requestAnimationFrame(() => ScrollTrigger.refresh());
      return () => cancelAnimationFrame(id);
    },
    { scope: sectionRef, dependencies: [pin, distance], revertOnUpdate: true },
  );

  const still = PRODUCTS[product].still;
  const sectionStyle = { "--distance": distance } as CSSProperties;

  return (
    <section
      ref={sectionRef}
      className={[styles.section, className].filter(Boolean).join(" ")}
      data-pin={pin}
      data-switcher={switcher ? "true" : "false"}
      aria-label={t.aria}
      style={sectionStyle}
    >
      <div
        ref={(el) => {
          stageRef.current = el;
          overlays.current.stage = el;
        }}
        className={styles.stage}
      >
        <div className={styles.stageCanvas} aria-hidden="true">
          {mode === "3d" ? (
            <>
              {/* responsive (a fraction of the 65 KB master; same URL as the TapStoryLazy shell, so a cache
                  hit): on screen until the canvas has drawn its first frame, then cross-faded into it */}
              <Image
                className={styles.stagePoster}
                src={still}
                alt=""
                width={900}
                height={900}
                sizes="(max-width: 767px) 70vw, 54vh"
                loading="eager"
                data-hidden={ready ? "true" : "false"}
              />
              {deviceReady ? (
                <div className={styles.canvasWrap} data-ready={ready ? "true" : "false"}>
                  <CanvasBoundary onError={onCrash}>
                    <Suspense fallback={null}>
                      <TapCanvas
                        product={product}
                        locale={locale}
                        tier={tier}
                        anisotropy={anisotropy}
                        progressRef={progressRef}
                        pacer={pacer}
                        overlays={overlays}
                        active={active}
                        onReady={() => setReady(true)}
                      />
                    </Suspense>
                  </CanvasBoundary>
                </div>
              ) : null}
            </>
          ) : (
            <VideoStage t={t} progressRef={progressRef} overlays={overlays} active={active} load={nearVideo} />
          )}
        </div>

        {mode === "3d" ? (
          <div
            ref={(el) => {
              overlays.current.screenLayer = el;
            }}
            className={styles.screenLayer}
            aria-hidden="true"
          >
            <NfcBanner
              t={t}
              bannerRef={(el) => {
                overlays.current.banner = el;
              }}
              touchRef={(el) => {
                overlays.current.touch = el;
              }}
            />
          </div>
        ) : null}

        <Toast
          t={t}
          toastRef={(el) => {
            overlays.current.toast = el;
          }}
        />

        <div className={styles.captions}>
          <div className={styles.head}>
            <p className={styles.kicker}>{t.intro.kicker}</p>
            <p className={styles.title}>{t.intro.title}</p>
          </div>
          <ol className={styles.steps}>
            {STEP_KEYS.map((k, i) => (
              <li
                key={k}
                ref={(el) => {
                  overlays.current.steps[i] = el;
                }}
                className={styles.step}
                data-active={i === 0 ? "true" : "false"}
              >
                <span className={styles.stepNum}>{t.steps[k].num}</span>
                <h3 className={styles.stepTitle}>{t.steps[k].title}</h3>
                <p className={styles.stepBody}>{t.steps[k].body}</p>
              </li>
            ))}
          </ol>
        </div>

        <p
          ref={(el) => {
            overlays.current.note = el;
          }}
          className={styles.note}
        >
          {t.demoNote}
        </p>

        <div className={styles.scrollHint} aria-hidden="true">
          {t.intro.scroll}
        </div>

        {switcher ? <Switcher t={t} current={product} onChoose={onChoose} /> : null}
        {children}
      </div>
    </section>
  );
}

function Switcher({
  t,
  current,
  onChoose,
}: {
  t: TapStoryDict;
  current: TapProduct;
  onChoose: (p: TapProduct) => void;
}) {
  return (
    <div className={styles.switcher} role="group" aria-label={t.switcher.label}>
      {TAP_PRODUCTS.map((p) => (
        <button
          key={p}
          type="button"
          className={styles.switch}
          aria-pressed={p === current}
          onClick={() => onChoose(p)}
        >
          {t.switcher[p]}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Overlay pieces
// ---------------------------------------------------------------------------------------------------------------

function NfcGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="5.2" cy="12" r="1.7" fill="#fff" />
      <g stroke="#fff" strokeWidth="2.1" strokeLinecap="round">
        <path d="M8.6 8.6a4.8 4.8 0 0 1 0 6.8" />
        <path d="M11.9 5.6a9 9 0 0 1 0 12.8" />
        <path d="M15.2 2.6a13.2 13.2 0 0 1 0 18.8" />
      </g>
    </svg>
  );
}

type ElRef<T extends HTMLElement> = (el: T | null) => void;

function NfcBanner({
  t,
  bannerRef,
  touchRef,
  staticMode = false,
}: {
  t: TapStoryDict;
  bannerRef?: ElRef<HTMLDivElement>;
  touchRef?: ElRef<HTMLSpanElement>;
  staticMode?: boolean;
}) {
  return (
    <div ref={bannerRef} className={styles.banner} style={staticMode ? { visibility: "visible" } : undefined}>
      <span className={styles.bannerIcon}>
        <NfcGlyph />
      </span>
      <span className={styles.bannerText}>
        <span className={styles.bannerHead}>
          <span>{t.notification.app}</span>
          <span className={styles.bannerTime}>{t.notification.time}</span>
        </span>
        <span className={styles.bannerBody}>{t.notification.body}</span>
      </span>
      {staticMode ? null : <span ref={touchRef} className={styles.touch} />}
    </div>
  );
}

function Toast({
  t,
  toastRef,
  className,
  style,
}: {
  t: TapStoryDict;
  toastRef?: ElRef<HTMLDivElement>;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      ref={toastRef}
      className={[styles.toast, className].filter(Boolean).join(" ")}
      style={style}
      aria-hidden="true"
    >
      <span className={styles.toastStars}>{t.toast.stars}</span>
      <span>{t.toast.label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Video fallback (weak GPUs): the vertical film loops, scrubbed by the same scroll progress
// ---------------------------------------------------------------------------------------------------------------

class Scrubber {
  private target = 0;
  private busy = false;
  constructor(private video: HTMLVideoElement) {
    video.addEventListener("seeked", this.onSeeked);
    video.addEventListener("loadeddata", this.onSeeked);
  }
  private onSeeked = () => {
    this.busy = false;
    this.flush();
  };
  set(time: number) {
    this.target = time;
    if (!this.busy) this.flush();
  }
  private flush() {
    const v = this.video;
    if (v.readyState < 1) return;
    const target = Math.min(Math.max(0, this.target), Math.max(0, (v.duration || 0) - 0.04));
    if (Math.abs(v.currentTime - target) < 0.025) return;
    this.busy = true;
    v.currentTime = target;
  }
  dispose() {
    this.video.removeEventListener("seeked", this.onSeeked);
    this.video.removeEventListener("loadeddata", this.onSeeked);
  }
}

function VideoStage({
  t,
  progressRef,
  overlays,
  active,
  load,
}: {
  t: TapStoryDict;
  progressRef: RefObject<number>;
  overlays: RefObject<OverlayRefs>;
  active: boolean;
  /** Attach the clips (they download as soon as they have a src) — only once the section is near. */
  load: boolean;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const tapRef = useRef<HTMLVideoElement>(null);
  const screenRef = useRef<HTMLVideoElement>(null);
  const banner = useRef<HTMLDivElement | null>(null);
  const touch = useRef<HTMLSpanElement | null>(null);

  // iOS only paints seeked frames once a muted video has played at least once.
  useEffect(() => {
    if (!load) return;
    for (const v of [tapRef.current, screenRef.current]) {
      if (!v) continue;
      v.muted = true;
      v.play()
        .then(() => v.pause())
        .catch(() => {
          /* autoplay refused: posters stay visible, captions still tell the story */
        });
    }
  }, [load]);

  useEffect(() => {
    const tapV = tapRef.current;
    const scrV = screenRef.current;
    const frameEl = frameRef.current;
    if (!active || !tapV || !scrV || !frameEl) return;
    const tapS = new Scrubber(tapV);
    const scrS = new Scrubber(scrV);
    const frame = createScalarFrame();
    const cache: StyleCache = new Map();
    // the video frame does not move inside the pinned stage: measure it on resize, never per frame (a rect read
    // after the scroll-driven style writes forced a synchronous layout every frame)
    const geo = { x: 0, y: 0, w: 0, ok: false };
    const measure = () => {
      const stage = overlays.current?.stage;
      if (!stage) return;
      const fr = frameEl.getBoundingClientRect();
      const sr = stage.getBoundingClientRect();
      geo.x = fr.left - sr.left + fr.width / 2;
      geo.y = fr.top - sr.top + fr.height * 0.66;
      geo.w = fr.width;
      geo.ok = true;
    };
    const ro = new ResizeObserver(measure);
    ro.observe(frameEl);
    if (overlays.current?.stage) ro.observe(overlays.current.stage);
    measure();
    let raf = 0;
    const loop = () => {
      const o = overlays.current;
      const p = progressRef.current ?? 0;
      evaluateScalars(p, frame);
      const onScreen = p >= 0.5;
      tapV.style.opacity = onScreen ? "0" : "1";
      scrV.style.opacity = onScreen ? "1" : "0";
      tapS.set(smooth(p, 0.16, 0.42) * FALLBACK_VIDEOS.tap.duration);
      scrS.set(smooth(p, 0.62, 0.912) * FALLBACK_VIDEOS.screen.duration);
      if (o) {
        applyCaptions(o, cache, frame, p);
        applyBanner({ ...o, banner: banner.current, touch: touch.current }, cache, frame);
        if (geo.ok) applyToast(o, cache, frame, geo.x, geo.y, Math.min(1.2, Math.max(0.6, geo.w / 400)));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      tapS.dispose();
      scrS.dispose();
    };
  }, [active, overlays, progressRef]);

  return (
    <div ref={frameRef} className={styles.videoFrame}>
      <video
        ref={tapRef}
        className={styles.video}
        src={load ? FALLBACK_VIDEOS.tap.src : undefined}
        poster={FALLBACK_VIDEOS.tap.poster}
        muted
        playsInline
        preload={load ? "auto" : "none"}
        aria-label={t.fallback.video}
      />
      <video
        ref={screenRef}
        className={styles.video}
        src={load ? FALLBACK_VIDEOS.screen.src : undefined}
        poster={FALLBACK_VIDEOS.screen.poster}
        muted
        playsInline
        preload={load ? "auto" : "none"}
        style={{ opacity: 0 }}
        aria-hidden="true"
      />
      <div className={styles.videoBannerWrap} aria-hidden="true">
        <NfcBanner
          t={t}
          bannerRef={(el) => {
            banner.current = el;
          }}
          touchRef={(el) => {
            touch.current = el;
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Reduced motion: three static beats with gentle fades
// ---------------------------------------------------------------------------------------------------------------

function StaticFigure({ index, children, caption }: { index: number; children: ReactNode; caption: ReactNode }) {
  const ref = useRef<HTMLLIElement>(null);
  const shown = useInView(ref, "0px 0px -10% 0px", true);
  return (
    <li
      ref={ref}
      className={styles.figure}
      data-in={shown ? "true" : "false"}
      style={{ transitionDelay: `${index * 120}ms` }}
    >
      <div className={styles.figureArt} aria-hidden="true">
        {children}
      </div>
      <div className={styles.figCaption}>{caption}</div>
    </li>
  );
}

function StaticStory({
  product,
  t,
  locale,
  className,
}: {
  product: TapProduct;
  t: TapStoryDict;
  locale: string;
  className?: string;
}) {
  const caption = (k: (typeof STEP_KEYS)[number]) => (
    <>
      <span className={styles.stepNum}>{t.steps[k].num}</span>
      <h3 className={styles.stepTitle}>{t.steps[k].title}</h3>
      <p className={styles.stepBody}>{t.steps[k].body}</p>
    </>
  );
  return (
    <section className={[styles.static, className].filter(Boolean).join(" ")} aria-label={t.aria}>
      <div className={styles.staticHead}>
        <p className={styles.kicker}>{t.intro.kicker}</p>
        <p className={styles.title}>{t.intro.title}</p>
      </div>
      <ol className={styles.figures}>
        <StaticFigure index={0} caption={caption("tap")}>
          <span className={styles.rings} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={PRODUCTS[product].still} alt="" decoding="async" loading="lazy" />
        </StaticFigure>
        <StaticFigure index={1} caption={caption("notification")}>
          <div className={styles.phoneFrame}>
            <div className={styles.phoneScreen}>
              <span className={styles.phoneClock}>9:41</span>
              <NfcBanner t={t} staticMode />
            </div>
          </div>
        </StaticFigure>
        <StaticFigure index={2} caption={caption("review")}>
          <div className={styles.phoneFrame}>
            <div className={styles.phoneScreen}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={phoneTextures(locale).b} alt="" decoding="async" loading="lazy" />
            </div>
          </div>
          <Toast t={t} className={styles.staticToast} />
        </StaticFigure>
      </ol>
      <p className={styles.staticNote}>{t.demoNote}</p>
    </section>
  );
}
