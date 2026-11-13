#!/usr/bin/env node
// Decode-test an ONDE print pack (the ZIP from admin → Products → "Print files", or its unzipped folder). Dev-time
// only: the QR decoder (jsQR) is NOT a project dependency — install it somewhere temporary and pass its path.
//
//   npm i --prefix /tmp/onde-qr jsqr@1.4.0
//   node scripts/verify-print.mjs ~/Downloads/onde-print-….zip --jsqr /tmp/onde-qr/node_modules/jsqr [--base https://onde.tn] [--render]
//
// Checks
//   ONDE-<CODE>.png          12 × 12 cm from its pHYs DPI (≥ 300 dpi), QR decodes to <base>/t/<CODE>?s=qr
//   ONDE-<CODE>.pdf          TrimBox 12 × 12 cm (bleed-3mm/: 12.6 cm page), vector QR decodes to the same URL
//   chip-sheet.pdf           one QR per code, each decodes to <base>/t/<CODE> (the link written to the chip)
//   other-products/*.svg     decodes to <base>/t/<CODE>?s=qr
//   --render (macOS)         also rasterises every PDF with Quick Look (a real PDF renderer) and decodes the page
// Exit code 1 when anything fails.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { inflateRawSync, inflateSync } from "node:zlib";
import sharp from "sharp";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const input = args.find((a, i) => !a.startsWith("--") && !["--jsqr", "--base"].includes(args[i - 1]));
if (!input || args.includes("-h") || args.includes("--help")) {
  console.log("Usage: node scripts/verify-print.mjs <pack.zip|folder> --jsqr <path/to/node_modules/jsqr> [--base https://onde.tn] [--render]");
  process.exit(input ? 0 : 2);
}
const base = (opt("--base", "https://onde.tn") || "").replace(/\/+$/, "");
const render = args.includes("--render");
const require = createRequire(import.meta.url);
let jsQR;
try {
  const mod = require(path.resolve(opt("--jsqr", "jsqr")));
  jsQR = mod.default ?? mod;
} catch {
  console.error("jsQR not found — install it temporarily (npm i --prefix /tmp/onde-qr jsqr@1.4.0) and pass --jsqr /tmp/onde-qr/node_modules/jsqr");
  process.exit(2);
}

// ── read the pack ────────────────────────────────────────────────────────────────────────────────────────────────
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("not a ZIP file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad central directory");
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const dataAt = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataAt, dataAt + csize);
    files.set(name, method === 8 ? inflateRawSync(raw) : Buffer.from(raw));
    p += 46 + nameLen + extra + comment;
  }
  return files;
}
function readDir(dir) {
  const files = new Map();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else files.set(path.relative(dir, full).split(path.sep).join("/"), fs.readFileSync(full));
    }
  };
  walk(dir);
  return files;
}
const files = fs.statSync(input).isDirectory() ? readDir(input) : readZip(fs.readFileSync(input));

// ── helpers ──────────────────────────────────────────────────────────────────────────────────────────────────────
const results = [];
const check = (file, ok, detail) => results.push({ file, ok, detail });
const decodeRgba = (data, w, h) => jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), w, h, { inversionAttempts: "dontInvert" })?.data ?? null;
async function decodeImage(buf, opts = {}) {
  const { data, info } = await sharp(buf, opts).flatten({ background: "#ffffff" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return decodeRgba(data, info.width, info.height);
}
function pngDpi(buf) {
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    if (type === "pHYs") {
      const ppx = buf.readUInt32BE(off + 8);
      const ppy = buf.readUInt32BE(off + 12);
      return buf[off + 16] === 1 ? { x: ppx * 0.0254, y: ppy * 0.0254 } : null;
    }
    if (type === "IDAT") return null;
    off += 12 + len;
  }
  return null;
}
/** Decompressed content streams (images skipped) + the raw PDF text. */
function pdfParts(buf) {
  const text = buf.toString("latin1");
  const streams = [];
  const re = /<<((?:(?!>>\s*stream)[\s\S])*)>>\s*stream\r?\n/g;
  let m;
  while ((m = re.exec(text))) {
    const dict = m[1];
    const len = Number(/\/Length (\d+)/.exec(dict)?.[1] ?? -1);
    const start = m.index + m[0].length;
    if (len < 0 || /\/Subtype\s*\/Image/.test(dict)) continue;
    const raw = buf.subarray(start, start + len);
    try {
      streams.push((/\/FlateDecode/.test(dict) ? inflateSync(raw) : raw).toString("latin1"));
    } catch {
      /* not a content stream */
    }
  }
  return { text, streams };
}
const numbers = (s) => s.trim().split(/\s+/).map(Number);
/** Paint axis-aligned rectangles (already in canvas pixels) on white and decode. */
function decodeRects(rects, w, h) {
  const px = Buffer.alloc(w * h * 4, 255);
  for (const [x0, y0, x1, y1] of rects) {
    for (let y = Math.max(0, Math.round(y0)); y < Math.min(h, Math.round(y1)); y++)
      for (let x = Math.max(0, Math.round(x0)); x < Math.min(w, Math.round(x1)); x++) {
        const i = (y * w + x) * 4;
        px[i] = px[i + 1] = px[i + 2] = 0;
      }
  }
  return decodeRgba(px, w, h);
}
const tmp = render ? fs.mkdtempSync(path.join(os.tmpdir(), "onde-verify-")) : null;
async function renderPdf(name, buf) {
  const file = path.join(tmp, name.replace(/\//g, "_"));
  fs.writeFileSync(file, buf);
  execFileSync("qlmanage", ["-t", "-s", "2400", "-o", tmp, file], { stdio: "ignore" });
  return decodeImage(fs.readFileSync(`${file}.png`));
}

// ── checks ───────────────────────────────────────────────────────────────────────────────────────────────────────
const codes = new Set();
for (const [name, buf] of files) {
  const stand = /^(?:bleed-3mm\/)?ONDE-([A-Z0-9]+)\.(png|pdf)$/.exec(name);
  const other = /^other-products\/ONDE-([A-Z0-9]+)-qr\.svg$/.exec(name);
  if (stand) {
    const [, code, ext] = stand;
    codes.add(code);
    const want = `${base}/t/${code}?s=qr`;
    if (ext === "png") {
      const meta = await sharp(buf).metadata();
      const dpi = pngDpi(buf);
      const cmW = dpi ? (meta.width / dpi.x) * 2.54 : NaN;
      const cmH = dpi ? (meta.height / dpi.y) * 2.54 : NaN;
      const got = await decodeImage(buf);
      const sizeOk = Math.abs(cmW - 12) < 0.05 && Math.abs(cmH - 12) < 0.05 && dpi.x >= 300;
      check(name, sizeOk && got === want, `${meta.width}×${meta.height}px · ${dpi ? dpi.x.toFixed(1) : "no"} dpi · ${cmW.toFixed(2)}×${cmH.toFixed(2)} cm · ${meta.space}${meta.icc ? "+ICC" : ""} · QR → ${got ?? "NOT DECODED"}`);
    } else {
      const { text, streams } = pdfParts(buf);
      const media = numbers(/\/MediaBox \[([^\]]+)\]/.exec(text)?.[1] ?? "");
      const trim = numbers(/\/TrimBox \[([^\]]+)\]/.exec(text)?.[1] ?? media.join(" "));
      const trimCm = [(trim[2] - trim[0]) / (72 / 2.54), (trim[3] - trim[1]) / (72 / 2.54)];
      const pageCm = (media[2] - media[0]) / (72 / 2.54);
      const bleed = name.startsWith("bleed-3mm/");
      const content = streams.find((s) => s.includes("/Im0 Do")) ?? "";
      const lines = content.split("\n");
      const at = lines.findIndex((l) => /^q \S+ 0 0 -\S+ \S+ \S+ cm$/.test(l));
      let got = null;
      if (at >= 0) {
        const [, a, , , d, e, f] = lines[at].split(" ").map(Number);
        const S = 6; // canvas px per point
        const W = Math.ceil(media[2] * S);
        const H = Math.ceil(media[3] * S);
        const rects = [];
        for (let i = at + 1; i < lines.length && lines[i] !== "f"; i++) {
          const r = /^(\S+) (\S+) (\S+) (\S+) re$/.exec(lines[i]);
          if (!r) continue;
          const [x, y, w, h] = r.slice(1).map(Number);
          const X0 = a * x + e;
          const X1 = a * (x + w) + e;
          const Y0 = d * y + f;
          const Y1 = d * (y + h) + f;
          rects.push([X0 * S, (media[3] - Math.max(Y0, Y1)) * S, X1 * S, (media[3] - Math.min(Y0, Y1)) * S]);
        }
        got = decodeRects(rects, W, H);
      }
      const sizeOk = Math.abs(trimCm[0] - 12) < 0.01 && Math.abs(trimCm[1] - 12) < 0.01 && Math.abs(pageCm - (bleed ? 12.6 : 12)) < 0.01;
      let rendered = "";
      let renderOk = true;
      if (render) {
        const r = await renderPdf(name, buf);
        renderOk = r === want;
        rendered = ` · rendered QR → ${r ?? "NOT DECODED"}`;
      }
      check(name, sizeOk && got === want && renderOk, `page ${pageCm.toFixed(2)} cm · trim ${trimCm.map((v) => v.toFixed(2)).join("×")} cm · vector QR → ${got ?? "NOT DECODED"}${rendered}`);
    }
  } else if (other) {
    const [, code] = other;
    codes.add(code);
    const got = await decodeImage(buf, { density: 300 });
    check(name, got === `${base}/t/${code}?s=qr`, `QR → ${got ?? "NOT DECODED"}`);
  }
}

const sheet = files.get("chip-sheet.pdf");
if (!sheet) check("chip-sheet.pdf", false, "missing");
else {
  const { text, streams } = pdfParts(sheet);
  const found = [];
  const firstPage = []; // QR boxes of page 1, in points: [x, top, size]
  for (const [si, s] of streams.entries()) {
    const lines = s.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!/^q \S+ 0 0 -\S+ \S+ \S+ cm 0 g$/.test(lines[i])) continue;
      const [, a, , , , e, f] = lines[i].split(" ").map(Number);
      const cells = [];
      for (i++; i < lines.length && lines[i] !== "f Q"; i++) {
        const r = /^(\d+) (\d+) (\d+) 1 re$/.exec(lines[i]);
        if (r) cells.push(r.slice(1).map(Number));
      }
      const size = Math.max(...cells.map(([c, , len]) => c + len), ...cells.map(([, r]) => r + 1));
      if (si === 0) firstPage.push([e, f, a * size]);
      const M = 8; // px per module, 4-module quiet zone
      const dim = (size + 8) * M;
      found.push(decodeRects(cells.map(([c, r, len]) => [(c + 4) * M, (r + 4) * M, (c + len + 4) * M, (r + 5) * M]), dim, dim));
    }
  }
  const want = [...codes].map((c) => `${base}/t/${c}`).sort();
  const got = found.filter(Boolean).sort();
  const missing = want.filter((u) => !got.includes(u));
  let rendered = "";
  let renderOk = true;
  if (render) {
    // Quick Look renders page 1 only: crop each QR of that page out of the render and decode it.
    const file = path.join(tmp, "chip-sheet.pdf");
    fs.writeFileSync(file, sheet);
    execFileSync("qlmanage", ["-t", "-s", "2400", "-o", tmp, file], { stdio: "ignore" });
    const png = fs.readFileSync(`${file}.png`);
    const meta = await sharp(png).metadata();
    const media = numbers(/\/MediaBox \[([^\]]+)\]/.exec(text)?.[1] ?? "0 0 595.276 841.89");
    const k = meta.height / media[3];
    let ok = 0;
    for (const [x, top, size] of firstPage) {
      const pad = size * 0.25;
      const left = Math.max(0, Math.floor((x - pad) * k));
      const y = Math.max(0, Math.floor((media[3] - top - pad) * k));
      const side = Math.ceil((size + 2 * pad) * k);
      const crop = await sharp(png).extract({ left, top: y, width: Math.min(side, meta.width - left), height: Math.min(side, meta.height - y) }).resize({ width: 600, kernel: "nearest" }).png().toBuffer();
      if (want.includes((await decodeImage(crop)) ?? "")) ok++;
    }
    renderOk = ok === firstPage.length;
    rendered = ` · rendered page 1: ${ok}/${firstPage.length} QR decoded`;
  }
  check(
    "chip-sheet.pdf",
    found.length >= codes.size && missing.length === 0 && found.every(Boolean) && renderOk,
    `${found.length} QR(s), ${found.filter(Boolean).length} decoded${missing.length ? ` · MISSING ${missing.join(", ")}` : " · every code's chip link present"}${rendered}`,
  );
}
for (const extra of ["README.txt", "chip-sheet.csv"]) check(extra, files.has(extra), files.has(extra) ? `${files.get(extra).length} bytes` : "missing");

const width = Math.max(...results.map((r) => r.file.length));
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.file.padEnd(width)}  ${r.detail}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed · ${codes.size} code(s) · expected base ${base}`);
if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
