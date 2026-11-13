// DOM overlays for the TapStory, written straight to element styles from the render loop (never through React
// state). The iOS banner lives in a 390×846 "screen layer" that is mapped onto the projected phone display with
// a perspective homography (CSS matrix3d), so the HTML banner sits exactly on the 3D screen at any angle.

import { clamp01, easeOutBack, easeOutCubic, type ScalarFrame as Frame } from "./timeline";

export const SCREEN_LAYER = { width: 390, height: 846 } as const;

export type OverlayRefs = {
  stage: HTMLElement | null;
  screenLayer: HTMLElement | null;
  banner: HTMLElement | null;
  touch: HTMLElement | null;
  toast: HTMLElement | null;
  note: HTMLElement | null;
  steps: (HTMLElement | null)[];
};

export type StyleCache = Map<string, string>;

function set(cache: StyleCache, el: HTMLElement | null, key: string, prop: string, value: string) {
  if (!el) return;
  const k = key + prop;
  if (cache.get(k) === value) return;
  cache.set(k, value);
  if (prop.startsWith("--")) el.style.setProperty(prop, value);
  else (el.style as unknown as Record<string, string>)[prop] = value;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

// ---- homography ----------------------------------------------------------------------------------------------
type M3 = number[];
const adj = (m: M3): M3 => [
  m[4] * m[8] - m[5] * m[7],
  m[2] * m[7] - m[1] * m[8],
  m[1] * m[5] - m[2] * m[4],
  m[5] * m[6] - m[3] * m[8],
  m[0] * m[8] - m[2] * m[6],
  m[2] * m[3] - m[0] * m[5],
  m[3] * m[7] - m[4] * m[6],
  m[1] * m[6] - m[0] * m[7],
  m[0] * m[4] - m[1] * m[3],
];
const mulMM = (a: M3, b: M3): M3 => {
  const c: M3 = [];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += a[3 * i + k] * b[3 * k + j];
      c[3 * i + j] = s;
    }
  return c;
};
const mulMV = (m: M3, v: number[]) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
function basisToPoints(p: number[]): M3 {
  const m = [p[0], p[2], p[4], p[1], p[3], p[5], 1, 1, 1];
  const v = mulMV(adj(m), [p[6], p[7], 1]);
  return mulMM(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
}

/**
 * CSS matrix3d mapping a w×h box (transform-origin 0 0) onto 4 points: top-left, top-right, bottom-left,
 * bottom-right (stage CSS px). Returns null for degenerate quads.
 */
export function quadToMatrix3d(w: number, h: number, dst: number[]): string | null {
  const s = basisToPoints([0, 0, w, 0, 0, h, w, h]);
  const d = basisToPoints(dst);
  const t = mulMM(d, adj(s));
  if (!Number.isFinite(t[8]) || Math.abs(t[8]) < 1e-9) return null;
  for (let i = 0; i < 9; i++) t[i] /= t[8];
  const m = [t[0], t[3], 0, t[6], t[1], t[4], 0, t[7], 0, 0, 1, 0, t[2], t[5], 0, t[8]];
  if (m.some((x) => !Number.isFinite(x))) return null;
  return `matrix3d(${m.map((x) => x.toFixed(6)).join(",")})`;
}

/** Places the screen layer on the projected display quad (or hides it). */
export function placeScreenLayer(refs: OverlayRefs, cache: StyleCache, quad: number[] | null, visible: boolean) {
  const el = refs.screenLayer;
  if (!el) return;
  const m = visible && quad ? quadToMatrix3d(SCREEN_LAYER.width, SCREEN_LAYER.height, quad) : null;
  if (!m) {
    set(cache, el, "layer", "visibility", "hidden");
    return;
  }
  set(cache, el, "layer", "visibility", "visible");
  set(cache, el, "layer", "transform", m);
}

/** Banner: drop (with overshoot) → pressed → expands into the app. */
export function applyBanner(refs: OverlayRefs, cache: StyleCache, f: Frame) {
  const { drop, press, out } = f.banner;
  const shown = drop > 0 && out < 1;
  set(cache, refs.banner, "banner", "visibility", shown ? "visible" : "hidden");
  if (!shown) return;
  const y = -150 * (1 - easeOutBack(clamp01(drop), 1.25));
  const scale = (1 - 0.035 * press) * (1 + 0.06 * easeOutCubic(out));
  const opacity = clamp01(drop * 3) * (1 - easeOutCubic(out));
  set(
    cache,
    refs.banner,
    "banner",
    "transform",
    `translate3d(0, ${r3(y - 30 * easeOutCubic(out))}%, 0) scale(${r3(scale)})`,
  );
  set(cache, refs.banner, "banner", "opacity", String(r3(opacity)));
  set(cache, refs.banner, "banner", "--press", String(r3(press)));
  set(cache, refs.touch, "touch", "opacity", String(r3(press * 0.9)));
  set(cache, refs.touch, "touch", "transform", `translate(-50%, -50%) scale(${r3(0.6 + 0.5 * press)})`);
}

/** "+1 review" toast anchored to a point (stage px) and scaled with the phone. */
export function applyToast(refs: OverlayRefs, cache: StyleCache, f: Frame, x: number, y: number, scale: number) {
  const t = f.toast;
  set(cache, refs.toast, "toast", "visibility", t > 0 ? "visible" : "hidden");
  if (t <= 0) return;
  const pop = easeOutBack(clamp01(t), 2.2);
  const s = scale * (0.55 + 0.45 * pop);
  set(cache, refs.toast, "toast", "opacity", String(r3(clamp01(t * 2.5))));
  set(
    cache,
    refs.toast,
    "toast",
    "transform",
    `translate3d(${r3(x)}px, ${r3(y)}px, 0) translate(-50%, -50%) scale(${r3(s)})`,
  );
}

/** Caption steps, intro, illustrative-demo note and the progress rail. */
export function applyCaptions(refs: OverlayRefs, cache: StyleCache, f: Frame, p: number) {
  set(cache, refs.stage, "stage", "--p", String(r3(p)));
  set(cache, refs.stage, "stage", "--intro", String(r3(f.intro)));
  refs.steps.forEach((el, i) => {
    const b = f.stepBlend[i] ?? 0;
    set(cache, el, `step${i}`, "--on", String(r3(b)));
    if (el) {
      const active = f.step === i ? "true" : "false";
      if (el.dataset.active !== active) el.dataset.active = active;
    }
  });
  set(cache, refs.note, "note", "opacity", String(r3(clamp01((p - 0.7) / 0.04))));
}
