import "server-only";
// Minimal PDF 1.6 writer for the print files (stand prints + chip sheet): objects, Flate streams, xref, trailer.
// Text uses the standard 14 fonts (Helvetica, Courier — nothing to embed) in WinAnsiEncoding.
import { deflateSync } from "node:zlib";

export const PT_PER_CM = 72 / 2.54;

export class PdfBuilder {
  private objs: (Buffer | null)[] = [];

  /** Reserve an object number (1-based) to reference before its body is known. */
  alloc(): number {
    this.objs.push(null);
    return this.objs.length;
  }

  set(num: number, body: string | Buffer): number {
    this.objs[num - 1] = Buffer.isBuffer(body) ? body : Buffer.from(body, "latin1");
    return num;
  }

  add(body: string | Buffer): number {
    return this.set(this.alloc(), body);
  }

  /** A stream object. `dict` is the inner dictionary without /Length (and without /Filter unless `raw` is set). */
  addStream(dict: string, data: Buffer, opts: { compress?: boolean; filter?: string } = {}): number {
    let body = data;
    let filter = opts.filter ?? "";
    if (!filter && opts.compress !== false) {
      body = deflateSync(data, { level: 9 });
      filter = "/FlateDecode";
    }
    const head = Buffer.from(`<< ${dict}${filter ? ` /Filter ${filter}` : ""} /Length ${body.length} >>\nstream\n`, "latin1");
    return this.add(Buffer.concat([head, body, Buffer.from("\nendstream", "latin1")]));
  }

  build(root: number, info?: number): Buffer {
    const parts: Buffer[] = [Buffer.from("%PDF-1.6\n%\xe2\xe3\xcf\xd3\n", "latin1")];
    let offset = parts[0].length;
    const offsets: number[] = [];
    this.objs.forEach((body, i) => {
      if (!body) throw new Error(`PDF object ${i + 1} was allocated but never set`);
      const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, "latin1"), body, Buffer.from("\nendobj\n", "latin1")]);
      offsets.push(offset);
      parts.push(chunk);
      offset += chunk.length;
    });
    const xref = [`xref\n0 ${this.objs.length + 1}\n`, "0000000000 65535 f\r\n", ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n\r\n`)].join("");
    const trailer = `trailer\n<< /Size ${this.objs.length + 1} /Root ${root} 0 R${info ? ` /Info ${info} 0 R` : ""} >>\nstartxref\n${offset}\n%%EOF\n`;
    parts.push(Buffer.from(xref + trailer, "latin1"));
    return Buffer.concat(parts);
  }
}

/** PDF date string D:YYYYMMDDHHmmSS+01'00' for Tunis time (UTC+1, no DST). */
export function pdfDate(ts = Date.now()): string {
  const d = new Date(ts + 3600_000);
  const p = (v: number) => String(v).padStart(2, "0");
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}+01'00'`;
}

// ---------------------------------------------------------------------------------------------------------------
// Text (standard fonts, WinAnsiEncoding)

const WIN_ANSI_EXTRA: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b,
  "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99,
  "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};

/** Unicode → WinAnsi bytes (unknown characters become "?"). */
export function winAnsi(s: string): Buffer {
  const out: number[] = [];
  for (const ch of s.normalize("NFC")) {
    const cp = ch.codePointAt(0) ?? 63;
    if (cp >= 0x20 && cp <= 0x7e) out.push(cp);
    else if (cp >= 0xa0 && cp <= 0xff) out.push(cp);
    else if (ch in WIN_ANSI_EXTRA) out.push(WIN_ANSI_EXTRA[ch]);
    else if (cp === 0x09 || cp === 0x0a || cp === 0x0d) out.push(0x20);
    else out.push(0x3f);
  }
  return Buffer.from(out);
}

/** A PDF literal string (WinAnsi), escaped. */
export function pdfString(s: string): string {
  let out = "(";
  for (const b of winAnsi(s)) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) out += `\\${String.fromCharCode(b)}`;
    else if (b < 0x20 || b > 0x7e) out += `\\${b.toString(8).padStart(3, "0")}`;
    else out += String.fromCharCode(b);
  }
  return `${out})`;
}

export type StdFont = "Helvetica" | "Helvetica-Bold" | "Courier" | "Courier-Bold";

// AFM advance widths (1/1000 em) for ASCII 32–126.
const HELV =
  "278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584"
    .split(",")
    .map(Number);
const HELV_BOLD =
  "278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584"
    .split(",")
    .map(Number);

/** Text width in points (approximate for non-ASCII characters). */
export function textWidth(s: string, font: StdFont, size: number, charSpacing = 0): number {
  let w = 0;
  let n = 0;
  for (const b of winAnsi(s)) {
    n++;
    if (font.startsWith("Courier")) w += 600;
    else {
      const table = font === "Helvetica-Bold" ? HELV_BOLD : HELV;
      w += b >= 32 && b <= 126 ? table[b - 32] : 556;
    }
  }
  return (w * size) / 1000 + Math.max(0, n - 1) * charSpacing;
}

/** Truncate with an ellipsis so the text fits `maxWidth` points. */
export function fitText(s: string, font: StdFont, size: number, maxWidth: number): string {
  if (textWidth(s, font, size) <= maxWidth) return s;
  let t = s;
  while (t.length > 1 && textWidth(`${t}…`, font, size) > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}
