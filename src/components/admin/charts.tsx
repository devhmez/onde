"use client";
// Hand-rolled SVG/HTML charts in the film's style: violet gradient area with a glowing live end-point,
// crosshair + tooltip on hover/keyboard, left-to-right draw-on reveal. No chart library needed.
import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatDT } from "@/lib/business";

type Fmt = "int" | "money";
const intFmt = new Intl.NumberFormat("en-US");
const fmt = (v: number, f: Fmt) => (f === "money" ? formatDT(Math.round(v), "en") : intFmt.format(Math.round(v)));

const VW = 1000;
const VH = 150;
const TOP = 14;
const BOT = 136;

function monotonePath(pts: [number, number][]) {
  const n = pts.length;
  if (n === 0) return "";
  const r = (v: number) => Math.round(v * 100) / 100;
  if (n === 1) return `M0,${r(pts[0][1])} L${VW},${r(pts[0][1])}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0];
    m[i] = (pts[i + 1][1] - pts[i][1]) / (dx[i] || 1);
  }
  const t: number[] = new Array(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const h = a * a + b * b;
    if (h > 9) {
      const tau = 3 / Math.sqrt(h);
      t[i] = tau * a * m[i];
      t[i + 1] = tau * b * m[i];
    }
  }
  let d = `M${r(pts[0][0])},${r(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${r(pts[i][0] + h)},${r(pts[i][1] + t[i] * h)} ${r(pts[i + 1][0] - h)},${r(pts[i + 1][1] - t[i + 1] * h)} ${r(pts[i + 1][0])},${r(pts[i + 1][1])}`;
  }
  return d;
}

export type Series = { key: string; label: string; color: string; values: number[]; area?: boolean };

export function AreaChart({
  labels,
  series,
  height = 190,
  format = "int",
  emptyText = "No data yet.",
  ariaLabel,
  showAxis = false,
  marginTop,
}: {
  labels: string[];
  series: Series[];
  height?: number;
  format?: Fmt;
  emptyText?: string;
  ariaLabel: string;
  showAxis?: boolean;
  marginTop?: number;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [idx, setIdx] = useState<number | null>(null);
  const n = labels.length;

  const geo = useMemo(() => {
    const max = Math.max(1, ...series.flatMap((s) => s.values));
    const x = (i: number) => (n <= 1 ? VW : (i / (n - 1)) * VW);
    const y = (v: number) => TOP + (1 - v / max) * (BOT - TOP);
    return series.map((s) => {
      const pts = s.values.map((v, i) => [x(i), y(v)] as [number, number]);
      const line = monotonePath(pts);
      return { ...s, pts, line, areaPath: line ? `${line} L${VW},${VH} L0,${VH} Z` : "" };
    });
  }, [series, n]);

  const empty = series.every((s) => s.values.every((v) => !v));
  const last = geo[0]?.pts[geo[0].pts.length - 1];

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (n === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setIdx(Math.round(f * (n - 1)));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (n === 0) return;
    if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, (i ?? n - 1) - 1));
    else if (e.key === "ArrowRight") setIdx((i) => Math.min(n - 1, (i ?? n - 1) + 1));
    else if (e.key === "Home") setIdx(0);
    else if (e.key === "End") setIdx(n - 1);
    else return;
    e.preventDefault();
  };

  const xPct = (i: number) => (n <= 1 ? 100 : (i / (n - 1)) * 100);
  const yPx = (vy: number) => (vy / VH) * height;

  return (
    <div style={marginTop !== undefined ? { marginTop } : undefined} className="chart-outer">
      <div
        className="chart"
        style={{ height, marginTop: marginTop !== undefined ? 0 : undefined }}
        role="group"
        aria-label={`${ariaLabel}. Use left and right arrow keys to read values.`}
        tabIndex={0}
        onPointerMove={onMove}
        onPointerLeave={() => setIdx(null)}
        onKeyDown={onKey}
        onFocus={() => setIdx((i) => i ?? n - 1)}
        onBlur={() => setIdx(null)}
      >
        <div className="reveal" style={{ height }}>
          <svg width="100%" height={height} viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" aria-hidden>
            <defs>
              {geo.map((s, i) => (
                <linearGradient key={s.key} id={`g${uid}${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={i === 0 ? "#7B5CFF" : s.color} stopOpacity={i === 0 ? 0.45 : 0.22} />
                  <stop offset="1" stopColor={i === 0 ? "#461CF7" : s.color} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>
            <g stroke="#1F1E28" strokeWidth="1">
              <line x1="0" y1="30" x2={VW} y2="30" vectorEffect="non-scaling-stroke" />
              <line x1="0" y1="75" x2={VW} y2="75" vectorEffect="non-scaling-stroke" />
              <line x1="0" y1="120" x2={VW} y2="120" vectorEffect="non-scaling-stroke" />
            </g>
            {geo.map((s, i) =>
              s.area !== false && s.areaPath ? <path key={`a${s.key}`} d={s.areaPath} fill={`url(#g${uid}${i})`} /> : null,
            )}
            {geo.map((s) =>
              s.line ? (
                <path
                  key={`l${s.key}`}
                  d={s.line}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null,
            )}
          </svg>
        </div>
        {last && !empty && idx === null ? <span className="chart-end" style={{ left: "100%", top: yPx(last[1]) }} aria-hidden /> : null}
        {idx !== null && n > 0 ? (
          <>
            <span className="chart-cross" style={{ left: `${xPct(idx)}%` }} aria-hidden />
            {geo.map((s) => (
              <span key={`d${s.key}`} className="chart-dot" style={{ left: `${xPct(idx)}%`, top: yPx(s.pts[idx]?.[1] ?? BOT), background: s.color }} aria-hidden />
            ))}
            <div
              className="chart-tip"
              role="status"
              style={{
                left: `${xPct(idx)}%`,
                transform: idx > (n - 1) / 2 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
              }}
            >
              <div className="d">{labels[idx]}</div>
              {geo.map((s) => (
                <div className="r" key={`t${s.key}`}>
                  <i className="key" style={{ background: s.color }} />
                  <b>{fmt(s.values[idx] ?? 0, format)}</b>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          </>
        ) : null}
        {empty ? <div className="chart-empty">{emptyText}</div> : null}
      </div>
      {showAxis && n > 1 ? (
        <div className="chart-axis" aria-hidden>
          <span>{labels[0]}</span>
          <span>{labels[Math.floor((n - 1) / 2)]}</span>
          <span>{labels[n - 1]}</span>
        </div>
      ) : null}
    </div>
  );
}

export function BarChart({
  labels,
  values,
  format = "int",
  color = "var(--s1)",
  height = 170,
  ariaLabel,
  seriesLabel,
  emptyText = "No data yet.",
}: {
  labels: string[];
  values: number[];
  format?: Fmt;
  color?: string;
  height?: number;
  ariaLabel: string;
  seriesLabel: string;
  emptyText?: string;
}) {
  const [idx, setIdx] = useState<number | null>(null);
  const n = values.length;
  const max = Math.max(1, ...values);
  const empty = values.every((v) => !v);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, (i ?? n - 1) - 1));
    else if (e.key === "ArrowRight") setIdx((i) => Math.min(n - 1, (i ?? n - 1) + 1));
    else return;
    e.preventDefault();
  };
  return (
    <div style={{ position: "relative" }}>
      <div
        className="bars"
        style={{ height }}
        role="group"
        aria-label={`${ariaLabel}. Use left and right arrow keys to read values.`}
        tabIndex={0}
        onKeyDown={onKey}
        onFocus={() => setIdx((i) => i ?? n - 1)}
        onBlur={() => setIdx(null)}
        onPointerLeave={() => setIdx(null)}
      >
        {values.map((v, i) => (
          <div key={i} className={`b${v ? "" : " zero"}`} onPointerEnter={() => setIdx(i)}>
            <i
              style={{
                height: `${v ? Math.max(2, (v / max) * 100) : 1.5}%`,
                background: v ? (idx === i ? "var(--vio3)" : color) : undefined,
                animationDelay: `${Math.min(i * 12, 500)}ms`,
              }}
            />
          </div>
        ))}
        {idx !== null && n > 0 ? (
          <div
            className="chart-tip"
            role="status"
            style={{
              left: `${((idx + 0.5) / n) * 100}%`,
              top: -8,
              transform: idx > (n - 1) / 2 ? "translate(calc(-100% - 10px), -100%)" : "translate(10px, -100%)",
            }}
          >
            <div className="d">{labels[idx]}</div>
            <div className="r">
              <i className="key" style={{ background: color }} />
              <b>{fmt(values[idx] ?? 0, format)}</b>
              <span>{seriesLabel}</span>
            </div>
          </div>
        ) : null}
        {empty ? <div className="chart-empty">{emptyText}</div> : null}
      </div>
      {n > 1 ? (
        <div className="chart-axis" aria-hidden>
          <span>{labels[0]}</span>
          <span>{labels[Math.floor((n - 1) / 2)]}</span>
          <span>{labels[n - 1]}</span>
        </div>
      ) : null}
    </div>
  );
}

export type Slice = { label: string; value: number; color: string };

export function Donut({ items, unit, ariaLabel }: { items: Slice[]; unit: string; ariaLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = items.reduce((s, i) => s + i.value, 0);
  const R = 40;
  const C = 2 * Math.PI * R;
  const GAP = total > 0 && items.filter((i) => i.value > 0).length > 1 ? 1.4 : 0;
  const arcs = items.reduce<(Slice & { len: number; start: number })[]>((out, it) => {
    const prev = out[out.length - 1];
    out.push({ ...it, len: total ? (it.value / total) * C : 0, start: prev ? prev.start + prev.len : 0 });
    return out;
  }, []);
  const shown = hover !== null ? items[hover] : null;
  const pct = (v: number) => (total ? `${Math.round((v / total) * 100)}%` : "0%");
  return (
    <div className="donut-wrap" role="group" aria-label={ariaLabel}>
      <div className="donut">
        <svg viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r={R} fill="none" stroke="#1d1c25" strokeWidth="12" />
          {arcs.map((a, i) =>
            a.len > 0 ? (
              <circle
                key={a.label}
                className="seg-arc"
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={a.color}
                strokeWidth={hover === i ? 14 : 12}
                strokeDasharray={`${Math.max(0.01, a.len - GAP)} ${C - Math.max(0.01, a.len - GAP)}`}
                strokeDashoffset={-a.start}
                opacity={hover === null || hover === i ? 1 : 0.45}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
              />
            ) : null,
          )}
        </svg>
        <div className="center">
          <b>{shown ? pct(shown.value) : intFmt.format(total)}</b>
          <span>{shown ? shown.label : unit}</span>
        </div>
      </div>
      <ul className="dlist">
        {items.map((it, i) => (
          <li
            key={it.label}
            tabIndex={0}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
          >
            <i style={{ background: it.color }} />
            {it.label}
            <b>{intFmt.format(it.value)}</b>
            <span className="pc">{pct(it.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SplitBar({ items, ariaLabel }: { items: Slice[]; ariaLabel: string }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <div role="group" aria-label={ariaLabel}>
      <div className="split" aria-hidden>
        {total === 0 ? null : items.map((it) => (it.value ? <i key={it.label} style={{ width: `${(it.value / total) * 100}%`, background: it.color }} /> : null))}
      </div>
      <div className="split-legend">
        {items.map((it) => (
          <div key={it.label}>
            <span>
              <i style={{ background: it.color }} />
              {it.label}
            </span>
            <b>{total ? `${Math.round((it.value / total) * 100)}%` : "—"}</b>
            <span>{intFmt.format(it.value)} taps</span>
          </div>
        ))}
      </div>
    </div>
  );
}
