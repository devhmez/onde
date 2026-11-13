import "server-only";
import QRCode from "qrcode";

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const color = (value: string | undefined, fallback: string) => (value && HEX_RE.test(value) ? value : fallback);

/**
 * QR code as an SVG string (print-ready vector). Error correction "M" keeps codes compact and robust for small prints.
 * `dark`/`light` accept #rgb, #rgba, #rrggbb or #rrggbbaa (use "#0000" for a transparent background).
 */
export async function qrSvg(text: string, opts: { dark?: string; light?: string; margin?: number } = {}): Promise<string> {
  return QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: Math.min(8, Math.max(0, Math.trunc(opts.margin ?? 2))),
    color: { dark: color(opts.dark, "#000000"), light: color(opts.light, "#ffffff") },
  });
}

export type QrEcl = "L" | "M" | "Q" | "H";

/** Raw module matrix of a QR code (row-major, 1 = dark), without quiet zone — for renderers that draw it themselves. */
export type QrMatrix = { size: number; version: number; ecl: QrEcl; data: Uint8Array };

export function qrMatrix(text: string, ecl: QrEcl = "M"): QrMatrix {
  const qr = QRCode.create(text, { errorCorrectionLevel: ecl });
  return { size: qr.modules.size, version: qr.version, ecl, data: Uint8Array.from(qr.modules.data) };
}

/** Horizontal runs of dark modules `[row, col, length]` — one rectangle per run keeps vector output small. */
export function qrRuns(m: QrMatrix): [number, number, number][] {
  const runs: [number, number, number][] = [];
  for (let r = 0; r < m.size; r++) {
    let c = 0;
    while (c < m.size) {
      if (!m.data[r * m.size + c]) {
        c++;
        continue;
      }
      const start = c;
      while (c < m.size && m.data[r * m.size + c]) c++;
      runs.push([r, start, c - start]);
    }
  }
  return runs;
}

/** QR code as a PNG buffer, `size` px wide (clamped 128–4096, default 1024). */
export async function qrPng(text: string, size = 1024): Promise<Buffer> {
  const width = Math.min(4096, Math.max(128, Math.trunc(Number(size) || 1024)));
  return QRCode.toBuffer(text, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 2,
    width,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
