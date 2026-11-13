"use client";
// 30-day taps column chart (single series, so no legend: the card title names it). HTML/CSS bars — crisp at any
// width, no chart library. Hover / tap / horizontal drag / keyboard (← → Home End) show one tooltip per day; the same
// numbers are in the table view under the chart, so the tooltip never gates a value.
//   • Mouse: follows the pointer, hides when it leaves.
//   • Touch: a tap (or a sideways drag) shows the day; it hides by itself after a moment, as soon as the page scrolls,
//     and never appears when a finger only scrolls past the chart (pointercancel).
//   • The tooltip lives in a strip reserved above the bars, so it never covers the card's title.
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

const TOUCH_TIP_MS = 2500;

export type ChartPoint = { label: string; long: string; value: number };

/** Round a maximum up to a clean axis value: 0–5 stays, then 1/2/2.5/5 × 10^n. */
function niceMax(max: number): number {
  if (max <= 5) return Math.max(1, max);
  const p = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= max) return m * p;
  return 10 * p;
}

export default function TapsChart({
  points,
  ariaLabel,
  tapOne,
  tapMany,
  todayLabel,
  numberLocale,
}: {
  points: ChartPoint[];
  ariaLabel: string;
  tapOne: string;
  tapMany: string;
  todayLabel: string;
  numberLocale: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [touchTip, setTouchTip] = useState(false);
  const plot = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; scrub: boolean } | null>(null);
  const timer = useRef<number | null>(null);
  const liveId = useId();
  const n = points.length;
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const half = max / 2;
  const nf = new Intl.NumberFormat(numberLocale);
  const taps = (v: number) => (v === 1 ? tapOne : tapMany.replace("{n}", nf.format(v)));

  const indexAt = (clientX: number) => {
    const el = plot.current;
    if (!el || !n) return null;
    const r = el.getBoundingClientRect();
    const i = Math.floor(((clientX - r.left) / r.width) * n);
    return Math.max(0, Math.min(n - 1, i));
  };
  const stopTimer = useCallback(() => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const hide = useCallback(() => {
    stopTimer();
    gesture.current = null;
    setActive(null);
    setTouchTip(false);
  }, [stopTimer]);
  const showTouch = (clientX: number, autoHide: boolean) => {
    stopTimer();
    setActive(indexAt(clientX));
    setTouchTip(true);
    if (autoHide) timer.current = window.setTimeout(hide, TOUCH_TIP_MS);
  };

  // A tooltip opened by a finger goes away as soon as the page scrolls.
  useEffect(() => {
    if (!touchTip) return;
    window.addEventListener("scroll", hide, { passive: true });
    return () => window.removeEventListener("scroll", hide);
  }, [touchTip, hide]);
  useEffect(() => stopTimer, [stopTimer]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") {
      setActive(indexAt(e.clientX));
      return;
    }
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, scrub: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") {
      setActive(indexAt(e.clientX));
      return;
    }
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = Math.abs(e.clientX - g.x);
    if (!g.scrub && dx > 8 && dx > Math.abs(e.clientY - g.y)) g.scrub = true; // sideways: scrub the days
    if (g.scrub) showTouch(e.clientX, false);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") return;
    const g = gesture.current;
    gesture.current = null;
    if (g && g.id === e.pointerId) showTouch(e.clientX, true); // a tap, or the end of a scrub
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = active ?? n - 1;
    let next: number | null = cur;
    if (e.key === "ArrowLeft") next = Math.max(0, cur - 1);
    else if (e.key === "ArrowRight") next = Math.min(n - 1, cur + 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else if (e.key === "Escape") next = null;
    else return;
    e.preventDefault();
    setActive(next);
  };

  const a = active != null ? points[active] : null;
  const tipLeft = active != null ? ((active + 0.5) / n) * 100 : 0;

  return (
    <div className="tc">
      <div className="tc-y" aria-hidden>
        <span style={{ bottom: "100%" }}>{nf.format(max)}</span>
        {Number.isInteger(half) && half > 0 ? <span style={{ bottom: "50%" }}>{nf.format(half)}</span> : null}
        <span style={{ bottom: "0%" }}>0</span>
      </div>
      <div className="tc-main">
        <div
          ref={plot}
          className="tc-plot"
          role="img"
          aria-label={ariaLabel}
          aria-describedby={liveId}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={hide}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setActive(null);
          }}
          onFocus={(e) => {
            // Keyboard focus only: a tap also focuses the plot, and its tooltip is handled by the pointer events.
            if (e.currentTarget.matches(":focus-visible")) setActive((v) => v ?? n - 1);
          }}
          onBlur={hide}
          onKeyDown={(e) => {
            setTouchTip(false);
            stopTimer();
            onKey(e);
          }}
        >
          <div className="tc-field" aria-hidden>
            <i className="tc-grid" style={{ bottom: "100%" }} />
            {Number.isInteger(half) && half > 0 ? <i className="tc-grid" style={{ bottom: "50%" }} /> : null}
            <i className="tc-base" />
            <div className="tc-bars">
              {points.map((p, i) => (
                <div key={p.label + i} className={`tc-col${i === n - 1 ? " today" : ""}${i === active ? " on" : ""}`}>
                  {p.value > 0 ? <i style={{ height: `${Math.max(1.5, (p.value / max) * 100)}%` }} /> : null}
                </div>
              ))}
            </div>
          </div>
          {a ? (
            <div className={`tc-tip${tipLeft < 18 ? " l" : tipLeft > 82 ? " r" : ""}`} style={{ left: `${tipLeft}%` }} aria-hidden>
              <b>{taps(a.value)}</b>
              <span>{active === n - 1 ? todayLabel : a.label}</span>
            </div>
          ) : null}
        </div>
        <div className="tc-x" aria-hidden>
          <span>{points[0]?.label}</span>
          <span>{points[Math.floor((n - 1) / 2)]?.label}</span>
          <span>{todayLabel}</span>
        </div>
      </div>
      <span id={liveId} className="pt-sr" aria-live="polite">
        {a ? `${a.long} — ${taps(a.value)}` : ""}
      </span>
    </div>
  );
}
