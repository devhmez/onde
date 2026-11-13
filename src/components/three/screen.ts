import * as THREE from "three";
import { phoneTextures, type ThreeLocaleKey } from "./config";

// The phone display is a CanvasTexture composed, in story order, from (all 1179×2556, localized FR/EN):
//  - lock-<l>.webp   ONDE lock screen (a painted wallpaper stands in until it has loaded),
//  - safari-<l>.webp the onde.tn/t/A7K92X smart link loading in Safari (progress bar drawn live),
//  - review-A-<l>.webp ONDE's own Google review sheet (empty stars), progressively overwritten by the regions of
//  - review-B-<l>.webp (5 gold stars, typed review, blue Post) listed in /textures/phone/regions.json.
// The NFC banner itself is a DOM element mapped onto the display (overlay.ts). Safari grows out of the banner,
// the review page replaces it once the redirect completes, stars pop one by one, the review is "typed" glyph by
// glyph (glyph boundaries are measured from review-B's pixels at load time) and Post turns blue. The canvas is
// only re-uploaded when the quantized visual state changes.

type Box = [x: number, y: number, w: number, h: number];
export type PhoneRegions = { size: [number, number]; stars: Box[]; text: Box; post: Box };

export type ScreenState = {
  /** 0..1 — Safari opens from the banner; its loading bar follows `safariLoad`. */
  safari: number;
  /** 0..1 — loading bar of the onde.tn redirect. */
  safariLoad: number;
  /** 0 = previous page, 1 = Google review page fully shown. */
  open: number;
  /** 0..5 — star i is filled by (stars - i) clamped to 0..1. */
  stars: number;
  /** 0..1 — fraction of the review text typed. */
  typing: number;
  /** 0..1 — Post button grey → blue. */
  post: number;
};

type Line = { top: number; bottom: number; cuts: number[] };

const FONT = `-apple-system, "SF Pro Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
const SRC_W = 1179;
const SRC_H = 2556;
/** Safari loading bar (texture px): bottom edge of the address bar. */
const LOAD_BAR: Box = [60, 2377, 1059, 8];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export class ReviewScreen {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  readonly width: number;
  readonly height: number;
  ready = false;

  private ctx: CanvasRenderingContext2D;
  private layer: HTMLCanvasElement;
  private lctx: CanvasRenderingContext2D;
  private wallpaper: HTMLCanvasElement;
  private lock: HTMLImageElement | null = null;
  private safari: HTMLImageElement | null = null;
  private a: HTMLImageElement | null = null;
  private b: HTMLImageElement | null = null;
  private regions: PhoneRegions | null = null;
  private lines: Line[] = [];
  private glyphCount = 0;
  private bg = "rgb(255,255,255)";
  private signature = "";
  private k: number;
  private loading: Promise<void> | null = null;
  private locale: ThreeLocaleKey;

  constructor(width: number, anisotropy = 4, locale: ThreeLocaleKey = "fr") {
    this.locale = locale;
    this.width = Math.round(width);
    this.height = Math.round((width * SRC_H) / SRC_W);
    this.k = this.width / SRC_W;
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext("2d")!;
    this.layer = document.createElement("canvas");
    this.layer.width = this.width;
    this.layer.height = this.height;
    this.lctx = this.layer.getContext("2d")!;
    this.wallpaper = this.paintWallpaper();
    this.ctx.drawImage(this.wallpaper, 0, 0);

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.flipY = false; // glTF UV convention (v = 0 at the top of the artwork)
    this.texture.anisotropy = anisotropy;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
  }

  /** Loads every screen once (idempotent; safe to call again after a StrictMode remount). */
  load(): Promise<void> {
    if (!this.loading) this.loading = this.loadOnce();
    return this.loading;
  }

  private async loadOnce(): Promise<void> {
    const src = phoneTextures(this.locale);
    // the lock screen is needed first — swap it in as soon as it arrives
    loadImage(src.lock)
      .then((img) => {
        this.lock = img;
        const g = this.wallpaper.getContext("2d")!;
        g.drawImage(img, 0, 0, this.width, this.height);
        this.signature = "";
      })
      .catch(() => undefined);
    const [safari, a, b, regions] = await Promise.all([
      loadImage(src.safari),
      loadImage(src.a),
      loadImage(src.b),
      fetch(src.regions).then((r) => r.json() as Promise<PhoneRegions>),
    ]);
    this.safari = safari;
    this.a = a;
    this.b = b;
    this.regions = regions;
    this.measureGlyphs();
    this.ready = true;
    this.signature = "";
  }

  /** Measures the typed review in review-B: text lines and the right edge of every glyph run. */
  private measureGlyphs() {
    if (!this.b || !this.regions) return;
    const [tx, ty, tw, th] = this.regions.text;
    const c = document.createElement("canvas");
    c.width = tw;
    c.height = th;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(this.b, tx, ty, tw, th, 0, 0, tw, th);
    let data: Uint8ClampedArray;
    try {
      data = g.getImageData(0, 0, tw, th).data;
    } catch {
      this.lines = [{ top: ty, bottom: ty + th, cuts: Array.from({ length: 40 }, (_, i) => ((i + 1) / 40) * tw) }];
      this.glyphCount = 40;
      return;
    }
    const bi = ((th - 2) * tw + (tw - 2)) * 4;
    const bgR = data[bi],
      bgG = data[bi + 1],
      bgB = data[bi + 2];
    this.bg = `rgb(${bgR},${bgG},${bgB})`;
    const ink = (x: number, y: number) => {
      const i = (y * tw + x) * 4;
      return Math.abs(data[i] - bgR) + Math.abs(data[i + 1] - bgG) + Math.abs(data[i + 2] - bgB) > 90;
    };
    // text bands
    const rows: boolean[] = [];
    for (let y = 0; y < th; y++) {
      let any = false;
      for (let x = 0; x < tw && !any; x++) any = ink(x, y);
      rows.push(any);
    }
    const bands: [number, number][] = [];
    rows.forEach((on, y) => {
      if (!on) return;
      const last = bands[bands.length - 1];
      if (last && y - last[1] <= 3) last[1] = y;
      else bands.push([y, y]);
    });
    const lines: Line[] = [];
    bands.forEach(([y0, y1], i) => {
      const cuts: number[] = [];
      let inRun = false;
      for (let x = 0; x <= tw; x++) {
        let on = false;
        if (x < tw) for (let y = y0; y <= y1 && !on; y++) on = ink(x, y);
        if (on) inRun = true;
        else if (inRun) {
          cuts.push(x);
          inRun = false;
        }
      }
      const prev = bands[i - 1];
      const next = bands[i + 1];
      const top = prev ? Math.round((prev[1] + y0) / 2) : 0;
      const bottom = next ? Math.round((y1 + next[0]) / 2) : th;
      lines.push({ top: ty + top, bottom: ty + bottom, cuts: cuts.map((x) => tx + x) });
    });
    this.lines = lines;
    this.glyphCount = lines.reduce((n, l) => n + l.cuts.length, 0);
  }

  /** Stand-in lock screen until lock-<l>.webp has loaded. */
  private paintWallpaper(): HTMLCanvasElement {
    const W = this.width,
      H = this.height,
      k = this.k;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    const rad = g.createRadialGradient(W * 0.5, H * 1.1, 0, W * 0.5, H * 1.1, H * 1.05);
    rad.addColorStop(0, "#7B5CFF");
    rad.addColorStop(0.3, "#461CF7");
    rad.addColorStop(0.62, "#1A0B5C");
    rad.addColorStop(1, "#07060B");
    g.fillStyle = rad;
    g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(255,255,255,0.94)";
    g.textAlign = "center";
    g.textBaseline = "alphabetic";
    g.font = `700 ${Math.round(288 * k)}px ${FONT}`;
    g.fillText("9:41", W / 2, 690 * k);
    g.fillStyle = "#000";
    roundRect(g, 404 * k, 33 * k, 371 * k, 108 * k, 54 * k);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.85)";
    roundRect(g, 392 * k, 2486 * k, 395 * k, 15 * k, 7.5 * k);
    g.fill();
    return c;
  }

  private drawSafari(g: CanvasRenderingContext2D, load: number) {
    const k = this.k;
    g.drawImage(this.safari!, 0, 0, this.width, this.height);
    const [x, y, w, h] = LOAD_BAR;
    const f = clamp01(load);
    if (f > 0 && f < 1) {
      g.fillStyle = "#461CF7";
      roundRect(g, x * k, y * k, Math.max(h, w * easeInOut(f)) * k, h * k, (h / 2) * k);
      g.fill();
    }
  }

  private drawReview(g: CanvasRenderingContext2D, s: ScreenState) {
    const a = this.a!,
      b = this.b!,
      R = this.regions!,
      k = this.k;
    g.drawImage(a, 0, 0, this.width, this.height);

    // stars — pop one by one
    const rings: { x: number; y: number; w: number; f: number }[] = [];
    R.stars.forEach(([x, y, w, h], i) => {
      const f = clamp01(s.stars - i);
      if (f <= 0) return;
      const grow = f < 0.55 ? 0.25 + 1.12 * easeOutCubic(f / 0.55) : 1.37 - 0.37 * easeInOut((f - 0.55) / 0.45);
      g.fillStyle = this.bg;
      g.fillRect(x * k, y * k, w * k, h * k);
      g.save();
      g.globalAlpha = Math.min(1, f * 4);
      const cx = (x + w / 2) * k,
        cy = (y + h / 2) * k;
      g.translate(cx, cy);
      g.scale(grow, grow);
      g.drawImage(b, x, y, w, h, (-w / 2) * k, (-h / 2) * k, w * k, h * k);
      g.restore();
      if (f < 1) rings.push({ x: cx, y: cy, w: w * k, f });
    });
    for (const r of rings) {
      const e = easeOutCubic(r.f);
      g.save();
      g.globalAlpha = (1 - r.f) * 0.85;
      g.strokeStyle = "#fabc03";
      g.lineWidth = Math.max(1, 7 * k * (1 - r.f));
      g.beginPath();
      g.arc(r.x, r.y, r.w * (0.32 + 0.5 * e), 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = "#fabc03";
      for (let j = 0; j < 6; j++) {
        const ang = (j / 6) * Math.PI * 2 + 0.3;
        const d = r.w * (0.42 + 0.45 * e);
        g.beginPath();
        g.arc(r.x + Math.cos(ang) * d, r.y + Math.sin(ang) * d, Math.max(0.5, 7 * k * (1 - r.f)), 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }

    // review text — typed glyph by glyph, with a caret
    if (s.typing > 0) {
      const [tx, ty, tw, th] = R.text;
      g.fillStyle = this.bg;
      g.fillRect(tx * k, ty * k, tw * k, th * k);
      let n = Math.round(clamp01(s.typing) * this.glyphCount);
      let caret: { x: number; top: number; bottom: number } | null = null;
      for (const line of this.lines) {
        const shown = Math.min(n, line.cuts.length);
        n -= shown;
        if (shown > 0) {
          const right = line.cuts[shown - 1] + 2;
          const w = right - tx;
          g.drawImage(b, tx, line.top, w, line.bottom - line.top, tx * k, line.top * k, w * k, (line.bottom - line.top) * k);
          caret = { x: right + 4, top: line.top, bottom: line.bottom };
        } else if (!caret) {
          caret = { x: tx + 10, top: line.top, bottom: line.bottom };
        }
        if (shown < line.cuts.length) break;
      }
      if (caret && s.post < 0.5) {
        g.fillStyle = "#1a73e8";
        const pad = (caret.bottom - caret.top) * 0.12;
        g.fillRect(caret.x * k, (caret.top + pad) * k, Math.max(1, 4 * k), (caret.bottom - caret.top - pad * 2) * k);
      }
    }

    // Post button — grey → Google blue with a soft pulse
    if (s.post > 0) {
      const [x, y, w, h] = R.post;
      const f = clamp01(s.post);
      const pulse = 1 + 0.045 * Math.sin(Math.PI * f);
      g.save();
      g.globalAlpha = f;
      g.translate((x + w / 2) * k, (y + h / 2) * k);
      g.scale(pulse, pulse);
      g.drawImage(b, x, y, w, h, (-w / 2) * k, (-h / 2) * k, w * k, h * k);
      g.restore();
    }
  }

  /** Redraws when the quantized state changed. Returns true when the texture was updated. */
  update(state: ScreenState): boolean {
    const safari = clamp01(state.safari);
    const open = clamp01(state.open);
    const q = this.ready
      ? [
          Math.round(safari * 40),
          safari > 0 ? Math.round(clamp01(state.safariLoad) * 40) : 0,
          Math.round(open * 32),
          open > 0 ? Math.round(state.stars * 20) : 0,
          open > 0 ? Math.round(clamp01(state.typing) * this.glyphCount) + (state.typing > 0 ? 1 : 0) : 0,
          open > 0 ? Math.round(clamp01(state.post) * 24) : 0,
        ].join("|")
      : this.lock
        ? "lock"
        : "wall";
    if (q === this.signature) return false;
    this.signature = q;

    const g = this.ctx;
    const W = this.width,
      H = this.height,
      k = this.k;
    if (!this.ready || (safari <= 0 && open <= 0)) {
      g.drawImage(this.wallpaper, 0, 0);
    } else if (open >= 1) {
      this.drawReview(g, state);
    } else if (open > 0) {
      // redirect lands: Google's page replaces Safari's loader with a quick slide-up + fade
      this.drawSafari(g, 1);
      this.drawReview(this.lctx, state);
      const e = easeOutCubic(open);
      g.save();
      g.globalAlpha = Math.min(1, open * 1.8);
      g.drawImage(this.layer, 0, H * 0.06 * (1 - e), W, H);
      g.restore();
    } else if (safari >= 1) {
      this.drawSafari(g, state.safariLoad);
    } else {
      // "app opening": Safari grows out of the banner at the top of the screen with rounded corners
      this.drawSafari(this.lctx, state.safariLoad);
      g.drawImage(this.wallpaper, 0, 0);
      const e = easeOutCubic(safari);
      const bx = 30 * k,
        by = 70 * k,
        bw = W - 60 * k,
        bh = 250 * k; // banner footprint (matches the DOM banner)
      const x = bx * (1 - e),
        y = by * (1 - e),
        w = bw + (W - bw) * e,
        h = bh + (H - bh) * e;
      g.save();
      roundRect(g, x, y, w, h, 70 * k * (1 - e) + 8 * k);
      g.clip();
      g.globalAlpha = Math.min(1, safari * 2.2);
      const sc = w / W; // uniform scale, clipped to the growing card
      g.drawImage(this.layer, x, y, W * sc, H * sc);
      g.restore();
    }
    this.texture.needsUpdate = true;
    return true;
  }

  /** Releases the GPU copy; the canvas stays valid so a remounted scene can upload it again. */
  dispose() {
    this.texture.dispose();
    this.signature = "";
  }
}
