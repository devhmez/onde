import "server-only";
// Print pack for a selection of smart links (admin → Products → Stock / Manage → "Print files"):
//   ONDE-<CODE>.png / .pdf   stand print (owner's design + QR), one pair per review-stand link
//   bleed-3mm/ONDE-<CODE>.pdf  same with 3 mm bleed (optional)
//   other-products/ONDE-<CODE>-qr.svg  plain QR for non-stand links (cards, keychains, stickers)
//   chip-sheet.pdf / .csv    every code + the exact link to write to its NFC chip (+ a small QR of that link)
//   README.txt
// Each stand gets the design of its colour (standVariant: "(black)" in the label → black design). Stands whose design
// is not installed are never put on the other colour's design: callers leave them out (splitPrintable) and the README
// lists them. The ZIP is streamed: each file is rendered when the client is ready for more bytes.
import { standVariant } from "../lib/business";
import { csvText } from "./export";
import { PdfBuilder, fitText, pdfDate, pdfString, textWidth, type StdFont } from "./export-pdf";
import { ZipWriter } from "./export-zip";
import { qrMatrix, qrRuns, qrSvg } from "./qr";
import { BLEED_MM, PRINT_SIZE_CM, printDesignAvailable, printDesignInfo, renderStandPdf, renderStandPng } from "./qr-print";
import { isStockTag, smartLink, smartLinkQr, TAG_KIND_LABELS } from "./tags";
import type { DestinationType, Tag } from "./types";

export type PrintTag = Pick<Tag, "id" | "code" | "kind" | "label" | "status" | "destinationType" | "destinationUrl" | "customerId"> & {
  customerName: string | null;
};

export const MAX_PRINT_LINKS = 300;

const DEST_LABEL: Record<DestinationType, string> = {
  google_review: "Google Reviews",
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  menu: "Digital menu",
  website: "Website",
  contact: "Contact card",
  whatsapp: "WhatsApp",
  custom: "Custom link",
};

const tunis = (ts: number) => new Date(ts + 3600_000);
const stamp = (ts: number) => {
  const d = tunis(ts);
  const p = (v: number) => String(v).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};

function describe(t: PrintTag): string {
  const parts = [t.label || TAG_KIND_LABELS[t.kind]];
  if (t.customerName) parts.push(t.customerName);
  if (isStockTag(t)) parts.push("in stock - no destination yet");
  else parts.push(t.destinationUrl ? DEST_LABEL[t.destinationType] : "no destination yet");
  if (t.status !== "active") parts.push("DISABLED");
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------------------------------------------
// Chip sheet (A4 PDF)

const A4 = { w: 595.276, h: 841.89 };
const FONT_KEYS: Record<StdFont, string> = { Helvetica: "F1", "Helvetica-Bold": "F2", Courier: "F3", "Courier-Bold": "F4" };
const n2 = (v: number) => (Math.round(v * 100) / 100).toString();

function text(x: number, y: number, font: StdFont, size: number, s: string, o: { gray?: number; tc?: number; align?: "left" | "right" | "center" } = {}): string {
  const w = textWidth(s, font, size, o.tc ?? 0);
  const tx = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
  return `q BT /${FONT_KEYS[font]} ${size} Tf ${o.tc ? `${o.tc} Tc ` : ""}${o.gray ?? 0} g 1 0 0 1 ${n2(tx)} ${n2(y)} Tm ${pdfString(s)} Tj ET Q`;
}

/** Vector QR with its top-left corner at (x, top), `size` points wide (no quiet zone — leave white space around it). */
function qrOps(url: string, x: number, top: number, size: number): string {
  const m = qrMatrix(url, "M");
  const a = size / m.size;
  const runs = qrRuns(m).map(([r, c, len]) => `${c} ${r} ${len} 1 re`);
  return [`q ${n2(a)} 0 0 ${n2(-a)} ${n2(x)} ${n2(top)} cm 0 g`, ...runs, "f Q"].join("\n");
}

export function chipSheetPdf(list: PrintTag[], generatedAt = Date.now()): Buffer {
  const L = 36;
  const R = A4.w - 36;
  const ROW = 66;
  const FIRST = A4.h - 104;
  const PER_PAGE = Math.floor((FIRST - 40) / ROW);
  const pageCount = Math.max(1, Math.ceil(list.length / PER_PAGE));

  const pdf = new PdfBuilder();
  const catalog = pdf.alloc();
  const pagesObj = pdf.alloc();
  const fonts = (Object.keys(FONT_KEYS) as StdFont[])
    .map((f) => `/${FONT_KEYS[f]} ${pdf.add(`<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`)} 0 R`)
    .join(" ");
  const resources = pdf.add(`<< /Font << ${fonts} >> /ProcSet [/PDF /Text] >>`);
  const kids: number[] = [];

  const intro = [
    "Write each chip with the free NFC Tools app: Write > Add a record > URL > paste the chip link > Write > hold the chip to the phone.",
    "Test by tapping the chip: a stock link opens the ONDE \"not activated yet\" page. Lock (Other > Lock tag) only AFTER the test - it is permanent.",
    "The small QR below is the chip link (scan it to copy it). The QR printed on the stand ends in ?s=qr - never write that one to a chip.",
  ];

  for (let p = 0; p < pageCount; p++) {
    const ops: string[] = [];
    ops.push(text(L, A4.h - 44, "Helvetica-Bold", 17, "ONDE · Chip sheet"));
    ops.push(
      text(R, A4.h - 44, "Helvetica", 8.5, `${stamp(generatedAt)} · ${list.length} link${list.length === 1 ? "" : "s"} · page ${p + 1}/${pageCount}`, { gray: 0.4, align: "right" }),
    );
    intro.forEach((line, i) => ops.push(text(L, A4.h - 62 - i * 11, "Helvetica", 7.6, fitText(line, "Helvetica", 7.6, R - L), { gray: 0.3 })));
    ops.push(`q 0.8 G 0.6 w ${L} ${n2(A4.h - 94)} m ${n2(R)} ${n2(A4.h - 94)} l S Q`);

    list.slice(p * PER_PAGE, (p + 1) * PER_PAGE).forEach((t, i) => {
      const top = FIRST - i * ROW;
      const chip = smartLink(t.code);
      ops.push(qrOps(chip, L, top - 7, 52));
      ops.push(text(L + 68, top - 29, "Helvetica-Bold", 21, t.code, { tc: 2.2 }));
      ops.push(text(L + 68, top - 44, "Courier", 10.5, fitText(chip, "Courier", 10.5, 290)));
      ops.push(text(L + 68, top - 56.5, "Helvetica", 8, fitText(describe(t), "Helvetica", 8, 300), { gray: 0.4 }));
      ["Written", "Tested", "Locked"].forEach((label, k) => {
        const cx = R - 19 - (2 - k) * 46;
        ops.push(`q 0 G 0.8 w ${n2(cx - 6)} ${n2(top - 38)} 12 12 re S Q`);
        ops.push(text(cx, top - 50, "Helvetica", 7, label, { gray: 0.35, align: "center" }));
      });
      ops.push(`q 0.86 G 0.5 w ${L} ${n2(top - ROW)} m ${n2(R)} ${n2(top - ROW)} l S Q`);
    });
    ops.push(text(A4.w / 2, 24, "Helvetica", 7, `onde.tn · chip sheet · page ${p + 1}/${pageCount}`, { gray: 0.5, align: "center" }));

    const contents = pdf.addStream("", Buffer.from(ops.join("\n"), "latin1"));
    kids.push(
      pdf.add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources ${resources} 0 R /Contents ${contents} 0 R >>`),
    );
  }
  pdf.set(pagesObj, `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`);
  pdf.set(catalog, `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`);
  const info = pdf.add(`<< /Title ${pdfString(`ONDE chip sheet (${list.length})`)} /Creator (ONDE admin) /Producer (ONDE) /CreationDate (${pdfDate(generatedAt)}) >>`);
  return pdf.build(catalog, info);
}

export function chipSheetCsv(list: PrintTag[]): string {
  return csvText(
    ["code", "chip_link", "stand_qr_link", "kind", "label", "customer", "destination_type", "destination_url", "status", "in_stock"],
    list.map((t) => [
      t.code,
      smartLink(t.code),
      smartLinkQr(t.code),
      t.kind,
      t.label,
      t.customerName,
      t.destinationUrl ? t.destinationType : "",
      t.destinationUrl,
      t.status,
      isStockTag(t),
    ]),
  );
}

export type PrintPackOptions = {
  bleed?: boolean;
  /** Links left out of this pack because their stand design is missing (listed in the README). */
  skipped?: PrintTag[];
};

function readme(list: PrintTag[], opts: PrintPackOptions, generatedAt: number): string {
  const stands = list.filter((t) => t.kind === "stand").length;
  const black = list.filter((t) => standVariant(t) === "black").length;
  const others = list.length - stands;
  const skipped = opts.skipped ?? [];
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const colours = black ? ` - ${stands - black} white, ${black} black design` : "";
  const lines: (string | null)[] = [
    `ONDE print pack - ${stamp(generatedAt)} - ${plural(list.length, "smart link")}`,
    "",
    "FILES",
    stands ? `  ONDE-<CODE>.png   review-stand print, ${PRINT_SIZE_CM} x ${PRINT_SIZE_CM} cm, 2000 x 2000 px = 423 dpi, sRGB (${plural(stands, "stand")}${colours})` : null,
    stands ? `  ONDE-<CODE>.pdf   same print, ${PRINT_SIZE_CM} x ${PRINT_SIZE_CM} cm page, QR + code as vectors in 100% black (K)` : null,
    stands && opts.bleed ? `  bleed-3mm/        PDFs with ${BLEED_MM} mm white bleed on each side (page 12.6 cm, TrimBox = 12 cm)` : null,
    others ? `  other-products/   plain QR (SVG) for ${plural(others, "card/keychain/sticker link")}` : null,
    "  chip-sheet.pdf    A4 list: each code, the link to write to its chip, a small QR of that link, check boxes",
    "  chip-sheet.csv    the same list as a spreadsheet",
    "",
    "PRINTING",
    '  Print at 100% (actual size) - never "fit to page". The QR on each print opens https://onde.tn/t/<CODE>?s=qr',
    "  (QR scans are counted separately from NFC taps). Each print has its own code, printed under the QR (about 2.5 mm tall).",
    "",
    "WRITING THE CHIPS (free NFC Tools app, iPhone or Android)",
    "  Write > Add a record > URL > paste https://onde.tn/t/<CODE> (WITHOUT ?s=qr) > Write > hold the chip to the phone.",
    '  Tap the chip to test: a stock link shows the ONDE "not activated yet" page with its code, and the admin marks the',
    "  chip Tested by itself. Lock the chip only after the test. The admin keeps each chip's state (Written / Tested / Locked),",
    "  so the boxes on the chip sheet are optional.",
    "",
    "SELLING A STOCK STAND",
    "  At the counter: Admin > Find a stand (search on every page) > type the code under the QR > Sell this stand >",
    "  pick or create the client > paste their Google review link > Paid in person > Sell.",
    "  For an order: Admin > Orders > the order > Smart links > Use a stock stand > type the code > Use.",
    "  Wrong code? Open the stand > Return to stock, then sell the right one.",
    "  The chip and the printed QR never change - only the destination does. Never print the same code twice.",
    ...(skipped.length
      ? [
          "",
          `NOT IN THIS PACK - ${plural(skipped.length, "black stand link")}: no black print design yet`,
          "  (assets/print/stand12-design-black.png). Do not print them on the white design.",
          `  ${skipped.map((t) => t.code).join(", ")}`,
        ]
      : []),
  ];
  return `${lines.filter((l): l is string => l !== null).join("\r\n")}\r\n`;
}

export function printZipName(count: number, generatedAt = Date.now()): string {
  const d = tunis(generatedAt);
  const p = (v: number) => String(v).padStart(2, "0");
  return `onde-print-${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}-${count}.zip`;
}

/**
 * Split a selection by whether its stand print can be made: stands whose design (white / black) is not installed yet
 * go to `missing` — the black design is not supplied yet, and a black stand must never get the white print.
 */
export function splitPrintable<T extends Pick<PrintTag, "kind" | "label">>(list: T[]): { printable: T[]; missing: T[] } {
  const printable: T[] = [];
  const missing: T[] = [];
  for (const t of list) {
    const v = standVariant(t);
    if (v && !printDesignAvailable(v)) missing.push(t);
    else printable.push(t);
  }
  return { printable, missing };
}

/** Fail fast (before any byte is streamed) when a design the pack needs cannot be loaded. */
export async function assertPrintReady(list: Pick<PrintTag, "kind" | "label">[]): Promise<void> {
  const variants = new Set(list.map(standVariant).filter((v) => v !== null));
  for (const v of variants) await printDesignInfo(v);
}

/** The print pack as a streamed ZIP (`list` should already be sorted the way the owner wants to work through it). */
export function printZipStream(list: PrintTag[], opts: PrintPackOptions = {}): ReadableStream<Uint8Array> {
  const now = Date.now();
  const zip = new ZipWriter(tunis(now));
  const jobs: (() => Promise<Uint8Array> | Uint8Array)[] = [
    () => zip.add("README.txt", Buffer.from(readme(list, opts, now), "utf8"), { deflate: true }),
    () => zip.add("chip-sheet.pdf", chipSheetPdf(list, now)),
    () => zip.add("chip-sheet.csv", Buffer.from(chipSheetCsv(list), "utf8"), { deflate: true }),
  ];
  for (const t of list) {
    const variant = standVariant(t);
    if (variant) {
      jobs.push(async () => zip.add(`ONDE-${t.code}.png`, await renderStandPng(t.code, variant)));
      jobs.push(async () => zip.add(`ONDE-${t.code}.pdf`, await renderStandPdf(t.code, { variant })));
      if (opts.bleed) jobs.push(async () => zip.add(`bleed-3mm/ONDE-${t.code}.pdf`, await renderStandPdf(t.code, { bleed: true, variant })));
    } else {
      jobs.push(async () => zip.add(`other-products/ONDE-${t.code}-qr.svg`, Buffer.from(await qrSvg(smartLinkQr(t.code), { margin: 4 }), "utf8"), { deflate: true }));
    }
  }
  jobs.push(() => zip.finish());
  let i = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (i >= jobs.length) {
        controller.close();
        return;
      }
      try {
        controller.enqueue(await jobs[i++]());
      } catch (err) {
        console.error("[onde] print ZIP failed", err);
        controller.error(err);
      }
    },
  });
}
