import "server-only";
// Stand print files: the owner's 12 × 12 cm design (assets/print/stand12-design.png, 2000 px = 423 dpi) with one
// smart link's QR placed in the design's empty QR box (the thin grey square near the centre, detected from the
// pixels — the placeholder outline is removed). The QR encodes https://onde.tn/t/CODE?s=qr (scans count as "QR"),
// error correction Q, 4-module quiet zone, pure black on white, every module an exact block of whole pixels.
// The code is printed under the QR (≈ 2.5 mm caps, vector strokes, see ./qr-glyphs) so prints, chips and the admin match.
//
// One design per stand colour (see standVariant in src/lib/business.ts): "white" = stand12-design.png, "black" =
// stand12-design-black.png. The black design is not supplied yet: until that file exists, black stands cannot be
// printed (printDesignAvailable("black") is false and the print routes refuse them). Dropping the file in is enough —
// its box is detected the same way (thin neutral-grey square, light or mid grey) and painted white for the QR. If the
// detection cannot find it, put the box outline in a sidecar <design>.box.json: {"left":…,"top":…,"right":…,"bottom":…}.
//
//   PNG: 2000 × 2000 px, sRGB, pHYs = 423.33 dpi (12 × 12 cm).
//   PDF: 12 × 12 cm page (or 12.6 cm with 3 mm white bleed + TrimBox), design as a lossless image,
//        QR + code as true vectors in 100 % K.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";
import sharp, { type OverlayOptions } from "sharp";
import { PdfBuilder, PT_PER_CM, pdfDate, pdfString } from "./export-pdf";
import { qrMatrix, qrRuns, type QrMatrix } from "./qr";
import type { StandVariant } from "../lib/business";
import { canDraw, layoutText, pdfPathOps, svgPathData } from "./qr-glyphs";
import { smartLinkQr } from "./tags";

export type { StandVariant } from "../lib/business";

export const PRINT_SIZE_CM = 12;
export const BLEED_MM = 3;
const QUIET_MODULES = 4;
const CODE_COLOR = "#333333"; // same grey as the design's small captions ("OR SCAN QR CODE")
// The code under the QR is what the owner reads at a client's counter to sell the stand: ~2.5 mm cap height on the
// 12 cm print (7.8 % of the QR box) in a firm stroke, so C/G/Q, U/V and M/N stay distinguishable. The QR gives up
// one pixel per module for it (13 px modules ≈ 0.78 mm, ~22.6 mm wide: still an easy scan).
const CODE_CAP = 0.078;
const CODE_WEIGHT = 0.16;

/** Outline of the design's QR box: centre lines of its 1 px strokes, in design pixels. */
export type QrBox = { left: number; top: number; right: number; bottom: number };

type Base = {
  width: number;
  height: number;
  dpi: number;
  /** RGB pixels of the design with the QR box (outline included) painted white. */
  raw: Buffer;
  box: QrBox;
  icc: Buffer | null;
  /** The cleaned design for the PDF: PNG IDAT stream (PNG predictors) or plain zlib of the raw pixels. */
  pdfImage: { data: Buffer; predictor: boolean };
};

// ---------------------------------------------------------------------------------------------------------------
// QR box detection

type Run = { pos: number; from: number; to: number };

/**
 * Find the empty QR box: two long horizontal and two long vertical runs of neutral grey pixels that form a square
 * (± 3 px). Grey = every channel within [minLevel, maxLevel] and nearly equal: light grey on the white design (the
 * default range), light or mid grey on a dark design (pass a lower `minLevel`). Throws when the design has no such box
 * (e.g. a replaced design without a placeholder).
 */
export function detectQrBox(
  raw: Uint8Array,
  width: number,
  height: number,
  channels: number,
  { minLevel = 111, maxLevel = 235 }: { minLevel?: number; maxLevel?: number } = {},
): QrBox {
  const isLine = (i: number) => {
    const r = raw[i];
    const g = raw[i + 1];
    const b = raw[i + 2];
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    return mx <= maxLevel && mn >= minLevel && mx - mn < 14;
  };
  const minRun = Math.round(Math.min(width, height) * 0.1);

  const scan = (horizontal: boolean): Run[] => {
    const outer = horizontal ? height : width;
    const inner = horizontal ? width : height;
    const found: Run[] = [];
    for (let p = 0; p < outer; p++) {
      let best = 0;
      let bestFrom = 0;
      let cur = 0;
      let curFrom = 0;
      for (let q = 0; q < inner; q++) {
        const i = (horizontal ? p * width + q : q * width + p) * channels;
        if (isLine(i)) {
          if (!cur) curFrom = q;
          cur++;
          if (cur > best) {
            best = cur;
            bestFrom = curFrom;
          }
        } else cur = 0;
      }
      if (best >= minRun) found.push({ pos: p, from: bestFrom, to: bestFrom + best - 1 });
    }
    // Merge adjacent rows/columns (anti-aliased strokes) into one line: keep the longest run of each group.
    const lines: Run[] = [];
    for (const r of found) {
      const last = lines[lines.length - 1];
      if (last && r.pos - last.pos <= 2 && Math.abs(r.from - last.from) <= 3) {
        if (r.to - r.from > last.to - last.from) lines[lines.length - 1] = r;
      } else lines.push(r);
    }
    return lines;
  };

  const hs = scan(true);
  const vs = scan(false);
  const near = (a: number, b: number) => Math.abs(a - b) <= 3;
  let best: QrBox | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < hs.length; i++)
    for (let j = i + 1; j < hs.length; j++)
      for (let k = 0; k < vs.length; k++)
        for (let l = k + 1; l < vs.length; l++) {
          const [top, bottom, left, right] = [hs[i], hs[j], vs[k], vs[l]];
          const w = right.pos - left.pos;
          const h = bottom.pos - top.pos;
          if (w < minRun || Math.abs(w - h) > Math.max(3, w * 0.03)) continue;
          if (!near(top.from, left.pos) || !near(top.to, right.pos) || !near(bottom.from, left.pos) || !near(bottom.to, right.pos)) continue;
          if (!near(left.from, top.pos) || !near(left.to, bottom.pos) || !near(right.from, top.pos) || !near(right.to, bottom.pos)) continue;
          const score = Math.abs((left.pos + right.pos) / 2 - width / 2);
          if (score < bestScore) {
            bestScore = score;
            best = { left: left.pos, top: top.pos, right: right.pos, bottom: bottom.pos };
          }
        }
  if (!best) throw new Error("Print design: the empty QR box (thin grey square) was not found");
  return best;
}

// ---------------------------------------------------------------------------------------------------------------
// Layout

export type PrintLayout = {
  /** Module size in design pixels (integer — crisp edges). */
  module: number;
  qrX: number;
  qrY: number;
  /** QR width/height without quiet zone, px. */
  size: number;
  text: { cx: number; top: number; cap: number } | null;
};

/**
 * Fit the QR (+ its 4-module quiet zone) inside the box; with `withText`, the code sits one quiet zone below the QR
 * and the QR + code group is centred vertically (the box outline is removed, so the group reads as centred).
 */
export function standLayout(box: QrBox, modules: number, withText: boolean): PrintLayout {
  const x0 = box.left + 1;
  const y0 = box.top + 1;
  const bw = box.right - box.left - 1;
  const bh = box.bottom - box.top - 1;
  const b = Math.min(bw, bh);
  const cap = Math.max(10, Math.round(b * CODE_CAP));
  const pad = Math.round(b * 0.045);
  let m = Math.floor(b / (modules + 2 * QUIET_MODULES));
  if (withText) m = Math.min(m, Math.floor((bh - cap - 2 * pad) / (modules + QUIET_MODULES)));
  if (m < 3) throw new Error("Print design: the QR box is too small for this link");
  const size = modules * m;
  const qrX = x0 + Math.round((bw - size) / 2);
  const groupH = withText ? size + QUIET_MODULES * m + cap : size;
  const qrY = y0 + Math.round((bh - groupH) / 2);
  return { module: m, qrX, qrY, size, text: withText ? { cx: qrX + size / 2, top: qrY + size + QUIET_MODULES * m, cap } : null };
}

// ---------------------------------------------------------------------------------------------------------------
// Design (loaded once per process)

function pngIdat(png: Buffer): Buffer | null {
  let off = 8;
  let ok = false;
  const idat: Buffer[] = [];
  while (off + 8 <= png.length) {
    const len = png.readUInt32BE(off);
    const type = png.toString("latin1", off + 4, off + 8);
    const data = png.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") ok = data[8] === 8 && data[9] === 2 && data[12] === 0; // 8-bit RGB, not interlaced
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  return ok && idat.length ? Buffer.concat(idat) : null;
}

const DESIGN_FILES: Record<StandVariant, string> = { white: "stand12-design.png", black: "stand12-design-black.png" };
const designPath = (variant: StandVariant) => path.join(process.cwd(), "assets", "print", DESIGN_FILES[variant]);

/** True when the print design of this stand colour is installed (the black one is not supplied yet). */
export function printDesignAvailable(variant: StandVariant): boolean {
  return existsSync(designPath(variant));
}

/** Optional explicit box (<design>.box.json) for a design whose placeholder the detection cannot find. */
async function boxOverride(variant: StandVariant): Promise<QrBox | null> {
  const file = designPath(variant).replace(/\.png$/, ".box.json");
  if (!existsSync(file)) return null;
  const v = JSON.parse(await readFile(file, "utf8")) as Partial<QrBox>;
  const ok = [v.left, v.top, v.right, v.bottom].every((n) => Number.isInteger(n) && (n as number) >= 0);
  if (!ok || v.right! <= v.left! || v.bottom! <= v.top!) throw new Error(`Print design: invalid box in ${path.basename(file)}`);
  return { left: v.left!, top: v.top!, right: v.right!, bottom: v.bottom! };
}

async function loadBase(variant: StandVariant): Promise<Base> {
  if (!printDesignAvailable(variant)) throw new Error(`Print design missing: assets/print/${DESIGN_FILES[variant]}`);
  const file = await readFile(designPath(variant));
  const meta = await sharp(file).metadata();
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) throw new Error("Print design: expected an RGB image");
  const { width, height } = info;
  // A dark design's placeholder can be a mid grey; the white design's is light grey (the default range).
  const box = (await boxOverride(variant)) ?? detectQrBox(data, width, height, 3, variant === "black" ? { minLevel: 60 } : {});
  // Paint the box (outline and its anti-aliasing included) white.
  const x0 = Math.max(0, box.left - 2);
  const x1 = Math.min(width - 1, box.right + 2);
  for (let y = Math.max(0, box.top - 2); y <= Math.min(height - 1, box.bottom + 2); y++) data.fill(255, (y * width + x0) * 3, (y * width + x1 + 1) * 3);
  const png = await sharp(data, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  const idat = pngIdat(png);
  return {
    width,
    height,
    dpi: width / (PRINT_SIZE_CM / 2.54),
    raw: data,
    box,
    icc: meta.icc ?? null,
    pdfImage: idat ? { data: idat, predictor: true } : { data: deflateSync(data, { level: 9 }), predictor: false },
  };
}

const bases = new Map<StandVariant, Promise<Base>>();
function base(variant: StandVariant): Promise<Base> {
  let p = bases.get(variant);
  if (!p) {
    p = loadBase(variant).catch((err) => {
      bases.delete(variant);
      throw err;
    });
    bases.set(variant, p);
  }
  return p;
}

/** Box + DPI of a design (for checks and the admin). Throws when that design is missing or has no QR box. */
export async function printDesignInfo(variant: StandVariant = "white"): Promise<{ width: number; height: number; dpi: number; box: QrBox }> {
  const b = await base(variant);
  return { width: b.width, height: b.height, dpi: b.dpi, box: b.box };
}

// ---------------------------------------------------------------------------------------------------------------
// Renderers

export type StandArt = { code: string; url: string; qr: QrMatrix; layout: PrintLayout };

function art(code: string, b: Base): StandArt {
  const url = smartLinkQr(code);
  const qr = qrMatrix(url, "Q");
  return { code, url, qr, layout: standLayout(b.box, qr.size, canDraw(code)) };
}

/** The print as a 2000 × 2000 PNG (423 dpi, sRGB). */
export async function renderStandPng(code: string, variant: StandVariant = "white"): Promise<Buffer> {
  const b = await base(variant);
  const { qr, layout: L } = art(code, b);
  const W = b.width;
  const buf = Buffer.from(b.raw);
  for (const [r, c, len] of qrRuns(qr)) {
    const x = L.qrX + c * L.module;
    const y = L.qrY + r * L.module;
    for (let yy = y; yy < y + L.module; yy++) buf.fill(0, (yy * W + x) * 3, (yy * W + x + len * L.module) * 3);
  }
  const overlays: OverlayOptions[] = [];
  if (L.text) {
    const t = layoutText(code, { cx: L.text.cx, top: L.text.top, capHeight: L.text.cap, weight: CODE_WEIGHT });
    const pad = Math.ceil(t.strokeWidth * 2);
    const left = Math.floor(t.bbox.x0) - pad;
    const top = Math.floor(t.bbox.y0) - pad;
    const w = Math.ceil(t.bbox.x1) + pad - left;
    const h = Math.ceil(t.bbox.y1) + pad - top;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      `<path d="${svgPathData(t.path, left, top)}" fill="none" stroke="${CODE_COLOR}" stroke-width="${t.strokeWidth.toFixed(3)}" ` +
      `stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="2.5"/></svg>`;
    overlays.push({ input: Buffer.from(svg), left, top });
  }
  return sharp(buf, { raw: { width: W, height: b.height, channels: 3 } })
    .composite(overlays)
    .withIccProfile("srgb")
    .withDensity(b.dpi)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

const f = (v: number) => (Math.round(v * 10000) / 10000).toString();

/** The print as a PDF: 12 × 12 cm page, or 12.6 × 12.6 cm with `bleed` (3 mm white bleed, TrimBox = 12 × 12 cm). */
export async function renderStandPdf(code: string, opts: { bleed?: boolean; variant?: StandVariant } = {}): Promise<Buffer> {
  const b = await base(opts.variant ?? "white");
  const { url, qr, layout: L } = art(code, b);
  const trim = PRINT_SIZE_CM * PT_PER_CM;
  const bl = opts.bleed ? (BLEED_MM / 10) * PT_PER_CM : 0;
  const page = trim + 2 * bl;
  const s = trim / b.width; // points per design pixel

  const pdf = new PdfBuilder();
  const catalog = pdf.alloc();
  const pages = pdf.alloc();
  const pageObj = pdf.alloc();
  const icc = b.icc ? pdf.addStream("/N 3 /Alternate /DeviceRGB", b.icc) : 0;
  const cs = icc ? `[/ICCBased ${icc} 0 R]` : "/DeviceRGB";
  const decode = b.pdfImage.predictor ? ` /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${b.width} >>` : "";
  const img = pdf.addStream(
    `/Type /XObject /Subtype /Image /Width ${b.width} /Height ${b.height} /ColorSpace ${cs} /BitsPerComponent 8${decode}`,
    b.pdfImage.data,
    { filter: "/FlateDecode" },
  );

  const ops: string[] = [];
  if (bl) ops.push(`q 1 g 0 0 ${f(page)} ${f(page)} re f Q`);
  ops.push(`q ${f(trim)} 0 0 ${f(trim)} ${f(bl)} ${f(bl)} cm /Im0 Do Q`);
  // From here on, draw in design pixels (y down).
  ops.push(`q ${f(s)} 0 0 ${f(-s)} ${f(bl)} ${f(bl + trim)} cm`);
  ops.push("0 0 0 1 k");
  for (const [r, c, len] of qrRuns(qr)) ops.push(`${L.qrX + c * L.module} ${L.qrY + r * L.module} ${len * L.module} ${L.module} re`);
  ops.push("f");
  if (L.text) {
    const t = layoutText(code, { cx: L.text.cx, top: L.text.top, capHeight: L.text.cap, weight: CODE_WEIGHT });
    ops.push(`0 0 0 0.8 K ${f(t.strokeWidth)} w 0 J 0 j 2.5 M`, pdfPathOps(t.path), "S");
  }
  ops.push("Q");
  const contents = pdf.addStream("", Buffer.from(ops.join("\n"), "latin1"));

  const box = (x0: number, y0: number, x1: number, y1: number) => `[${f(x0)} ${f(y0)} ${f(x1)} ${f(y1)}]`;
  pdf.set(
    pageObj,
    `<< /Type /Page /Parent ${pages} 0 R /MediaBox ${box(0, 0, page, page)} /BleedBox ${box(0, 0, page, page)} ` +
      `/TrimBox ${box(bl, bl, bl + trim, bl + trim)} /Resources << /XObject << /Im0 ${img} 0 R >> /ProcSet [/PDF /ImageC] >> ` +
      `/Contents ${contents} 0 R >>`,
  );
  pdf.set(pages, `<< /Type /Pages /Kids [${pageObj} 0 R] /Count 1 >>`);
  pdf.set(catalog, `<< /Type /Catalog /Pages ${pages} 0 R >>`);
  const info = pdf.add(
    `<< /Title ${pdfString(`ONDE review stand ${code}`)} /Subject ${pdfString(`QR: ${url}`)} ` +
      `/Keywords ${pdfString(`${PRINT_SIZE_CM} x ${PRINT_SIZE_CM} cm${bl ? ` + ${BLEED_MM} mm bleed` : ""}`)} /Creator (ONDE admin) /Producer (ONDE) /CreationDate (${pdfDate()}) >>`,
  );
  return pdf.build(catalog, info);
}
