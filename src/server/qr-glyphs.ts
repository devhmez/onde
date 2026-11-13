import "server-only";
// A tiny geometric monoline "font" for the smart-link codes printed under the QR on the stand prints.
// Why not a real font: print files are rendered on the server (sharp/librsvg for PNG, hand-written PDF), and the
// production image has no system fonts — SVG <text> would render as nothing. These strokes are plain vector paths,
// identical in the PNG and the PDF, and only need the code alphabet (src/lib/business.ts CODE_ALPHABET).
//
// Glyph space: cap height 100, y grows DOWN (0 = cap line, 100 = baseline), x from 0 to the advance width `w`
// (ink may overhang `w` for optical spacing, e.g. the open right side of F).
// Arcs are circles: ["A", cx, cy, r, fromDeg, toDeg] — angles in y-down space (0 = right, 90 = down, -90 = up),
// sweeping from → to (either direction); the path is joined to the arc start with a line when needed.

type GCmd = ["M", number, number] | ["L", number, number] | ["A", number, number, number, number, number] | ["Z"];
type Glyph = { w: number; d: GCmd[] };

/** Absolute path commands (output space). C = cubic Bézier. */
export type PathCmd = ["M", number, number] | ["L", number, number] | ["C", number, number, number, number, number, number] | ["Z"];

const GLYPHS: Record<string, Glyph> = {
  A: { w: 74, d: [["M", 0, 100], ["L", 37, 0], ["L", 74, 100], ["M", 14, 64], ["L", 60, 64]] },
  C: { w: 88, d: [["M", 85.4, 14.6], ["A", 50, 50, 50, -45, -315]] },
  D: { w: 80, d: [["M", 0, 0], ["L", 0, 100], ["L", 30, 100], ["A", 30, 50, 50, 90, -90], ["L", 0, 0], ["Z"]] },
  E: { w: 62, d: [["M", 62, 0], ["L", 0, 0], ["L", 0, 100], ["L", 62, 100], ["M", 0, 50], ["L", 54, 50]] },
  F: { w: 52, d: [["M", 60, 0], ["L", 0, 0], ["L", 0, 100], ["M", 0, 50], ["L", 52, 50]] },
  G: { w: 100, d: [["M", 88.3, 17.9], ["A", 50, 50, 50, -40, -360], ["L", 56, 50]] },
  H: { w: 74, d: [["M", 0, 0], ["L", 0, 100], ["M", 74, 0], ["L", 74, 100], ["M", 0, 50], ["L", 74, 50]] },
  J: { w: 56, d: [["M", 56, 0], ["L", 56, 72], ["A", 28, 72, 28, 0, 180]] },
  K: { w: 68, d: [["M", 0, 0], ["L", 0, 100], ["M", 66, 0], ["L", 0, 62], ["M", 22, 41.3], ["L", 68, 100]] },
  M: { w: 90, d: [["M", 0, 100], ["L", 0, 0], ["L", 45, 72], ["L", 90, 0], ["L", 90, 100]] },
  N: { w: 74, d: [["M", 0, 100], ["L", 0, 0], ["L", 74, 100], ["L", 74, 0]] },
  P: { w: 64, d: [["M", 0, 100], ["L", 0, 0], ["L", 36, 0], ["A", 36, 27, 27, -90, 90], ["L", 0, 54]] },
  Q: { w: 100, d: [["M", 100, 50], ["A", 50, 50, 50, 0, 360], ["Z"], ["M", 64, 64], ["L", 100, 100]] },
  R: { w: 66, d: [["M", 0, 100], ["L", 0, 0], ["L", 36, 0], ["A", 36, 27, 27, -90, 90], ["L", 0, 54], ["M", 34, 54], ["L", 66, 100]] },
  T: { w: 70, d: [["M", 0, 0], ["L", 70, 0], ["M", 35, 0], ["L", 35, 100]] },
  U: { w: 72, d: [["M", 0, 0], ["L", 0, 64], ["A", 36, 64, 36, 180, 0], ["L", 72, 0]] },
  V: { w: 74, d: [["M", 0, 0], ["L", 37, 100], ["L", 74, 0]] },
  W: { w: 108, d: [["M", 0, 0], ["L", 27, 100], ["L", 54, 0], ["L", 81, 100], ["L", 108, 0]] },
  X: { w: 70, d: [["M", 0, 0], ["L", 70, 100], ["M", 70, 0], ["L", 0, 100]] },
  Y: { w: 74, d: [["M", 0, 0], ["L", 37, 50], ["L", 74, 0], ["M", 37, 50], ["L", 37, 100]] },
  "3": { w: 64, d: [["M", 4, 0], ["L", 60, 0], ["L", 30, 39], ["A", 32, 69, 31, -94, 150]] },
  "4": { w: 70, d: [["M", 50, 100], ["L", 50, 0], ["L", 0, 70], ["L", 70, 70]] },
  "6": { w: 68, d: [["M", 68, 66], ["A", 34, 66, 34, 0, 360], ["Z"], ["M", 52, 0], ["L", 4.6, 49]] },
  "7": { w: 62, d: [["M", 0, 0], ["L", 62, 0], ["L", 22, 100]] },
  "9": { w: 68, d: [["M", 0, 34], ["A", 34, 34, 34, 180, 540], ["Z"], ["M", 16, 100], ["L", 63.4, 51]] },
};

/** True when every character of `text` has a glyph. */
export function canDraw(text: string): boolean {
  return text.length > 0 && [...text].every((ch) => ch in GLYPHS);
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Circle arc → cubic Béziers (≤ 90° each), appended to `out` in glyph space. */
function arcToCubics(out: PathCmd[], cx: number, cy: number, r: number, a0: number, a1: number) {
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 90));
  const step = (a1 - a0) / n;
  for (let i = 0; i < n; i++) {
    const t0 = rad(a0 + i * step);
    const t1 = rad(a0 + (i + 1) * step);
    const k = (4 / 3) * Math.tan((t1 - t0) / 4) * r;
    const x0 = cx + r * Math.cos(t0);
    const y0 = cy + r * Math.sin(t0);
    const x3 = cx + r * Math.cos(t1);
    const y3 = cy + r * Math.sin(t1);
    out.push(["C", x0 - k * Math.sin(t0), y0 + k * Math.cos(t0), x3 + k * Math.sin(t1), y3 - k * Math.cos(t1), x3, y3]);
  }
}

export type TextLayout = {
  /** Path in output space (same units as `x`/`y`). */
  path: PathCmd[];
  /** Stroke width in output units. */
  strokeWidth: number;
  /** Ink bounds (stroke included) in output units. */
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

/**
 * Lay out `text` centred on `cx`, cap line at `top`, `capHeight` tall (output units), with `tracking` extra space
 * between letters (in cap-height units, default 0.42 — the design's wide caption tracking) and a stroke of `weight` × cap height.
 */
export function layoutText(text: string, opts: { cx: number; top: number; capHeight: number; tracking?: number; weight?: number }): TextLayout {
  const s = opts.capHeight / 100;
  const gap = (opts.tracking ?? 0.42) * 100;
  const chars = [...text].filter((ch) => ch in GLYPHS);
  const width = chars.reduce((sum, ch, i) => sum + GLYPHS[ch].w + (i ? gap : 0), 0);
  let pen = opts.cx / s - width / 2;
  const top = opts.top / s;
  const path: PathCmd[] = [];
  for (const ch of chars) {
    const g = GLYPHS[ch];
    const local: PathCmd[] = [];
    let cur: [number, number] | null = null;
    for (const c of g.d) {
      if (c[0] === "M" || c[0] === "L") {
        local.push([c[0], c[1], c[2]]);
        cur = [c[1], c[2]];
      } else if (c[0] === "A") {
        const [, cx, cy, r, a0, a1] = c;
        const sx = cx + r * Math.cos(rad(a0));
        const sy = cy + r * Math.sin(rad(a0));
        if (!cur) local.push(["M", sx, sy]);
        else if (Math.hypot(cur[0] - sx, cur[1] - sy) > 0.01) local.push(["L", sx, sy]);
        arcToCubics(local, cx, cy, r, a0, a1);
        cur = [cx + r * Math.cos(rad(a1)), cy + r * Math.sin(rad(a1))];
      } else {
        local.push(["Z"]);
      }
    }
    for (const c of local) {
      if (c[0] === "Z") path.push(c);
      else if (c[0] === "C") path.push(["C", (c[1] + pen) * s, (c[2] + top) * s, (c[3] + pen) * s, (c[4] + top) * s, (c[5] + pen) * s, (c[6] + top) * s]);
      else path.push([c[0], (c[1] + pen) * s, (c[2] + top) * s]);
    }
    pen += g.w + gap;
  }
  const strokeWidth = (opts.weight ?? 0.13) * opts.capHeight;
  // Ink bounds from the actual points (Bézier control points included — conservative), plus half the stroke.
  const xs: number[] = [];
  const ys: number[] = [];
  for (const c of path) {
    for (let i = 1; i + 1 < c.length; i += 2) {
      xs.push(c[i] as number);
      ys.push(c[i + 1] as number);
    }
  }
  const half = strokeWidth / 2;
  return {
    path,
    strokeWidth,
    bbox: { x0: Math.min(...xs) - half, y0: Math.min(...ys) - half, x1: Math.max(...xs) + half, y1: Math.max(...ys) + half },
  };
}

const n = (v: number) => (Math.round(v * 1000) / 1000).toString();

/** SVG path data, translated by (-dx, -dy). */
export function svgPathData(path: PathCmd[], dx = 0, dy = 0): string {
  return path
    .map((c) =>
      c[0] === "Z"
        ? "Z"
        : c[0] === "C"
          ? `C${n(c[1] - dx)} ${n(c[2] - dy)} ${n(c[3] - dx)} ${n(c[4] - dy)} ${n(c[5] - dx)} ${n(c[6] - dy)}`
          : `${c[0]}${n(c[1] - dx)} ${n(c[2] - dy)}`,
    )
    .join("");
}

/** PDF path construction operators (coordinates as-is; the caller sets the CTM). */
export function pdfPathOps(path: PathCmd[]): string {
  return path
    .map((c) =>
      c[0] === "Z"
        ? "h"
        : c[0] === "C"
          ? `${n(c[1])} ${n(c[2])} ${n(c[3])} ${n(c[4])} ${n(c[5])} ${n(c[6])} c`
          : `${n(c[1])} ${n(c[2])} ${c[0] === "M" ? "m" : "l"}`,
    )
    .join("\n");
}
