"use client";
// Signature intro: the ONDE wordmark is literally assembled, one letter at a time.
//  1. a faint blueprint of the word is traced (outline draw),
//  2. o → n → d → e: each letter arrives as horizontal slices that slam in from opposite sides and lock into
//     the blueprint (flash + kick on every lock, HUD counter 01–04),
//  3. the three NFC arcs fire one by one with sonar rings, the tagline decodes,
//  4. the logo flies into its place in the navbar while the curtain opens (FLIP onto [data-nav-logo]).
// Once per session (sessionStorage "onde-intro"), Skip + Escape, reduced motion = short fade. Visibility is
// gated by html[data-intro] (set before paint by INTRO_BOOT_SCRIPT) so returning visitors never see a flash.
import { useEffect, useRef } from "react";
import logoPaths from "@/logo-paths.json";
import { gsap, registerGsap, lockScroll, unlockScroll } from "@/lib/motion";
import { useIntroAttr } from "./hooks";

type Dict = { skip: string; tagline: string };

const VIEWBOX = "0 0 4048 1520";
const VB_W = 4048;
const VB_H = 1520;
/** Ink bounds of each glyph in viewBox units (y0, y1) and its horizontal centre. */
const LETTERS = [
  { key: "o", y0: 580, y1: 1438, cx: 528 },
  { key: "n", y0: 580, y1: 1434, cx: 1448 },
  { key: "d", y0: 273, y1: 1445, cx: 2363 },
  { key: "e", y0: 577, y1: 1442, cx: 3280 },
] as const;
const SLICES = 6;
const ARC_KEYS = ["arc1", "arc2", "arc3"] as const;
const ARC_ORIGIN = "3335 622";
const GLYPHS = "ABCDEFGHJKMNPQRTUVWXY34679#%&*+/<>";

type WindowWithFailsafe = Window & { __ondeIntroFailsafe?: ReturnType<typeof setTimeout> };

/** CSS inset() for slice k of a glyph, in % of the full viewBox box. */
function sliceInset(y0: number, y1: number, k: number) {
  const pad = 14;
  const h = (y1 - y0 + pad * 2) / SLICES;
  const top = y0 - pad + k * h - (k > 0 ? 3 : 0);
  const bottom = top + h + (k < SLICES - 1 ? 6 : 0);
  const t = (top / VB_H) * 100;
  const b = 100 - (bottom / VB_H) * 100;
  return `inset(${t.toFixed(3)}% -2% ${b.toFixed(3)}% -2%)`;
}

export default function IntroLoader({ dict }: { dict: Dict }) {
  const root = useRef<HTMLDivElement>(null);
  const skipRef = useRef<() => void>(() => undefined);
  const introState = useIntroAttr();

  useEffect(() => {
    const html = document.documentElement;
    const initial = html.dataset.intro;
    if (initial !== "play" && initial !== "reduced") return;
    const w = window as WindowWithFailsafe;
    if (w.__ondeIntroFailsafe) clearTimeout(w.__ondeIntroFailsafe);
    try {
      sessionStorage.setItem("onde-intro", "1");
    } catch {
      /* private mode — intro may replay, harmless */
    }
    registerGsap();
    lockScroll("intro");

    const el = root.current;
    if (!el) return;
    let revealed = false;
    let finished = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      if (html.dataset.intro !== "done") html.dataset.intro = "reveal";
      window.dispatchEvent(new Event("onde:intro-reveal"));
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      reveal();
      html.dataset.intro = "done";
      unlockScroll("intro");
      window.dispatchEvent(new Event("onde:intro-done"));
    };

    const pieces = el.querySelectorAll<HTMLElement | SVGElement>(".intro-piece");
    const late = performance.now() > 2600; // bundle arrived late: don't hold the page hostage
    let tl: gsap.core.Timeline;

    if (initial === "reduced" || late) {
      tl = gsap.timeline({ onComplete: finish });
      tl.set(pieces, { opacity: 1 });
      tl.to(el, { opacity: 0, duration: 0.4, ease: "power1.out", onStart: reveal }, late ? 0 : 0.5);
    } else {
      tl = buildTimeline(el, dict.tagline, reveal, finish);
    }

    skipRef.current = () => {
      if (finished) return;
      tl.kill();
      gsap.to(el, { opacity: 0, duration: 0.35, ease: "power2.out", onStart: reveal, onComplete: finish });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skipRef.current();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      tl.kill();
      unlockScroll("intro");
    };
  }, [dict.tagline]);

  if (introState === "done") return null;

  return (
    <div ref={root} className="intro-root fixed inset-0 z-[100]">
      <div className="intro-curtain absolute inset-0 bg-ink" style={{ clipPath: "inset(0% 0% 0% 0%)" }} aria-hidden="true">
        <div
          className="intro-glow absolute left-1/2 top-1/2 h-[120vmax] w-[120vmax] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0"
          style={{
            background: "radial-gradient(circle, rgb(70 28 247 / 0.34) 0%, rgb(70 28 247 / 0.1) 30%, transparent 58%)",
          }}
        />
        <div className="intro-grid absolute inset-0 opacity-0" />
        <div className="intro-flash absolute left-0 right-0 top-1/2 h-px origin-center bg-gradient-to-r from-transparent via-violet-2 to-transparent opacity-0" />
      </div>

      <div className="intro-stage absolute inset-0 grid place-items-center px-6" aria-hidden="true">
        <div className="flex w-full flex-col items-center">
          <div className="intro-logo relative aspect-[4048/1520] w-[min(80vw,760px)]">
            {/* blueprint */}
            <svg viewBox={VIEWBOX} className="intro-blueprint intro-piece absolute inset-0 h-full w-full overflow-visible">
              {LETTERS.map((l) => (
                <path
                  key={l.key}
                  className="intro-bp"
                  d={logoPaths[l.key]}
                  fill="none"
                  stroke="#8C7BFF"
                  strokeOpacity="0.5"
                  strokeDasharray="1 0"
                  vectorEffect="non-scaling-stroke"
                  strokeWidth="1"
                />
              ))}
            </svg>

            {/* slices */}
            {LETTERS.map((l) =>
              Array.from({ length: SLICES }, (_, k) => (
                <svg
                  key={`${l.key}${k}`}
                  viewBox={VIEWBOX}
                  data-letter={l.key}
                  className="intro-slice intro-piece absolute inset-0 h-full w-full overflow-visible"
                  style={{ clipPath: sliceInset(l.y0, l.y1, k), transformOrigin: `${(l.cx / VB_W) * 100}% 60%` }}
                >
                  <path d={logoPaths[l.key]} fill="#ffffff" fillRule="evenodd" />
                </svg>
              )),
            )}

            {/* solid letters — replace the slices the moment each letter locks (no seams) */}
            {LETTERS.map((l) => (
              <svg key={`s${l.key}`} viewBox={VIEWBOX} data-letter={l.key} className="intro-solid absolute inset-0 h-full w-full overflow-visible opacity-0">
                <path d={logoPaths[l.key]} fill="#ffffff" fillRule="evenodd" />
              </svg>
            ))}

            {/* lock flashes */}
            {LETTERS.map((l) => (
              <svg
                key={`f${l.key}`}
                viewBox={VIEWBOX}
                data-letter={l.key}
                className="intro-lock absolute inset-0 h-full w-full overflow-visible opacity-0"
                style={{ filter: "drop-shadow(0 0 18px rgb(140 123 255 / 0.95))" }}
              >
                <path d={logoPaths[l.key]} fill="#C9BEFF" fillRule="evenodd" />
              </svg>
            ))}

            {/* arcs + sonar */}
            <svg
              viewBox={VIEWBOX}
              className="intro-arcs intro-piece absolute inset-0 h-full w-full overflow-visible"
              style={{ filter: "drop-shadow(0 0 22px rgb(123 92 255 / 0.6))" }}
            >
              {[0, 1, 2].map((i) => (
                <circle key={i} className="intro-ripple" cx="3335" cy="622" r="2600" fill="none" stroke={i === 1 ? "#461CF7" : "#7B5CFF"} strokeWidth={i === 1 ? 10 : 5} opacity="0" />
              ))}
              {ARC_KEYS.map((k) => (
                <path key={k} className="intro-arc" d={logoPaths[k]} fill="#5A33FF" />
              ))}
            </svg>
          </div>

          <div className="intro-hud intro-piece mt-[clamp(1.4rem,3.2vw,2.4rem)] flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.3em] text-muted">
            {LETTERS.map((l, i) => (
              <span key={l.key} className="intro-hud-cell inline-flex items-center gap-1.5" data-letter={l.key}>
                <span className="intro-hud-dot inline-block h-1.5 w-1.5 rounded-full bg-line" />
                {String(i + 1).padStart(2, "0")}
              </span>
            ))}
          </div>
          <p className="intro-tagline intro-piece mt-4 font-sans text-[clamp(0.66rem,1.4vw,0.84rem)] font-medium uppercase tracking-[0.55em] text-text/80">
            {dict.tagline}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => skipRef.current()}
        className="intro-skip group absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 inline-flex items-center gap-2 rounded-full border border-line bg-panel/70 px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] text-muted backdrop-blur transition-colors hover:border-violet-2 hover:text-text md:right-8"
      >
        {dict.skip}
        <svg viewBox="0 0 16 16" className="h-3 w-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true">
          <path d="M3 3l5 5-5 5M9 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

function buildTimeline(el: HTMLElement, tagline: string, reveal: () => void, finish: () => void) {
  const q = gsap.utils.selector(el);
  const bp = q(".intro-bp");
  const arcs = q(".intro-arc");
  const ripples = q(".intro-ripple");
  const tag = q(".intro-tagline")[0] as HTMLElement | undefined;
  const hud = q(".intro-hud");
  const glow = q(".intro-glow");
  const grid = q(".intro-grid");
  const logo = q(".intro-logo")[0] as HTMLElement | undefined;
  const stage = q(".intro-stage");
  const curtain = q(".intro-curtain");
  const flash = q(".intro-flash");
  const skip = q(".intro-skip");
  const rnd = gsap.utils.random;

  gsap.set([q(".intro-blueprint"), q(".intro-arcs"), hud], { opacity: 1 });
  gsap.set(q(".intro-slice"), { opacity: 0 });
  gsap.set(arcs, { opacity: 0 });
  if (tag) gsap.set(tag, { opacity: 0 });

  const tl = gsap.timeline({ defaults: { ease: "onde.expo" }, onComplete: finish });
  tl.fromTo(glow, { opacity: 0, scale: 0.3 }, { opacity: 1, scale: 1, duration: 2.2 }, 0);
  tl.fromTo(grid, { opacity: 0 }, { opacity: 1, duration: 1.2, ease: "power1.out" }, 0);
  tl.fromTo(skip, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.6 }, 0.2);
  tl.fromTo(hud, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.6 }, 0.15);

  // 1 · blueprint trace
  tl.fromTo(bp, { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.75, ease: "power2.inOut", stagger: 0.06 }, 0.05);

  // 2 · letters, one by one
  const STEP = 0.4;
  const START = 0.55;
  LETTERS.forEach((l, i) => {
    const at = START + i * STEP;
    const slices = q(`.intro-slice[data-letter="${l.key}"]`);
    const lock = q(`.intro-lock[data-letter="${l.key}"]`);
    const dot = q(`.intro-hud-cell[data-letter="${l.key}"] .intro-hud-dot`);
    const cell = q(`.intro-hud-cell[data-letter="${l.key}"]`);
    slices.forEach((s, k) => {
      const side = (k + i) % 2 === 0 ? -1 : 1;
      tl.fromTo(
        s,
        {
          opacity: 0,
          xPercent: side * rnd(38, 70),
          yPercent: rnd(-6, 6),
          skewX: side * rnd(18, 34),
          rotation: side * rnd(-5, 5),
          filter: "blur(10px)",
        },
        { opacity: 1, xPercent: 0, yPercent: 0, skewX: 0, rotation: 0, filter: "blur(0px)", duration: 0.42, ease: "expo.out" },
        at + k * 0.028,
      );
    });
    const lockAt = at + 0.36;
    const solid = q(`.intro-solid[data-letter="${l.key}"]`);
    tl.set(solid, { opacity: 1 }, lockAt);
    tl.set(slices, { opacity: 0 }, lockAt + 0.02);
    tl.fromTo(lock, { opacity: 0.95 }, { opacity: 0, duration: 0.5, ease: "power2.out", immediateRender: false }, lockAt);
    if (logo) tl.fromTo(logo, { scale: 1.022 }, { scale: 1, duration: 0.35, ease: "power3.out", immediateRender: false }, lockAt);
    tl.to(dot, { backgroundColor: "#7B5CFF", boxShadow: "0 0 10px #7B5CFF", duration: 0.2, ease: "power1.out" }, lockAt);
    tl.to(cell, { color: "#ECEBF2", duration: 0.2, ease: "power1.out" }, lockAt);
  });
  const lettersDone = START + (LETTERS.length - 1) * STEP + 0.45;
  tl.to(bp, { opacity: 0, duration: 0.3, ease: "power1.out" }, lettersDone - 0.1);

  // 3 · arcs fire + sonar + tagline decode
  const arcAt = lettersDone;
  arcs.forEach((a, i) => {
    tl.fromTo(
      a,
      { opacity: 0, scale: 0.3, svgOrigin: ARC_ORIGIN },
      { opacity: 1, scale: 1, svgOrigin: ARC_ORIGIN, duration: 0.5, ease: "back.out(2.8)" },
      arcAt + i * 0.11,
    );
  });
  ripples.forEach((r, i) => {
    tl.fromTo(
      r,
      { scale: 0.03, opacity: 0.9, svgOrigin: ARC_ORIGIN },
      { scale: 1, opacity: 0, svgOrigin: ARC_ORIGIN, duration: 1.3, ease: "expo.out", immediateRender: false },
      arcAt + 0.12 + i * 0.13,
    );
  });
  if (tag) {
    const proxy = { p: 0 };
    tl.set(tag, { opacity: 1 }, arcAt + 0.1);
    tl.to(
      proxy,
      {
        p: 1,
        duration: 0.7,
        ease: "none",
        onUpdate: () => {
          const n = Math.floor(proxy.p * tagline.length);
          let out = tagline.slice(0, n);
          for (let j = n; j < tagline.length; j++) {
            const c = tagline[j];
            out += c === " " || c === "." ? c : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          }
          tag.textContent = out;
        },
        onComplete: () => {
          tag.textContent = tagline;
        },
      },
      arcAt + 0.1,
    );
  }

  // 4 · exit — the logo flies into the navbar while the curtain opens
  const exitAt = arcAt + 1.0;
  tl.to(skip, { opacity: 0, duration: 0.3, ease: "power1.out" }, exitAt);
  tl.to([hud, tag ?? []], { opacity: 0, y: 10, duration: 0.35, ease: "power2.in" }, exitAt);
  tl.to(grid, { opacity: 0, duration: 0.4, ease: "power1.out" }, exitAt);
  tl.call(reveal, [], exitAt + 0.2);

  const target = typeof document !== "undefined" ? document.querySelector<SVGElement>("[data-nav-logo]") : null;
  const tr = target?.getBoundingClientRect();
  const lr = logo?.getBoundingClientRect();
  if (logo && tr && lr && tr.width > 4 && tr.top < window.innerHeight) {
    const s = tr.width / lr.width;
    const dx = tr.left + tr.width / 2 - (lr.left + lr.width / 2);
    const dy = tr.top + tr.height / 2 - (lr.top + lr.height / 2);
    tl.to(logo, { x: dx, y: dy, scale: s, duration: 1.0, ease: "expo.inOut" }, exitAt);
    tl.fromTo(flash, { scaleX: 0, opacity: 1 }, { scaleX: 1, duration: 0.5, ease: "expo.inOut" }, exitAt + 0.1);
    tl.to(curtain, { clipPath: "inset(50% 0% 50% 0%)", duration: 0.9, ease: "expo.inOut" }, exitAt + 0.25);
    tl.to(flash, { opacity: 0, duration: 0.4, ease: "power1.out" }, exitAt + 0.7);
    tl.set(stage, { opacity: 0 }, exitAt + 1.02);
  } else {
    tl.to(stage, { scale: 1.12, opacity: 0, filter: "blur(10px)", duration: 0.6, ease: "expo.in" }, exitAt);
    tl.fromTo(flash, { scaleX: 0, opacity: 1 }, { scaleX: 1, duration: 0.5, ease: "expo.inOut" }, exitAt + 0.22);
    tl.to(curtain, { clipPath: "inset(50% 0% 50% 0%)", duration: 0.85, ease: "expo.inOut" }, exitAt + 0.3);
    tl.to(flash, { opacity: 0, duration: 0.45, ease: "power1.out" }, exitAt + 0.75);
  }
  return tl;
}
