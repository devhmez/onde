"use client";
// QR codes, organised the way the owner thinks: stock not printed yet, stock printed, then one section per client
// (their stands, live/off, chip, taps), then links without a client. Every card opens its stand page.
// Printing works on the codes you select (never "everything shown"): downloads that include codes already printed ask
// first (one code = one stand), and the A4 QR sheet always confirms how many codes it records as printed in the print
// log, like the print files.
import { motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { logPrintSheetAction } from "@/app/(admin)/admin/actions";
import { standVariant } from "@/lib/business";
import { Modal } from "../controls";
import { displayLink, fmtDate, fmtInt } from "../format";
import { IconDownload, IconPrint, IconSearch } from "../icons";
import { isStock, KIND_LABEL, NO_BLACK_DESIGN, printZipHref, standHref, TAG_KINDS } from "../meta";
import { useToast } from "../toast";
import type { StandCard, TagKind } from "../types";
import { ChipPill, Pill, TagStatusPill } from "../ui";

const PER_PAGE = 12;

type Group = { key: string; title: string; sub: string; href?: string; items: StandCard[] };

export default function QrSheet({ tags, blackDesign }: { tags: StandCard[]; blackDesign: boolean }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"" | TagKind>("");
  const [hideDisabled, setHideDisabled] = useState(false);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [ask, setAsk] = useState<null | "zip" | "sheet">(null);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    const codeTerm = term.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return tags.filter(
      (t) =>
        (!hideDisabled || t.status === "active") &&
        (!kind || t.kind === kind) &&
        (!term ||
          (codeTerm && t.code.includes(codeTerm)) ||
          t.label.toLowerCase().includes(term) ||
          (t.customerName ?? "").toLowerCase().includes(term) ||
          t.destinationUrl.toLowerCase().includes(term)),
    );
  }, [tags, q, kind, hideDisabled]);

  const groups = useMemo(() => {
    const out: Group[] = [];
    const stock = visible.filter((t) => isStock(t));
    const notPrinted = stock.filter((t) => !t.printedAt);
    const printed = stock.filter((t) => t.printedAt);
    if (notPrinted.length) out.push({ key: "stock-new", title: "Stock — not printed yet", sub: "Print these, write their chips, then sell them.", items: notPrinted });
    if (printed.length) out.push({ key: "stock-printed", title: "Stock — printed", sub: "Ready to sell: the code is under each QR.", items: printed });
    const byClient = new Map<number, StandCard[]>();
    for (const t of visible) if (!isStock(t) && t.customerId != null) byClient.set(t.customerId, [...(byClient.get(t.customerId) ?? []), t]);
    const clients = [...byClient.entries()].sort((a, b) => Math.max(...b[1].map((t) => t.updatedAt)) - Math.max(...a[1].map((t) => t.updatedAt)));
    for (const [id, items] of clients) {
      const taps = items.reduce((n, t) => n + t.taps30d, 0);
      out.push({
        key: `c${id}`,
        title: items[0].customerName ?? "Client",
        sub: `${items.length} product${items.length === 1 ? "" : "s"} · ${fmtInt(taps)} tap${taps === 1 ? "" : "s"} in 30 days`,
        href: `/admin/customers/${id}`,
        items: items.sort((a, b) => a.code.localeCompare(b.code)),
      });
    }
    const loose = visible.filter((t) => !isStock(t) && t.customerId == null);
    if (loose.length) out.push({ key: "loose", title: "No client", sub: "A destination but no client — open one to assign it.", items: loose });
    return out;
  }, [visible]);

  // Only an explicit selection is printed: one click must never mark every code shown (sold stands included) as printed.
  const toPrint = tags.filter((t) => sel.has(t.id));
  // Stand print files: black stands are left out until their design exists (never printed on the white one).
  const zipTags = blackDesign ? toPrint : toPrint.filter((t) => standVariant(t) !== "black");
  const blackLeftOut = toPrint.length - zipTags.length;
  const printedInZip = zipTags.filter((t) => t.printedAt).length;
  const printedInSheet = toPrint.filter((t) => t.printedAt).length;
  const pages: StandCard[][] = [];
  for (let i = 0; i < toPrint.length; i += PER_PAGE) pages.push(toPrint.slice(i, i + PER_PAGE));
  const zipOk = zipTags.length > 0 && zipTags.length <= 300;

  const toggle = (id: number) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function printSheet() {
    setAsk(null);
    const res = await logPrintSheetAction(toPrint.map((t) => t.id));
    if (!res.ok) {
      toast.err("Couldn’t prepare the sheet", res.error);
      return;
    }
    window.setTimeout(() => window.print(), 50);
  }

  return (
    <>
      <div className="card mt22 screen-only">
        <div className="card-h">
          <div>
            <h3>QR codes by client</h3>
            <div className="sub">Same link as each chip — tap a card to open its stand. Scans count as “QR” in Analytics.</div>
          </div>
          <div className="toolbar">
            <label className="search">
              <span className="sr-only">Search QR codes</span>
              <IconSearch />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code, client, link…" />
            </label>
            <label className="sr-only" htmlFor="qr-kind">
              Product type
            </label>
            <select id="qr-kind" className="select sm" style={{ width: 140 }} value={kind} onChange={(e) => setKind(e.target.value as "" | TagKind)}>
              <option value="">All types</option>
              {TAG_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <label className="check">
              <input type="checkbox" className="chk" checked={hideDisabled} onChange={(e) => setHideDisabled(e.target.checked)} />
              Hide disabled
            </label>
          </div>
        </div>
        <div className="row wrap mt16" style={{ justifyContent: "space-between" }}>
          <span className="hint">
            {sel.size ? (
              <>
                {sel.size} selected · {printedInSheet ? `${printedInSheet} already printed · ` : ""}A4 sheet: {pages.length} page{pages.length === 1 ? "" : "s"}
              </>
            ) : (
              <>
                {visible.length} code{visible.length === 1 ? "" : "s"} shown · tick the codes to print (or “Select” on a group)
              </>
            )}
          </span>
          <div className="row wrap">
            <button type="button" className="btn sm" onClick={() => setSel(new Set(visible.map((t) => t.id)))} disabled={!visible.length}>
              Select all shown
            </button>
            <button type="button" className="btn sm" onClick={() => setSel(new Set())} disabled={!sel.size}>
              Clear
            </button>
            {!zipTags.length ? (
              <button type="button" className="btn sm" disabled title={sel.size ? `${NO_BLACK_DESIGN}` : "Select the codes to print first"}>
                <IconDownload /> Stand print files{blackLeftOut ? ` · ${blackLeftOut} black left out` : ""}
              </button>
            ) : printedInZip && zipOk ? (
              <button type="button" className="btn sm" onClick={() => setAsk("zip")}>
                <IconDownload /> Stand print files ({zipTags.length})
              </button>
            ) : (
              <a
                className="btn sm"
                href={printZipHref({ ids: zipTags.map((t) => t.id) })}
                aria-disabled={!zipOk}
                tabIndex={zipOk ? undefined : -1}
                download
                title={
                  blackLeftOut
                    ? `${NO_BLACK_DESIGN}: ${blackLeftOut} black stand${blackLeftOut === 1 ? "" : "s"} left out`
                    : "Stand prints (owner design + QR, PNG + PDF) and a chip sheet, as a ZIP"
                }
              >
                <IconDownload /> Stand print files ({zipTags.length}){blackLeftOut ? ` · ${blackLeftOut} black left out` : ""}
              </a>
            )}
            <button
              type="button"
              className="btn sm p"
              onClick={() => setAsk("sheet")}
              disabled={!toPrint.length}
              title={toPrint.length ? undefined : "Select the codes to print first"}
            >
              <IconPrint /> Print A4 sheet{toPrint.length ? ` (${toPrint.length})` : ""}
            </button>
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="hint mt16">No QR code matches these filters.</p>
        ) : (
          groups.map((g) => (
            <section className="qr-sec" key={g.key} aria-label={g.title}>
              <div className="row between wrap">
                <div style={{ minWidth: 0 }}>
                  <h4>{g.href ? <Link href={g.href}>{g.title} →</Link> : g.title}</h4>
                  <div className="hint">{g.sub}</div>
                </div>
                <button
                  type="button"
                  className="btn xs"
                  onClick={() =>
                    setSel((s) => {
                      const n = new Set(s);
                      const all = g.items.every((t) => n.has(t.id));
                      for (const t of g.items) {
                        if (all) n.delete(t.id);
                        else n.add(t.id);
                      }
                      return n;
                    })
                  }
                >
                  {g.items.every((t) => sel.has(t.id)) ? "Unselect" : "Select"} {g.items.length}
                </button>
              </div>
              <div className="qr-grid">
                {g.items.map((t, i) => (
                  <motion.div
                    key={t.id}
                    className={`qr-card${sel.has(t.id) ? " sel" : ""}${t.status === "disabled" ? " disabled" : ""}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: Math.min(i * 0.02, 0.3) }}
                  >
                    <input type="checkbox" className="chk" aria-label={`Select ${t.code} for printing`} checked={sel.has(t.id)} onChange={() => toggle(t.id)} />
                    <Link className="q" href={standHref(t.code)} aria-label={`Open stand ${t.code}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- authenticated dynamic SVG */}
                      <img src={`/api/admin/tags/${t.id}/qr?format=svg`} alt={`QR code for ${displayLink(t.link)}`} loading="lazy" width={150} height={150} />
                    </Link>
                    <b>
                      <Link href={standHref(t.code)}>{t.code}</Link>
                    </b>
                    <div className="meta">
                      <small title={t.label}>
                        {t.product}
                        {!isStock(t) && t.tapCount ? ` · ${fmtInt(t.taps30d)}/30 d · ${fmtInt(t.tapCount)} taps` : ""}
                      </small>
                      <span className="pills">
                        <TagStatusPill status={t.status} stock={isStock(t)} url={t.destinationUrl} />
                        {t.kind === "stand" || t.chipStatus !== "none" ? <ChipPill status={t.chipStatus} short /> : null}
                        {t.printedAt ? <Pill tone="gray">Printed {fmtDate(t.printedAt)}</Pill> : null}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <Modal
        open={ask !== null}
        onClose={() => setAsk(null)}
        title={
          ask === "sheet"
            ? `Print ${fmtInt(toPrint.length)} code${toPrint.length === 1 ? "" : "s"} on the A4 sheet?`
            : "Download these print files?"
        }
        subtitle={
          ask === "sheet"
            ? `${fmtInt(toPrint.length)} code${toPrint.length === 1 ? "" : "s"} will be recorded as printed${printedInSheet ? ` — ${fmtInt(printedInSheet)} already were` : ""}.`
            : `${fmtInt(printedInZip)} of these ${fmtInt(zipTags.length)} codes were already printed.`
        }
        size="sm"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setAsk(null)} data-autofocus>
              Cancel
            </button>
            {ask === "zip" ? (
              <a className="btn danger" href={printZipHref({ ids: zipTags.map((t) => t.id) })} download onClick={() => setAsk(null)}>
                <IconDownload /> Download anyway
              </a>
            ) : (
              <button type="button" className={`btn ${printedInSheet ? "danger" : "p"}`} onClick={() => void printSheet()}>
                <IconPrint /> {printedInSheet ? "Print anyway" : "Print"}
              </button>
            )}
          </>
        }
      >
        {ask === "sheet" && !printedInSheet ? (
          <p className="hint">
            They count as printed even if you cancel the print dialog: Stock — not printed yet stops offering them, and their stand print files
            will ask before printing again. Select only the codes you are printing now.
          </p>
        ) : (
          <p className="hint">
            One code = one stand: a second print of a code puts the same link on two stands, and the second client’s taps open the first client’s
            page. Re-print only to replace a lost or damaged print — or select just the codes you need (Stock — not printed yet).
          </p>
        )}
      </Modal>

      <div className="print-only" aria-hidden>
        {pages.map((page, p) => (
          <div className="sheet-page" key={p}>
            {page.map((t) => (
              <div className="cell" key={t.id}>
                <span className="cut tl" />
                <span className="cut tr" />
                <span className="cut bl" />
                <span className="cut br" />
                {/* eslint-disable-next-line @next/next/no-img-element -- print asset */}
                <img className="brand" src="/brand/mark_black.png" alt="" />
                {/* eslint-disable-next-line @next/next/no-img-element -- authenticated dynamic SVG */}
                <img src={`/api/admin/tags/${t.id}/qr?format=svg`} alt="" />
                <b>{t.code}</b>
                <small>{t.customerName ?? t.label}</small>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
