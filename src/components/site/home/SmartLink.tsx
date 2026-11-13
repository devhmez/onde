"use client";
// 6 · Smart link — animated diagram: NFC chip → permanent link → ONDE Cloud → destinations.
// Desktop: sticky stage, the active destination hops (Google Reviews → Instagram → Menu → Contact) as you
// scroll, with a phone preview of the destination. Mobile: vertical diagram that hops automatically in view.
import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import logoPaths from "@/logo-paths.json";
import { ScrollTrigger, registerGsap, prefersReducedMotion } from "@/lib/motion";
import { Eyebrow } from "../Section";
import Reveal from "../Reveal";
import type { HomeDict } from "../types";

type Props = { dict: HomeDict["smart"] };

const HOPS = [0, 1, 3, 5] as const; // Google Reviews → Instagram → Digital menu → Contact card
const SCREENS: Record<number, string> = {
  0: "/textures/phone-A.webp",
  1: "/textures/phone-social.webp",
  3: "/textures/phone-menu.webp",
  5: "/textures/phone-contact.webp",
};
const CODE = "onde.tn/t/A7K92X";

// 24×24 stroke icons
const ICONS: ReactNode[] = [
  <path key="g" d="M12 3.2l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.5l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" />,
  <g key="i">
    <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.2" cy="6.8" r="0.6" />
  </g>,
  <path key="t" d="M14.5 3.5c.3 2.3 1.9 4 4.5 4.3M14.5 3.5v11.3a3.7 3.7 0 1 1-3.7-3.7" />,
  <g key="m">
    <path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10" />
    <path d="M17 21V3c-2.2 1.3-3 3.6-3 6.5V13h3" />
  </g>,
  <g key="w">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.4 2.4 3.4 5.3 3.4 8.5S14.4 18.1 12 20.5M12 3.5C9.6 5.9 8.6 8.8 8.6 12s1 6.1 3.4 8.5" />
  </g>,
  <g key="c">
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <circle cx="9" cy="11" r="2.2" />
    <path d="M5.8 16.2c.6-1.6 1.8-2.4 3.2-2.4s2.6.8 3.2 2.4M14.5 10h4M14.5 13.5h3" />
  </g>,
];

function Icon({ i, x, y, size = 20, className }: { i: number; x: number; y: number; size?: number; className?: string }) {
  const s = size / 24;
  return (
    <g
      transform={`translate(${x} ${y}) scale(${s})`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {ICONS[i]}
    </g>
  );
}

function ChipIcon({ x, y, size }: { x: number; y: number; size: number }) {
  const s = size / 24;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill="none" stroke="#8C7BFF" strokeWidth={1.7} strokeLinecap="round">
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
      <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
    </g>
  );
}

function MiniLogo({ cx, cy, width }: { cx: number; cy: number; width: number }) {
  const s = width / 4048;
  const h = 1520 * s;
  return (
    <g transform={`translate(${cx - width / 2} ${cy - h / 2}) scale(${s})`}>
      {(["o", "n", "d", "e"] as const).map((k) => (
        <path key={k} d={logoPaths[k]} fill="#ECEBF2" fillRule="evenodd" />
      ))}
      {(["arc1", "arc2", "arc3"] as const).map((k) => (
        <path key={k} d={logoPaths[k]} fill="#7B5CFF" />
      ))}
    </g>
  );
}

function Arrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const horizontal = y1 === y2;
  const head = horizontal ? `M${x2 - 7} ${y2 - 5} L${x2} ${y2} L${x2 - 7} ${y2 + 5}` : `M${x2 - 5} ${y2 - 7} L${x2} ${y2} L${x2 + 5} ${y2 - 7}`;
  return (
    <g>
      <path d={`M${x1} ${y1} L${x2} ${y2}`} stroke="#2E2B3B" strokeWidth={1.5} />
      <path d={`M${x1} ${y1} L${x2} ${y2}`} stroke="#8C7BFF" strokeWidth={1.8} className="flow-dash" />
      <path d={head} fill="none" stroke="#8C7BFF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

/* ---------------------------------------------------------------- desktop diagram (1160 × 540) */
function DesktopDiagram({ dict, active, hop }: { dict: HomeDict["smart"]; active: number; hop: number }) {
  const dests = dict.destinations;
  const cy = (i: number) => 105 + i * 66;
  const conn = (i: number) => `M724 270 C 805 270, 800 ${cy(i)}, 880 ${cy(i)}`;
  return (
    <svg viewBox="0 0 1160 540" className="h-auto w-full" role="img" aria-label={`${dict.chip} → ${CODE} → ${dict.cloud} → ${dests[active]}`}>
      <defs>
        <linearGradient id="sl-active" x1="0" x2="1">
          <stop offset="0" stopColor="#461CF7" />
          <stop offset="1" stopColor="#8C7BFF" />
        </linearGradient>
        <radialGradient id="sl-cloud" cx="0.5" cy="0.4" r="0.7">
          <stop offset="0" stopColor="#2A1A8A" />
          <stop offset="1" stopColor="#0E0C18" />
        </radialGradient>
        <filter id="sl-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      {/* chip */}
      <rect x="20" y="225" width="180" height="90" rx="18" fill="#13121A" stroke="#2A2836" />
      <ChipIcon x={40} y={242} size={28} />
      <text x="40" y="293" fill="#ECEBF2" fontSize="17" fontWeight="600">{dict.chip}</text>
      <text x="40" y="309" fill="#8E8BA0" fontSize="12">{dict.chipSub}</text>

      <Arrow x1={204} y1={270} x2={258} y2={270} />

      {/* permanent link */}
      <text x="387" y="224" textAnchor="middle" fill="#8C7BFF" fontSize="11" fontWeight="600" letterSpacing="3.5">
        {dict.permanent.toUpperCase()}
      </text>
      <rect x="262" y="240" width="250" height="60" rx="30" fill="#13121A" stroke="#3A2F8F" />
      <text x="387" y="276" textAnchor="middle" fill="#ECEBF2" fontSize="17" fontFamily="ui-monospace, SF Mono, Menlo, monospace">
        {CODE}
      </text>

      <Arrow x1={516} y1={270} x2={570} y2={270} />

      {/* connectors */}
      {dests.map((_, i) => (
        <path key={i} d={conn(i)} fill="none" stroke="#24222E" strokeWidth={1.5} />
      ))}
      <path key={`glow-${hop}`} d={conn(active)} fill="none" stroke="#7B5CFF" strokeWidth={6} opacity={0.35} filter="url(#sl-glow)" pathLength={1} className="draw-on" />
      <path key={`line-${hop}`} d={conn(active)} fill="none" stroke="url(#sl-active)" strokeWidth={2.4} pathLength={1} className="draw-on" />
      <path d={conn(active)} fill="none" stroke="#C9BFFF" strokeWidth={2} className="flow-dash" opacity={0.7} />

      {/* cloud */}
      <circle cx="650" cy="270" r="96" fill="#461CF7" opacity="0.12" filter="url(#sl-glow)" />
      <circle cx="650" cy="270" r="74" fill="url(#sl-cloud)" stroke="#5B43E8" strokeWidth={1.5} />
      <circle cx="650" cy="270" r="82" fill="none" stroke="#8C7BFF" strokeWidth={1} opacity={0.25} />
      <MiniLogo cx={650} cy={266} width={104} />
      <text x="650" y="374" textAnchor="middle" fill="#ECEBF2" fontSize="15" fontWeight="600">{dict.cloud}</text>
      <g key={`upd-${hop}`} className="pop-in">
        <rect x="570" y="390" width="160" height="28" rx="14" fill="#2BD48A" fillOpacity="0.14" stroke="#2BD48A" strokeOpacity="0.5" />
        <circle cx="588" cy="404" r="3.5" fill="#2BD48A" />
        <text x="659" y="408.5" textAnchor="middle" fill="#2BD48A" fontSize="12" fontWeight="600">{dict.updated}</text>
      </g>

      {/* destinations */}
      {dests.map((label, i) => {
        const on = i === active;
        return (
          <g key={label}>
            <rect
              x="880"
              y={cy(i) - 25}
              width="260"
              height="50"
              rx="25"
              className="svg-fade"
              fill={on ? "#461CF7" : "#13121A"}
              stroke={on ? "#8C7BFF" : "#2A2836"}
            />
            <Icon i={i} x={900} y={cy(i) - 10} size={20} className={clsx("svg-fade", on ? "text-white" : "text-[#8E8BA0]")} />
            <text x="932" y={cy(i) + 5.5} fontSize="15" fontWeight={on ? 600 : 500} className="svg-fade" fill={on ? "#FFFFFF" : "#B9B6C8"}>
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------------------------------------------------------- mobile diagram (360 × 600) */
function MobileDiagram({ dict, active, hop }: { dict: HomeDict["smart"]; active: number; hop: number }) {
  const dests = dict.destinations;
  const rowCy = (r: number) => 440 + r * 56;
  const pos = (i: number) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    return { x: col === 0 ? 8 : 188, cy: rowCy(row), inner: col === 0 ? 172 : 188 };
  };
  const conn = (i: number) => {
    const p = pos(i);
    return `M180 356 V ${p.cy - 12} Q 180 ${p.cy} ${p.inner} ${p.cy}`;
  };
  return (
    <svg viewBox="0 0 360 600" className="h-auto w-full" role="img" aria-label={`${dict.chip} → ${CODE} → ${dict.cloud} → ${dests[active]}`}>
      <defs>
        <radialGradient id="slm-cloud" cx="0.5" cy="0.4" r="0.7">
          <stop offset="0" stopColor="#2A1A8A" />
          <stop offset="1" stopColor="#0E0C18" />
        </radialGradient>
        <filter id="slm-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      <rect x="95" y="6" width="170" height="64" rx="16" fill="#13121A" stroke="#2A2836" />
      <ChipIcon x={110} y={24} size={26} />
      <text x="146" y="35" fill="#ECEBF2" fontSize="14" fontWeight="600">{dict.chip}</text>
      <text x="146" y="52" fill="#8E8BA0" fontSize="11">{dict.chipSub}</text>

      <Arrow x1={180} y1={72} x2={180} y2={106} />
      <text x="180" y="124" textAnchor="middle" fill="#8C7BFF" fontSize="9.5" fontWeight="600" letterSpacing="3">
        {dict.permanent.toUpperCase()}
      </text>
      <rect x="40" y="134" width="280" height="48" rx="24" fill="#13121A" stroke="#3A2F8F" />
      <text x="180" y="163" textAnchor="middle" fill="#ECEBF2" fontSize="15" fontFamily="ui-monospace, SF Mono, Menlo, monospace">
        {CODE}
      </text>
      <Arrow x1={180} y1={184} x2={180} y2={220} />

      {dests.map((_, i) => (
        <path key={i} d={conn(i)} fill="none" stroke="#24222E" strokeWidth={1.4} />
      ))}
      <path key={`m-line-${hop}`} d={conn(active)} fill="none" stroke="#8C7BFF" strokeWidth={2.2} pathLength={1} className="draw-on" />

      <circle cx="180" cy="290" r="78" fill="#461CF7" opacity="0.14" filter="url(#slm-glow)" />
      <circle cx="180" cy="290" r="64" fill="url(#slm-cloud)" stroke="#5B43E8" strokeWidth={1.4} />
      <MiniLogo cx={180} cy={282} width={86} />
      <text x="180" y="320" textAnchor="middle" fill="#B9B6C8" fontSize="11" fontWeight="600">{dict.cloud}</text>
      <g key={`m-upd-${hop}`} className="pop-in">
        <rect x="214" y="222" width="142" height="24" rx="12" fill="#2BD48A" fillOpacity="0.14" stroke="#2BD48A" strokeOpacity="0.5" />
        <circle cx="226" cy="234" r="3" fill="#2BD48A" />
        <text x="291" y="237.5" textAnchor="middle" fill="#2BD48A" fontSize="10" fontWeight="600">{dict.updated}</text>
      </g>

      {dests.map((label, i) => {
        const on = i === active;
        const p = pos(i);
        return (
          <g key={label}>
            <rect x={p.x} y={p.cy - 21} width="164" height="42" rx="21" className="svg-fade" fill={on ? "#461CF7" : "#13121A"} stroke={on ? "#8C7BFF" : "#2A2836"} />
            <Icon i={i} x={p.x + 13} y={p.cy - 8} size={16} className={on ? "text-white" : "text-[#8E8BA0]"} />
            <text x={p.x + 37} y={p.cy + 4.5} fontSize="12.5" fontWeight={on ? 600 : 500} className="svg-fade" fill={on ? "#FFFFFF" : "#B9B6C8"}>
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Phone({ active, label }: { active: number; label: string }) {
  return (
    <div className="relative mx-auto aspect-[1179/2556] w-full max-w-[250px] rounded-[42px] border border-white/10 bg-[#0b0b0f] p-[9px] shadow-[0_50px_120px_-30px_rgb(70_28_247/0.6),inset_0_0_0_1px_rgb(255_255_255/0.04)]">
      <div className="relative h-full w-full overflow-hidden rounded-[34px] bg-white">
        {HOPS.map((h) => (
          <Image
            key={h}
            src={SCREENS[h]}
            alt=""
            fill
            sizes="250px"
            className={clsx(
              "object-cover transition-[opacity,scale] duration-700 ease-expo",
              h === active ? "scale-100 opacity-100" : "scale-[1.04] opacity-0",
            )}
          />
        ))}
        <div className="absolute left-1/2 top-2 h-[22px] w-[34%] -translate-x-1/2 rounded-full bg-black" aria-hidden="true" />
      </div>
      <p className="absolute -bottom-8 left-0 right-0 text-center text-[0.62rem] uppercase tracking-[0.2em] text-muted/70">{label}</p>
    </div>
  );
}

export default function SmartLink({ dict }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);
  const [hop, setHop] = useState(0);
  const active = HOPS[hop];

  // Desktop: scroll-driven hops across the tall sticky section.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    registerGsap();
    const mq = window.matchMedia("(min-width: 1024px)");
    let st: ScrollTrigger | null = null;
    const setup = () => {
      st?.kill();
      st = null;
      if (!mq.matches) return;
      st = ScrollTrigger.create({
        trigger: stage,
        start: "top top",
        end: "bottom bottom",
        onUpdate: (self) => setHop(Math.min(HOPS.length - 1, Math.floor(self.progress * HOPS.length * 0.999))),
      });
    };
    setup();
    mq.addEventListener("change", setup);
    return () => {
      mq.removeEventListener("change", setup);
      st?.kill();
    };
  }, []);

  // Mobile: auto-hop while visible (no scroll-jacking on small screens).
  useEffect(() => {
    const el = mobileRef.current;
    if (!el) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries[0]?.isIntersecting ?? false;
        if (vis && !mq.matches && !timer) {
          timer = setInterval(() => setHop((h) => (h + 1) % HOPS.length), prefersReducedMotion() ? 4000 : 2400);
        } else if (!vis) stop();
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      stop();
    };
  }, []);

  const titleBlock = (id: string) => (
    <div className="max-w-2xl">
      <Eyebrow>{dict.eyebrow}</Eyebrow>
      <h2 id={id} className="text-display mt-6 text-[clamp(2.2rem,5.2vw,4.75rem)] leading-[0.98]">
        <Reveal as="span" type="lines" className="block">
          {dict.title[0]}
        </Reveal>
        <Reveal as="span" type="lines" delay={0.12} className="block text-violet-3 text-glow">
          {dict.title[1]}
        </Reveal>
      </h2>
    </div>
  );

  return (
    <section id="smart-link" aria-labelledby="smart-title" className="relative bg-ink">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(60% 40% at 50% 30%, rgb(70 28 247 / 0.16), transparent 70%)" }}
      />

      {/* Desktop sticky stage */}
      <div ref={stageRef} className="relative hidden h-[320vh] lg:block">
        <div className="sticky top-0 flex h-[100svh] flex-col justify-center overflow-hidden">
          <div className="container-site">
            <div className="flex items-end justify-between gap-10">
              {titleBlock("smart-title")}
              <p className="max-w-md pb-2 text-[1.02rem] leading-relaxed text-muted">{dict.body}</p>
            </div>
            <div className="mt-[clamp(1.5rem,4vh,3rem)] grid grid-cols-[minmax(0,1fr)_minmax(180px,250px)] items-center gap-[clamp(2rem,4vw,4rem)]">
              <div className="max-h-[52svh]">
                <DesktopDiagram dict={dict} active={active} hop={hop} />
              </div>
              <div className="max-h-[56svh]">
                <div className="mx-auto w-[min(100%,calc(56svh*1179/2556))]">
                  <Phone active={active} label={dict.illustrative} />
                </div>
              </div>
            </div>
            <div className="mt-[clamp(1.5rem,4vh,2.5rem)] flex items-center gap-6">
              <div className="flex gap-1.5" aria-hidden="true">
                {HOPS.map((h, i) => (
                  <span key={h} className={clsx("h-1 rounded-full transition-all duration-500 ease-expo", i === hop ? "w-8 bg-violet-2" : "w-3 bg-white/15")} />
                ))}
              </div>
              <p className="text-sm text-muted" aria-live="polite">
                {dict.now} · <span className="font-semibold text-text">{dict.destinations[active]}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile / tablet */}
      <div className="container-site relative py-[clamp(5rem,12vw,8rem)] lg:hidden">
        {titleBlock("smart-title-m")}
        <p className="mt-6 text-[1rem] leading-relaxed text-muted">{dict.body}</p>
        <div ref={mobileRef} className="mx-auto mt-10 max-w-[420px]">
          <MobileDiagram dict={dict} active={active} hop={hop} />
          <p className="mt-4 text-center text-sm text-muted" aria-live="polite">
            {dict.now} · <span className="font-semibold text-text">{dict.destinations[active]}</span>
          </p>
        </div>
      </div>

      {/* Points */}
      <div className="container-site relative pb-[clamp(4rem,9vw,7rem)]">
        <Reveal type="stagger" as="ul" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {dict.points.map((p) => (
            <li key={p} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-panel/50 px-5 py-4 text-[0.95rem] text-text/85">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-2 shadow-[0_0_10px_2px_rgb(123_92_255/0.6)]" aria-hidden="true" />
              {p}
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
