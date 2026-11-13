"use client";
// 2 · "Made for your café / salon / gym…" — a scroll-driven 3D word drum. The sentence stays pinned while the
// last word rolls on a cylinder; every business lands with what its ONDE tag opens (Google review, menu,
// Instagram, WhatsApp…), shown on a live "tap card" next to it. Same smart link, any destination.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import clsx from "clsx";
import { gsap, ScrollTrigger, registerGsap, prefersReducedMotion } from "@/lib/motion";
import { Eyebrow } from "../Section";
import type { HomeDict } from "../types";

type DrumDict = HomeDict["drum"];
const KINDS = ["review", "menu", "instagram", "whatsapp", "website", "tiktok", "contact"] as const;
type Kind = (typeof KINDS)[number];
const asKind = (k: string): Kind => ((KINDS as readonly string[]).includes(k) ? (k as Kind) : "website");

const STEP_DEG = 26;
// Pacing. Each business owns an equal share of the section's scroll run (64svh, set by .drum-section in globals.css);
// the roll to the next one takes the middle ROLL fraction around the boundary, so every word (and its tap card) holds
// still for (1 - ROLL) × 64svh ≈ 46svh (first/last ≈ 55svh).
const ROLL = 0.28;
// Smoothing. The drum chases the scroll target (frame-rate independent lerp, per 60 fps frame) and never rolls faster
// than MAX_SPEED words per frame, so a hard flick (touch momentum, trackpad fling) rolls through the words instead of
// skipping several in a blink.
const LERP = 0.12;
const MAX_SPEED = 0.08;
const SETTLED = 0.0005;

export default function BusinessDrum({ dict }: { dict: DrumDict }) {
  const section = useRef<HTMLElement>(null);
  const wheel = useRef<HTMLDivElement>(null);
  const words = useRef<(HTMLSpanElement | null)[]>([]);
  const ticks = useRef<(HTMLSpanElement | null)[]>([]);
  const ghost = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState(0);
  const n = dict.items.length;

  useEffect(() => {
    registerGsap();
    const el = section.current;
    const wh = wheel.current;
    if (!el || !wh || prefersReducedMotion()) return;

    const roll = gsap.parseEase("power2.inOut");
    // scroll progress → drum position (word index, fractional while rolling)
    const target = (p: number) => {
      if (n < 2) return 0;
      const u = p * n - 0.5; // word k is centred on u = k
      const i = Math.floor(u);
      const fr = u - i;
      const a = (1 - ROLL) / 2;
      const t = fr <= a ? 0 : fr >= 1 - a ? 1 : roll((fr - a) / ROLL);
      return Math.min(n - 1, Math.max(0, i + t));
    };

    let last = -1;
    const render = (pos: number) => {
      const lh = wh.offsetHeight || 100;
      const R = lh / (2 * Math.tan(((STEP_DEG / 2) * Math.PI) / 180));
      words.current.forEach((w, k) => {
        if (!w) return;
        const a = (k - pos) * STEP_DEG;
        const vis = Math.abs(a) < 80;
        w.style.visibility = vis ? "visible" : "hidden";
        if (!vis) return;
        const c = Math.cos((a * Math.PI) / 180);
        w.style.transform = `rotateX(${-a}deg) translateZ(${R}px)`;
        // words rolling up (already shown) vanish fast so they never touch the lead line; the next ones linger
        w.style.opacity = String(Math.max(0, Math.pow(c, a < 0 ? 40 : 12)));
        w.dataset.on = Math.abs(k - pos) < 0.5 ? "1" : "0";
      });
      wh.style.transform = `translateZ(${-R}px)`;
      const idx = Math.round(pos);
      ticks.current.forEach((tk, k) => {
        if (tk) tk.style.transform = `scaleX(${k === idx ? 1 : k < idx ? 0.55 : 0.3})`;
      });
      if (idx !== last) {
        last = idx;
        setActive(idx);
      }
    };
    const parallax = (p: number) => {
      if (ghost.current) ghost.current.style.transform = `translate3d(0, ${(p - 0.5) * -14}vh, 0)`;
    };

    // smoothed position, advanced on gsap.ticker only while it differs from the target and the section is on screen
    let cur = 0;
    let goal = 0;
    let onScreen = true;
    let running = false;
    const stop = () => {
      if (!running) return;
      running = false;
      gsap.ticker.remove(tick);
    };
    const jump = () => {
      stop();
      cur = goal;
      render(cur);
    };
    const tick = (_time: number, deltaTime: number) => {
      const d = goal - cur;
      if (!onScreen || Math.abs(d) < SETTLED) return jump();
      const f = Math.min(Math.max(deltaTime, 1), 100) / (1000 / 60); // elapsed, in 60 fps frames
      const cap = MAX_SPEED * f;
      cur += Math.max(-cap, Math.min(cap, d * (1 - Math.pow(1 - LERP, f))));
      render(cur);
    };
    const follow = (p: number) => {
      goal = target(p);
      parallax(p);
      if (!onScreen) return jump();
      if (!running && Math.abs(goal - cur) >= SETTLED) {
        running = true;
        gsap.ticker.add(tick);
      }
    };

    const st = ScrollTrigger.create({
      trigger: el,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => follow(self.progress),
      // layout changed (resize, fonts, lazy sections): re-aim, and redraw at rest so the drum radius follows the font size
      onRefresh: (self) => {
        follow(self.progress);
        if (!running) render(cur);
      },
    });
    // off screen → no animation to watch: snap and let the ticker sleep
    const seen = ScrollTrigger.create({
      trigger: el,
      start: "top bottom",
      end: "bottom top",
      onToggle: (self) => {
        onScreen = self.isActive;
        if (!onScreen) jump();
      },
    });
    onScreen = seen.isActive;
    goal = target(st.progress);
    parallax(st.progress);
    jump();
    return () => {
      stop();
      st.kill();
      seen.kill();
    };
  }, [n]);

  const item = dict.items[active] ?? dict.items[0];

  return (
    <section
      ref={section}
      aria-label={dict.label}
      className="drum-section relative bg-ink"
      style={{ "--drum-n": n } as CSSProperties}
    >
      {/* static, accessible version for reduced motion / screen readers */}
      <ul className="sr-only">
        {dict.items.map((it) => (
          <li key={it.word}>
            {dict.lead} {it.word} — {it.dest}
          </li>
        ))}
      </ul>

      <div className="drum-stage sticky top-0 flex h-[100svh] items-center overflow-hidden" aria-hidden="true">
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(45% 55% at 30% 50%, rgb(70 28 247 / 0.16), transparent 70%)" }}
        />
        <span
          ref={ghost}
          className="pointer-events-none absolute -right-[4vw] top-1/2 -translate-y-1/2 select-none font-display text-[38vw] font-semibold leading-none tracking-[-0.06em] text-transparent [-webkit-text-stroke:1px_rgb(140_123_255/0.14)] md:text-[30vw]"
        >
          {String(active + 1).padStart(2, "0")}
        </span>

        <div className="container-site relative grid w-full grid-cols-[minmax(0,1fr)] items-center gap-[clamp(2rem,5vw,5rem)] lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div>
            <Eyebrow>{dict.label}</Eyebrow>
            <p className="mt-6 font-display text-[clamp(2.1rem,5.4vw,5.2rem)] font-semibold leading-[0.95] tracking-[-0.035em]">
              {dict.lead}
            </p>
            <div className="drum relative mt-5 h-[1.18em] font-serif text-[clamp(3.6rem,10vw,9.5rem)] italic leading-none [perspective:1100px]">
              <div ref={wheel} className="absolute inset-0 [transform-style:preserve-3d]">
                {dict.items.map((it, k) => (
                  <span
                    key={it.word}
                    ref={(e) => {
                      words.current[k] = e;
                    }}
                    className="drum-word absolute inset-0 flex items-center whitespace-nowrap [backface-visibility:hidden]"
                    style={{ transform: `rotateX(${-k * STEP_DEG}deg)` }}
                  >
                    {it.word}
                    <span className="drum-dot">.</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-[clamp(4.25rem,10vw,8.5rem)] flex items-center gap-4">
              <span className="font-mono text-xs tabular-nums text-muted">
                {String(active + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}
              </span>
              <span className="flex gap-1.5">
                {dict.items.map((it, k) => (
                  <span key={it.word} className="block h-[3px] w-7 overflow-hidden rounded-full bg-line">
                    <span
                      ref={(e) => {
                        ticks.current[k] = e;
                      }}
                      className={clsx(
                        "block h-full w-full origin-left rounded-full transition-[transform,background-color] duration-500 ease-expo",
                        k === active ? "bg-violet-2" : k < active ? "bg-violet/60" : "bg-transparent",
                      )}
                    />
                  </span>
                ))}
              </span>
            </div>
          </div>

          <TapCard key={active} item={item} dict={dict} />
        </div>
      </div>
    </section>
  );
}

function TapCard({ item, dict }: { item: DrumDict["items"][number]; dict: DrumDict }) {
  const ref = useRef<HTMLDivElement>(null);
  const kind = asKind(item.kind);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const parts = el.querySelectorAll(".tc-in");
    const tl = gsap.timeline({ defaults: { ease: "onde.expo" } });
    // quick swap (< 0.45 s end to end) so the card is readable for the whole hold of its word
    tl.fromTo(el, { rotateY: -8, y: 12, opacity: 0.55 }, { rotateY: 0, y: 0, opacity: 1, duration: 0.42 }, 0);
    tl.fromTo(parts, { y: 10, opacity: 0, filter: "blur(4px)" }, { y: 0, opacity: 1, filter: "blur(0px)", duration: 0.34, stagger: 0.025 }, 0.02);
    return () => {
      tl.kill();
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-[400px] [perspective:1200px] lg:mx-0 lg:justify-self-end">
      <div
        ref={ref}
        className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(160deg,rgb(31_27_48/0.92),rgb(12_11_18/0.96))] p-6 shadow-[0_40px_120px_-30px_rgb(70_28_247/0.55)] backdrop-blur-xl"
      >
        <div className="tc-in flex items-center justify-between">
          <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-violet-3">
            <TapArcs />
            {dict.tap}
          </span>
          <span className="font-mono text-[11px] text-muted">onde.tn/t/{item.code}</span>
        </div>
        <div className="tc-in mt-6 flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl" style={{ background: KIND_BG[kind] }}>
            <KindIcon kind={kind} />
          </span>
          <span className="min-w-0">
            <span className="block text-xs uppercase tracking-[0.2em] text-muted">{dict.opens}</span>
            <span className="block text-balance font-display text-[clamp(1.3rem,6.2vw,1.7rem)] font-semibold leading-tight tracking-[-0.02em] line-clamp-2">
              {item.dest}
            </span>
          </span>
        </div>
        <div className="tc-in mt-6 rounded-2xl border border-white/[0.07] bg-black/30 p-4">
          <Mini kind={kind} lines={item.lines} />
        </div>
        <p className="tc-in mt-5 text-sm leading-relaxed text-muted">{dict.foot}</p>
      </div>
    </div>
  );
}

function TapArcs() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path className="tc-arc" style={{ animationDelay: "0s" }} d="M6 8.3a6 6 0 0 1 0 7.4" />
        <path className="tc-arc" style={{ animationDelay: ".15s" }} d="M9.5 6a9.5 9.5 0 0 1 0 12" />
        <path className="tc-arc" style={{ animationDelay: ".3s" }} d="M13 3.8a13 13 0 0 1 0 16.4" />
      </g>
    </svg>
  );
}

const KIND_BG: Record<Kind, string> = {
  review: "linear-gradient(135deg,#ffffff,#e9e7f5)",
  menu: "linear-gradient(135deg,#F5A524,#E07B00)",
  instagram: "linear-gradient(135deg,#F58529,#DD2A7B 55%,#8134AF)",
  whatsapp: "linear-gradient(135deg,#2BD48A,#14996A)",
  website: "linear-gradient(135deg,#7B5CFF,#461CF7)",
  tiktok: "linear-gradient(135deg,#1b1b22,#000)",
  contact: "linear-gradient(135deg,#8C7BFF,#5A33FF)",
};

function KindIcon({ kind }: { kind: Kind }) {
  const p = { fill: "none", stroke: "#fff", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (kind) {
    case "review":
      return (
        <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
          <path d="M12 3.2l2.6 5.5 6 .7-4.4 4.1 1.2 5.9L12 16.5l-5.4 2.9 1.2-5.9L3.4 9.4l6-.7z" fill="#FBBC04" />
        </svg>
      );
    case "menu":
      return (
        <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
          <path {...p} d="M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5M17 3c-2 1.5-2.5 4-2.5 7h2.5v11" />
        </svg>
      );
    case "instagram":
      return (
        <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
          <rect {...p} x="4" y="4" width="16" height="16" rx="5" />
          <circle {...p} cx="12" cy="12" r="3.6" />
          <circle cx="16.9" cy="7.1" r="1.1" fill="#fff" />
        </svg>
      );
    case "whatsapp":
      return (
        <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
          <path {...p} d="M4.5 19.5l1.2-3.6A8 8 0 1 1 8.4 18.6z" />
          <path {...p} d="M9.2 8.8c.3 2.6 2.2 4.7 4.9 5.6l1.3-1.2" />
        </svg>
      );
    case "website":
      return (
        <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
          <circle {...p} cx="12" cy="12" r="8.5" />
          <path {...p} d="M3.5 12h17M12 3.5c2.6 2.6 2.6 14.4 0 17M12 3.5c-2.6 2.6-2.6 14.4 0 17" />
        </svg>
      );
    case "tiktok":
      return (
        <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
          <path d="M14 4v10.2a3.4 3.4 0 1 1-3.4-3.4" fill="none" stroke="#25F4EE" strokeWidth="2" strokeLinecap="round" transform="translate(-.6 -.4)" />
          <path d="M14 4v10.2a3.4 3.4 0 1 1-3.4-3.4" fill="none" stroke="#FE2C55" strokeWidth="2" strokeLinecap="round" transform="translate(.6 .4)" />
          <path d="M14 4v10.2a3.4 3.4 0 1 1-3.4-3.4M14 4c.4 2.2 2 3.8 4.5 4" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "contact":
      return (
        <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
          <rect {...p} x="3.5" y="5" width="17" height="14" rx="3" />
          <circle {...p} cx="9" cy="11" r="2.2" />
          <path {...p} d="M5.8 16.2c.8-1.6 1.9-2.3 3.2-2.3s2.4.7 3.2 2.3M14.5 10h3.5M14.5 13h2.5" />
        </svg>
      );
  }
}

function Mini({ kind, lines }: { kind: Kind; lines: string[] }) {
  switch (kind) {
    case "review":
      return (
        <div>
          <div className="flex gap-1.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <svg key={i} viewBox="0 0 24 24" className="tc-star h-6 w-6" style={{ animationDelay: `${0.12 + i * 0.06}s` }} aria-hidden="true">
                <path d="M12 3.2l2.6 5.5 6 .7-4.4 4.1 1.2 5.9L12 16.5l-5.4 2.9 1.2-5.9L3.4 9.4l6-.7z" fill="#FBBC04" />
              </svg>
            ))}
          </div>
          <p className="mt-3 text-sm text-text/85">{lines[0]}</p>
          <p className="mt-1 text-xs text-muted">{lines[1]}</p>
        </div>
      );
    case "menu":
      return (
        <ul className="space-y-2 text-sm">
          {lines.map((l) => {
            const [name, price] = l.split("|");
            return (
              <li key={l} className="flex items-baseline gap-2">
                <span className="text-text/90">{name}</span>
                <span className="mb-1 flex-1 border-b border-dotted border-white/15" />
                <span className="font-mono text-xs text-gold">{price}</span>
              </li>
            );
          })}
        </ul>
      );
    case "instagram":
      return (
        <div>
          <div className="grid grid-cols-3 gap-1.5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span
                key={i}
                className="tc-pop aspect-square rounded-md"
                style={{
                  animationDelay: `${0.1 + i * 0.04}s`,
                  background: `linear-gradient(${120 + i * 40}deg, rgb(245 133 41 / ${0.5 + (i % 3) * 0.15}), rgb(129 52 175 / 0.8))`,
                }}
              />
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">{lines[0]}</p>
        </div>
      );
    case "whatsapp":
      return (
        <div className="space-y-2 text-sm">
          <p className="tc-pop w-fit max-w-[85%] rounded-2xl rounded-tl-sm bg-white/10 px-3 py-2" style={{ animationDelay: ".1s" }}>
            {lines[0]}
          </p>
          <p className="tc-pop ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-sm bg-[#1d7a57] px-3 py-2" style={{ animationDelay: ".3s" }}>
            {lines[1]} <span className="text-[#53bdeb]">✓✓</span>
          </p>
        </div>
      );
    case "website":
      return (
        <div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-white/20" />
            <span className="size-2 rounded-full bg-white/20" />
            <span className="size-2 rounded-full bg-white/20" />
            <span className="ml-2 flex-1 truncate rounded-full bg-white/5 px-3 py-1 font-mono text-[11px] text-muted">{lines[0]}</span>
          </div>
          <div className="mt-3 h-14 rounded-lg bg-[linear-gradient(120deg,rgb(70_28_247/0.5),rgb(123_92_255/0.15))]" />
          <div className="mt-2 flex items-center justify-between">
            <span className="h-2 w-1/2 rounded bg-white/15" />
            <span className="rounded-full bg-violet px-3 py-1 text-[11px] font-semibold">{lines[1]}</span>
          </div>
        </div>
      );
    case "tiktok":
      return (
        <div className="flex items-center gap-4">
          <div className="relative grid h-24 w-16 place-items-center rounded-lg bg-[linear-gradient(160deg,#25F4EE33,#FE2C5533)]">
            <span className="ml-0.5 border-y-[8px] border-l-[13px] border-y-transparent border-l-white/85" />
          </div>
          <div className="text-sm">
            <p className="text-text/90">{lines[0]}</p>
            <p className="mt-1 text-xs text-muted">♥ {lines[1]}</p>
          </div>
        </div>
      );
    case "contact":
      return (
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-full bg-violet/40 font-display text-lg">{lines[0]?.[0]}</span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate text-text/90">{lines[0]}</p>
            <p className="font-mono text-xs text-muted">{lines[1]}</p>
          </div>
          <span className="rounded-full border border-white/15 px-3 py-1 text-[11px]">{lines[2]}</span>
        </div>
      );
  }
}
