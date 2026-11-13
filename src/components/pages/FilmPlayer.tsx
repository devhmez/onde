"use client";
// ONDE — cinematic film player.
// Poster + big play (audio on click), custom controls (segmented scrubber with chapter gaps, hover preview,
// time, volume, fullscreen), keyboard shortcuts, chapter list, YouTube-style ambient light sampled from
// the current frame, auto-hiding UI, a docked mini-player when you scroll away while it plays, Media Session.
// Picks the 720p source (src720) on small screens / Save-Data / slow networks. Pauses all sampling off-screen.
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import clsx from "clsx";
import enAbout from "../../../messages/en/about.json";
import { clamp, fmtTime } from "./lib";
import { scrollToTarget } from "@/lib/motion";
import { useFinePointer, useReducedMotionPref } from "./motion";
import type { FilmChapter, FilmPlayerLabels } from "./types";
import { IconArrowUpLeft, IconClose, IconExpand, IconMuted, IconPause, IconPlay, IconReplay, IconShrink, IconVolume } from "./icons";

export type { FilmChapter, FilmPlayerLabels } from "./types";

type Props = {
  src1080: string;
  src720: string;
  poster: string;
  /** Localized chapter markers (seconds). Defaults to the English chapters of the ONDE film. */
  chapters?: FilmChapter[];
  /** Localized UI strings (dict.about.player). Defaults to English. */
  labels?: FilmPlayerLabels;
  /** Used to place chapter ticks before metadata loads. */
  durationHint?: number;
  className?: string;
  /** Extra classes for the 16:9 stage (e.g. negative margins for a full-bleed phone layout). */
  frameClassName?: string;
};

type WebkitVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };
type NetInfo = { saveData?: boolean; effectiveType?: string };

const AMBIENT_W = 32;
const AMBIENT_H = 18;
const DEFAULT_GLOW = "70 28 247";

function preferLowRes(): boolean {
  if (typeof window === "undefined") return false;
  const c = (navigator as Navigator & { connection?: NetInfo }).connection;
  const slow = !!c && (c.saveData === true || ["slow-2g", "2g", "3g"].includes(c.effectiveType ?? ""));
  return slow || window.matchMedia("(max-width: 767px)").matches;
}

export default function FilmPlayer({ src1080, src720, poster, chapters = enAbout.chapters, labels = enAbout.player, durationHint, className, frameClassName }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const placeholderRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ambientRef = useRef<HTMLCanvasElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const miniFillRef = useRef<HTMLDivElement>(null);
  const chapterListRef = useRef<HTMLOListElement>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const scrubWasPlaying = useRef(false);
  const initialSeek = useRef<number | null>(null);
  const lastChapter = useRef(-1);

  const reduce = useReducedMotionPref();
  const finePointer = useFinePointer();
  const hintId = useId();

  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(durationHint ?? 0);
  const [buffered, setBuffered] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const [inView, setInView] = useState(true);
  const [dockArmed, setDockArmed] = useState(false);
  const [miniDismissed, setMiniDismissed] = useState(false);
  const [hover, setHover] = useState<{ x: number; t: number; w: number } | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [toast, setToast] = useState<{ key: number; idx: number } | null>(null);

  const dur = duration || durationHint || 0;
  const docked = dockArmed && started && !ended && !inView && !fullscreen && !miniDismissed;
  const showUi = uiVisible || !playing || scrubbing;

  const chapterAt = useCallback(
    (t: number) => {
      let idx = 0;
      for (let i = 0; i < chapters.length; i++) if (t + 0.05 >= chapters[i].t) idx = i;
      return idx;
    },
    [chapters],
  );
  const activeChapter = chapterAt(time);

  /* ---------------------------------------------------------------- source (once, imperatively: no reload on resize) */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || v.getAttribute("src")) return;
    v.src = preferLowRes() ? src720 : src1080;
    v.preload = "metadata";
    // Deep links to a moment of the film: /about#t=57 (used by the VideoObject clip markup).
    const m = /(?:^#|&)t=(\d+(?:\.\d+)?)/.exec(window.location.hash);
    if (m) initialSeek.current = Number(m[1]);
  }, [src720, src1080]);

  /* ---------------------------------------------------------------- painting (no React re-render per frame) */
  const paint = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const d = v.duration || dur;
    const p = d ? clamp(v.currentTime / d, 0, 1) : 0;
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${p})`;
    if (thumbRef.current) thumbRef.current.style.left = `${p * 100}%`;
    if (miniFillRef.current) miniFillRef.current.style.transform = `scaleX(${p})`;
  }, [dur]);

  const sampleGlow = useCallback(() => {
    const canvas = ambientRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    try {
      const { data } = ctx.getImageData(0, 0, AMBIENT_W, AMBIENT_H);
      let r = 0;
      let g = 0;
      let b = 0;
      const n = data.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
      }
      r /= n;
      g /= n;
      b /= n;
      // Lift dark frames so the glow stays visible, keep the hue.
      const m = Math.max(r, g, b, 1);
      const k = m < 140 ? 140 / m : 1;
      root.style.setProperty("--film-glow", `${Math.round(Math.min(255, r * k))} ${Math.round(Math.min(255, g * k))} ${Math.round(Math.min(255, b * k))}`);
    } catch {
      root.style.setProperty("--film-glow", DEFAULT_GLOW);
    }
  }, []);

  const drawAmbient = useCallback((source: CanvasImageSource, alpha: number) => {
    const ctx = ambientRef.current?.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.globalAlpha = alpha; // temporal smoothing: each frame blends over the previous ones
    ctx.drawImage(source, 0, 0, AMBIENT_W, AMBIENT_H);
    ctx.globalAlpha = 1;
  }, []);

  // Seed the ambient light with the poster.
  useEffect(() => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      drawAmbient(img, 1);
      sampleGlow();
    };
    img.src = poster;
    return () => {
      img.onload = null;
    };
  }, [poster, drawAmbient, sampleGlow]);

  // Frame loop: progress bar + ambient light while playing (ambient only when the big player is on screen).
  useEffect(() => {
    paint();
    if (!playing && !scrubbing) return;
    let raf = 0;
    let lastAmb = 0;
    let lastAvg = 0;
    const ambientEvery = finePointer ? 110 : 240;
    const loop = (now: number) => {
      paint();
      const v = videoRef.current;
      if (v && inView && !docked && v.readyState >= 2) {
        if (now - lastAmb > ambientEvery) {
          drawAmbient(v, reduce ? 1 : 0.22);
          lastAmb = now;
        }
        if (now - lastAvg > 650) {
          sampleGlow();
          lastAvg = now;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, scrubbing, inView, docked, finePointer, reduce, paint, drawAmbient, sampleGlow]);

  /* ---------------------------------------------------------------- visibility → mini player */
  useEffect(() => {
    const el = placeholderRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting && entry.intersectionRatio >= 0.25;
        setInView(visible);
        if (visible) {
          setDockArmed(false);
          setMiniDismissed(false);
        } else {
          const v = videoRef.current;
          setDockArmed(!!v && !v.paused && !v.ended);
        }
      },
      { threshold: [0, 0.25, 0.5] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* ---------------------------------------------------------------- fullscreen + media session */
  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement && document.fullscreenElement === frameRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const v = () => videoRef.current;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => void v()?.play()],
      ["pause", () => v()?.pause()],
      ["seekbackward", (d) => { const el = v(); if (el) el.currentTime = Math.max(0, el.currentTime - (d.seekOffset ?? 10)); }],
      ["seekforward", (d) => { const el = v(); if (el) el.currentTime = Math.min(el.duration || 0, el.currentTime + (d.seekOffset ?? 10)); }],
      ["seekto", (d) => { const el = v(); if (el && typeof d.seekTime === "number") el.currentTime = d.seekTime; }],
    ];
    for (const [action, handler] of handlers) {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        /* action unsupported by this browser */
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          ms.setActionHandler(action, null);
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  // Keep the active chapter chip centered in the horizontal list (mobile) without scrolling the page.
  useEffect(() => {
    const list = chapterListRef.current;
    if (!list || list.scrollWidth <= list.clientWidth + 2) return;
    const item = list.children[activeChapter] as HTMLElement | undefined;
    if (!item) return;
    list.scrollTo({ left: item.offsetLeft - list.clientWidth / 2 + item.clientWidth / 2, behavior: reduce ? "auto" : "smooth" });
  }, [activeChapter, reduce]);

  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  /* ---------------------------------------------------------------- actions */
  const poke = useCallback(() => {
    setUiVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      const v = videoRef.current;
      if (v && !v.paused) setUiVisible(false);
    }, 2600);
  }, []);

  const play = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    if (!v.getAttribute("src")) v.src = preferLowRes() ? src720 : src1080;
    if (v.ended) v.currentTime = 0;
    setStarted(true);
    setError(false);
    try {
      await v.play();
    } catch (err) {
      // Audible playback refused by the browser policy: fall back to muted rather than doing nothing.
      // (AbortError = interrupted by a pause/seek — not a reason to mute.)
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        try {
          v.muted = true;
          await v.play();
        } catch {
          /* still blocked: the play button stays visible */
        }
      }
    }
    poke();
  }, [src720, src1080, poke]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || v.ended) void play();
    else v.pause();
  }, [play]);

  const seekTo = useCallback(
    (t: number, andPlay = false) => {
      const v = videoRef.current;
      if (!v) return;
      const d = v.duration || dur;
      v.currentTime = clamp(t, 0, d ? d - 0.05 : t);
      setTime(v.currentTime);
      paint();
      if (andPlay && v.paused) void play();
      poke();
    },
    [dur, paint, play, poke],
  );

  const seekBy = useCallback((delta: number) => {
    const v = videoRef.current;
    if (v) seekTo(v.currentTime + delta);
  }, [seekTo]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted && v.volume === 0) v.volume = 0.6;
    poke();
  }, [poke]);

  const toggleFullscreen = useCallback(async () => {
    const el = frameRef.current;
    const v = videoRef.current as WebkitVideo | null;
    if (!el || !v) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (typeof el.requestFullscreen === "function") await el.requestFullscreen();
      else if (typeof v.webkitEnterFullscreen === "function") v.webkitEnterFullscreen(); // iPhone Safari
    } catch {
      /* user agent refused */
    }
    poke();
  }, [poke]);

  const closeMini = useCallback(() => {
    videoRef.current?.pause();
    setMiniDismissed(true);
  }, []);

  const backToPlayer = useCallback(() => {
    const el = placeholderRef.current;
    if (!el) return;
    // Lenis-aware smooth scroll (falls back to native) — centers the stage in the viewport.
    scrollToTarget(el, { offset: -Math.max(0, (window.innerHeight - el.offsetHeight) / 2), immediate: reduce });
  }, [reduce]);

  /* ---------------------------------------------------------------- scrubber */
  const timeFromClientX = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || !dur) return { t: 0, x: 0, w: 0 };
    const p = clamp((clientX - r.left) / r.width, 0, 1);
    return { t: p * dur, x: p * r.width, w: r.width };
  };

  const onScrubDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const v = videoRef.current;
    scrubWasPlaying.current = !!v && !v.paused;
    setScrubbing(true);
    if (!started) setStarted(true);
    seekTo(timeFromClientX(e.clientX).t);
  };
  const onScrubMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const { t, x, w } = timeFromClientX(e.clientX);
    if (scrubbing) {
      const v = videoRef.current as (HTMLVideoElement & { fastSeek?: (t: number) => void }) | null;
      if (v && typeof v.fastSeek === "function") v.fastSeek(t);
      else if (v) v.currentTime = t;
      setTime(t);
      paint();
    }
    if (e.pointerType === "mouse" && w) setHover({ x, t, w });
  };
  const onScrubUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!scrubbing) return;
    setScrubbing(false);
    seekTo(timeFromClientX(e.clientX).t);
    if (scrubWasPlaying.current) void play();
  };
  const onScrubKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const step = e.shiftKey ? 10 : 5;
    let handled = true;
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowDown":
        seekBy(-step);
        break;
      case "ArrowRight":
      case "ArrowUp":
        seekBy(step);
        break;
      case "PageDown":
        seekBy(-dur / 10);
        break;
      case "PageUp":
        seekBy(dur / 10);
        break;
      case "Home":
        seekTo(0);
        break;
      case "End":
        seekTo(dur);
        break;
      default:
        handled = false;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  /* ---------------------------------------------------------------- global (player-scoped) shortcuts */
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target as HTMLElement;
    const onControl = target !== e.currentTarget && !!target.closest("button, input, a, [role='slider']");
    switch (e.key) {
      case " ":
      case "k":
      case "K":
        if (onControl && e.key === " ") return;
        e.preventDefault();
        togglePlay();
        break;
      case "ArrowLeft":
      case "j":
      case "J":
        if (onControl && e.key === "ArrowLeft") return;
        e.preventDefault();
        seekBy(e.key === "ArrowLeft" ? -5 : -10);
        break;
      case "ArrowRight":
      case "l":
      case "L":
        if (onControl && e.key === "ArrowRight") return;
        e.preventDefault();
        seekBy(e.key === "ArrowRight" ? 5 : 10);
        break;
      case "m":
      case "M":
        toggleMute();
        break;
      case "f":
      case "F":
        void toggleFullscreen();
        break;
      default:
        if (/^[0-9]$/.test(e.key) && !onControl && dur) {
          seekTo((dur * Number(e.key)) / 10);
        }
    }
    poke();
  };

  /* ---------------------------------------------------------------- video events */
  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setTime(v.currentTime);
    if (!playing) paint();
    const idx = chapterAt(v.currentTime);
    if (idx !== lastChapter.current) {
      const first = lastChapter.current === -1;
      lastChapter.current = idx;
      if (!first && !v.paused) setToast({ key: Date.now(), idx });
    }
  };
  const onProgress = () => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const b = v.buffered;
    let end = 0;
    for (let i = 0; i < b.length; i++) if (b.start(i) <= v.currentTime + 0.5) end = Math.max(end, b.end(i));
    setBuffered(end / v.duration);
  };
  const onPlay = () => {
    setPlaying(true);
    setEnded(false);
    setStarted(true);
    if ("mediaSession" in navigator && typeof MediaMetadata !== "undefined") {
      navigator.mediaSession.metadata = new MediaMetadata({ title: labels.title, artist: "ONDE", artwork: [{ src: poster, sizes: "1600x900", type: "image/webp" }] });
    }
    poke();
  };
  const onPause = () => {
    setPlaying(false);
    setUiVisible(true);
  };
  const onVolume = () => {
    const v = videoRef.current;
    if (!v) return;
    setMuted(v.muted);
    setVolume(v.volume);
  };

  /* ---------------------------------------------------------------- derived UI */
  const maskImage = useMemo(() => {
    if (!dur || chapters.length < 2) return undefined;
    const stops: string[] = [];
    for (const c of chapters.slice(1)) {
      const p = (c.t / dur) * 100;
      stops.push(`#000 calc(${p}% - 2px)`, `transparent calc(${p}% - 2px)`, `transparent calc(${p}% + 1px)`, `#000 calc(${p}% + 1px)`);
    }
    return `linear-gradient(to right, #000 0%, ${stops.join(", ")}, #000 100%)`;
  }, [chapters, dur]);

  const chapterProgress = (i: number) => {
    const start = chapters[i].t;
    const end = chapters[i + 1]?.t ?? dur;
    if (!end || end <= start) return 0;
    return clamp((time - start) / (end - start), 0, 1);
  };

  const hoverChapter = hover ? chapters[chapterAt(hover.t)] : null;
  const volumeFill = `${(muted ? 0 : volume) * 100}%`;
  const totalLabel = dur ? fmtTime(dur) : "";

  return (
    // No stacking context on the root while docked, so the fixed mini player can float above later sections.
    <div ref={rootRef} className={clsx("relative [--film-glow:70_28_247]", !docked && "isolate", className)}>
      {/* Ambient color wash (average of the current frame) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[-10%] -top-[30%] -z-20 h-[160%] transition-[background-color] duration-1000 [mask-image:radial-gradient(55%_45%_at_50%_42%,#000,transparent)]"
        style={{ backgroundColor: "rgb(var(--film-glow) / 0.2)" }}
      />

      <div ref={placeholderRef} className={clsx("relative aspect-video", frameClassName)}>
        {/* Ambient light (blurred low-res copy of the frame), YouTube-style */}
        <div aria-hidden className={clsx("pointer-events-none absolute -inset-x-[5%] -inset-y-[9%] -z-10 transition-opacity duration-700 [mask-image:radial-gradient(closest-side,#000_62%,transparent)]", docked ? "opacity-0" : started ? "opacity-90" : "opacity-60")}>
          <canvas ref={ambientRef} width={AMBIENT_W} height={AMBIENT_H} className="h-full w-full scale-105 blur-[44px] saturate-[1.5]" />
        </div>

        <div
          ref={frameRef}
          tabIndex={0}
          role="region"
          aria-label={labels.title}
          aria-describedby={hintId}
          onKeyDown={onKeyDown}
          onPointerMove={poke}
          onPointerLeave={() => {
            if (videoRef.current && !videoRef.current.paused) setUiVisible(false);
          }}
          onFocus={poke}
          className={clsx(
            "group/player overflow-hidden bg-black outline-none focus-visible:ring-2 focus-visible:ring-violet-2",
            docked
              ? "op-dock-in fixed bottom-4 left-4 z-[60] aspect-video w-[min(380px,calc(100vw-2rem))] rounded-2xl shadow-[0_30px_80px_-20px_rgba(0,0,0,.85)] ring-1 ring-white/15"
              : "absolute inset-0 ring-1 ring-white/10 sm:rounded-[28px]",
            fullscreen && "rounded-none",
            playing && !showUi && "cursor-none",
          )}
        >
          <video
            ref={videoRef}
            poster={poster}
            playsInline
            preload="none"
            className="h-full w-full bg-black object-contain"
            onClick={() => (docked ? backToPlayer() : togglePlay())}
            onDoubleClick={() => void toggleFullscreen()}
            onPlay={onPlay}
            onPause={onPause}
            onEnded={() => {
              setEnded(true);
              setPlaying(false);
              setUiVisible(true);
            }}
            onTimeUpdate={onTimeUpdate}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              setDuration(v.duration || durationHint || 0);
              if (initialSeek.current !== null) {
                v.currentTime = Math.min(initialSeek.current, Math.max(0, (v.duration || 0) - 0.5));
                initialSeek.current = null;
                setTime(v.currentTime);
                setStarted(true);
                paint();
              }
            }}
            onDurationChange={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
            onProgress={onProgress}
            onWaiting={() => setWaiting(true)}
            onPlaying={() => setWaiting(false)}
            onCanPlay={() => setWaiting(false)}
            onSeeked={() => paint()}
            onVolumeChange={onVolume}
            onError={() => {
              setError(true);
              setWaiting(false);
            }}
          />

          {/* Cinematic vignette + bottom scrim */}
          <div aria-hidden className={clsx("pointer-events-none absolute inset-0 transition-opacity duration-700", !started ? "opacity-100" : showUi ? "opacity-100" : "opacity-0")} style={{ background: "linear-gradient(to top, rgba(5,4,7,.88) 0%, rgba(5,4,7,.25) 28%, transparent 50%), radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(5,4,7,.55) 100%)" }} />

          {/* Chapter title toast */}
          {toast && !docked ? (
            <div key={toast.key} aria-live="polite" className="op-toast pointer-events-none absolute left-4 top-4 flex items-baseline gap-3 rounded-full bg-black/45 px-4 py-2 backdrop-blur-md sm:left-6 sm:top-6">
              <span className="font-mono text-xs text-violet-3">{String(toast.idx + 1).padStart(2, "0")}</span>
              <span className="font-display text-sm font-semibold tracking-tight text-white sm:text-base">{chapters[toast.idx]?.label}</span>
            </div>
          ) : null}

          {/* Big center button */}
          {!playing && !waiting && !error && !scrubbing ? (
            <div
              className={clsx("absolute inset-0 flex flex-col items-center justify-center gap-4", docked && "hidden")}
              onClick={(e) => {
                if (e.target === e.currentTarget) void play();
              }}
            >
              <button
                type="button"
                onClick={() => void play()}
                className="group/play relative grid h-20 w-20 place-items-center rounded-full bg-violet text-white shadow-[0_0_60px_rgba(70,28,247,.55)] outline-none transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] hover:scale-105 focus-visible:ring-4 focus-visible:ring-white/70 active:scale-95 sm:h-28 sm:w-28"
                aria-label={ended ? labels.replay : started ? labels.resume : labels.watch}
              >
                {!started ? (
                  <>
                    <span aria-hidden className="op-halo absolute inset-0 rounded-full border border-violet-2/70" />
                    <span aria-hidden className="op-halo absolute inset-0 rounded-full border border-violet-2/50 [animation-delay:.8s]" />
                    <span aria-hidden className="op-halo absolute inset-0 rounded-full border border-violet-2/40 [animation-delay:1.6s]" />
                  </>
                ) : null}
                <span aria-hidden className="absolute inset-[3px] rounded-full bg-gradient-to-b from-white/25 to-transparent opacity-70" />
                {ended ? <IconReplay size={34} className="relative" /> : <IconPlay size={36} className="relative translate-x-[2px]" />}
              </button>
              <div className="pointer-events-none rounded-2xl bg-black/50 px-4 py-2 text-center ring-1 ring-white/10 backdrop-blur-md sm:px-5 sm:py-2.5">
                <p className="font-display text-base font-semibold tracking-tight text-white sm:text-xl">
                  {ended ? labels.replay : started ? labels.resume : labels.watch}
                  {!started && totalLabel ? <span className="ml-2 font-mono text-sm font-normal text-white/70">{totalLabel}</span> : null}
                </p>
                {!started ? (
                  <p className="mt-1 hidden items-center justify-center gap-1.5 text-xs text-white/70 sm:flex">
                    <IconVolume size={14} /> {labels.soundOn}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Buffering */}
          {waiting && playing && !error ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center" role="status">
              <span className="op-spin block h-12 w-12 rounded-full border-2 border-white/15 border-t-white" />
              <span className="sr-only">{labels.loading}</span>
            </div>
          ) : null}

          {/* Error */}
          {error ? (
            <div className="absolute inset-0 grid place-items-center bg-black/70 p-6 text-center" role="alert">
              <div>
                <p className="text-sm text-white/80">{labels.error}</p>
                <button
                  type="button"
                  className="mt-4 rounded-full bg-white px-5 py-2 text-sm font-semibold text-ink transition hover:bg-violet-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  onClick={() => {
                    setError(false);
                    videoRef.current?.load();
                  }}
                >
                  {labels.retry}
                </button>
              </div>
            </div>
          ) : null}

          {/* Controls — full */}
          {!docked && started ? (
            <div className={clsx("absolute inset-x-0 bottom-0 px-3 pb-3 pt-10 transition-[opacity,transform] duration-500 ease-[cubic-bezier(.16,1,.3,1)] sm:px-6 sm:pb-5", showUi ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0")}>
              {/* Scrubber */}
              <div
                ref={trackRef}
                role="slider"
                tabIndex={0}
                aria-label={labels.seek}
                aria-valuemin={0}
                aria-valuemax={Math.round(dur)}
                aria-valuenow={Math.round(time)}
                aria-valuetext={`${fmtTime(time)} ${labels.of} ${totalLabel} — ${chapters[activeChapter]?.label ?? ""}`}
                onPointerDown={onScrubDown}
                onPointerMove={onScrubMove}
                onPointerUp={onScrubUp}
                onPointerCancel={onScrubUp}
                onPointerLeave={() => setHover(null)}
                onKeyDown={onScrubKey}
                className="group/track relative flex h-6 cursor-pointer touch-none items-center outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-violet-2"
              >
                <div className="relative h-1 w-full overflow-hidden rounded-full transition-[height] duration-200 group-hover/track:h-1.5" style={{ maskImage, WebkitMaskImage: maskImage }}>
                  <div className="absolute inset-0 bg-white/20" />
                  <div className="absolute inset-y-0 left-0 bg-white/35 transition-[width] duration-300" style={{ width: `${buffered * 100}%` }} />
                  <div ref={fillRef} className="absolute inset-0 origin-left bg-gradient-to-r from-violet to-violet-2" style={{ transform: "scaleX(0)" }} />
                </div>
                <div ref={thumbRef} aria-hidden className={clsx("absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_4px_rgba(70,28,247,.45)] transition-transform duration-200", scrubbing ? "scale-125" : "scale-0 group-hover/track:scale-100 group-focus-visible/track:scale-100")} style={{ left: "0%" }} />
                {hover && hoverChapter ? (
                  <div aria-hidden className="pointer-events-none absolute bottom-7 -translate-x-1/2 whitespace-nowrap rounded-lg bg-black/80 px-2.5 py-1.5 text-center shadow-lg backdrop-blur" style={{ left: clamp(hover.x, 48, Math.max(48, hover.w - 48)) }}>
                    <span className="block font-mono text-[11px] text-white">{fmtTime(hover.t)}</span>
                    <span className="block text-[11px] text-white/65">{hoverChapter.label}</span>
                  </div>
                ) : null}
              </div>

              {/* Buttons row */}
              <div className="mt-1 flex items-center gap-1 text-white sm:gap-2">
                <CtrlButton label={playing ? labels.pause : labels.play} onClick={togglePlay}>
                  {playing ? <IconPause size={22} /> : <IconPlay size={22} />}
                </CtrlButton>
                <div className="group/vol flex items-center">
                  <CtrlButton label={muted || volume === 0 ? labels.unmute : labels.mute} onClick={toggleMute}>
                    {muted || volume === 0 ? <IconMuted size={22} /> : <IconVolume size={22} />}
                  </CtrlButton>
                  <label className="hidden w-0 overflow-hidden transition-[width] duration-300 group-focus-within/vol:w-24 group-hover/vol:w-24 sm:block">
                    <span className="sr-only">{labels.volume}</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={muted ? 0 : volume}
                      onChange={(e) => {
                        const v = videoRef.current;
                        if (!v) return;
                        const val = Number(e.currentTarget.value);
                        v.volume = val;
                        v.muted = val === 0;
                      }}
                      className="op-range mx-2 h-4 w-20"
                      style={{ "--fill": volumeFill } as CSSProperties}
                    />
                  </label>
                </div>
                <span className="ml-1 font-mono text-xs tabular-nums text-white/80 sm:text-sm">
                  {fmtTime(time)} <span className="text-white/60">/ {totalLabel}</span>
                </span>
                <span className="ml-3 hidden truncate text-sm text-white/70 md:inline">
                  <span aria-hidden className="text-white/35">·</span> {chapters[activeChapter]?.label}
                </span>
                <span className="ml-auto hidden text-[11px] text-white/60 lg:inline">{labels.shortcuts}</span>
                <CtrlButton className="ml-auto lg:ml-2" label={fullscreen ? labels.exitFullscreen : labels.fullscreen} onClick={() => void toggleFullscreen()}>
                  {fullscreen ? <IconShrink size={20} /> : <IconExpand size={20} />}
                </CtrlButton>
              </div>
            </div>
          ) : null}

          {/* Controls — docked mini player */}
          {docked ? (
            <>
              <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-1.5">
                <CtrlButton label={labels.backToPlayer} onClick={backToPlayer} small>
                  <IconArrowUpLeft size={18} />
                </CtrlButton>
                <CtrlButton label={labels.closeMini} onClick={closeMini} small>
                  <IconClose size={18} />
                </CtrlButton>
              </div>
              <div className="absolute bottom-2 left-2">
                <CtrlButton label={playing ? labels.pause : labels.play} onClick={togglePlay} small>
                  {playing ? <IconPause size={18} /> : <IconPlay size={18} />}
                </CtrlButton>
              </div>
              <div aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-white/15">
                <div ref={miniFillRef} className="h-full origin-left bg-violet-2" style={{ transform: "scaleX(0)" }} />
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Chapters */}
      <nav aria-label={labels.chapters} className="mt-6 sm:mt-8">
        <h3 className="sr-only">{labels.chapters}</h3>
        <ol ref={chapterListRef} className="op-noscroll -mx-[clamp(1rem,4vw,3rem)] flex snap-x snap-mandatory scroll-px-[clamp(1rem,4vw,3rem)] gap-2 overflow-x-auto px-[clamp(1rem,4vw,3rem)] pb-1 md:mx-0 md:grid md:auto-cols-fr md:grid-flow-col md:overflow-visible md:px-0">
          {chapters.map((c, i) => {
            const active = started && i === activeChapter;
            return (
              <li key={`${c.t}-${c.label}`} className="w-[44vw] shrink-0 snap-start sm:w-[30vw] md:w-auto">
                <button
                  type="button"
                  onClick={() => seekTo(c.t, true)}
                  aria-current={active ? "step" : undefined}
                  aria-label={`${labels.chapter} ${i + 1} · ${fmtTime(c.t)} · ${c.label}`}
                  className={clsx(
                    "group/ch relative flex h-full w-full flex-col items-start gap-1 overflow-hidden rounded-2xl border px-3.5 py-3 text-left transition duration-500 ease-[cubic-bezier(.16,1,.3,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-2",
                    active ? "border-violet/60 bg-violet/15" : "border-line bg-panel/60 hover:-translate-y-0.5 hover:border-violet/40 hover:bg-panel",
                  )}
                >
                  <span className="font-mono text-[11px] text-muted">
                    <span className={active ? "text-violet-3" : undefined}>{String(i + 1).padStart(2, "0")}</span> · {fmtTime(c.t)}
                  </span>
                  <span className={clsx("font-display text-sm font-semibold leading-tight tracking-tight", active ? "text-white" : "text-text/85 group-hover/ch:text-white")}>{c.label}</span>
                  <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-white/5">
                    <span className="block h-full origin-left bg-violet-2 transition-transform duration-300 ease-linear" style={{ transform: `scaleX(${started ? chapterProgress(i) : 0})` }} />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p id={hintId} className="sr-only">
          {labels.shortcuts}
        </p>
      </nav>
    </div>
  );
}

function CtrlButton({ label, onClick, children, className, small = false }: { label: string; onClick: () => void; children: ReactNode; className?: string; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={clsx(
        "grid shrink-0 place-items-center rounded-full text-white/90 outline-none transition hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-violet-2 active:scale-90",
        small ? "h-8 w-8 bg-black/40 backdrop-blur" : "h-10 w-10",
        className,
      )}
    >
      {children}
    </button>
  );
}
