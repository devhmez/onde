"use client";
// Small stand controls shared by the edit panel, the stand page, the customer page and the order page:
// chip status (not written / written / tested / locked), print files (with a warning before re-printing a code that
// already went out), and "Return to stock" (undo a wrong assignment).
import { useState } from "react";
import { releaseTagAction } from "@/app/(admin)/admin/actions";
import { standVariant } from "@/lib/business";
import { Modal } from "../controls";
import { displayLink, fmtDate, fmtInt, fmtMoney, timeAgo } from "../format";
import { IconDownload } from "../icons";
import { CHIP_META, CHIP_STATUSES, NO_BLACK_DESIGN, printFileHref } from "../meta";
import { useToast } from "../toast";
import type { ChipStatus, TagKind } from "../types";

// ─────────────────────────────── chip status ───────────────────────────────

export function ChipControl({
  status,
  at,
  onChange,
  disabled,
}: {
  status: ChipStatus;
  at: number | null;
  onChange: (next: ChipStatus) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(status);
  const [prop, setProp] = useState(status);
  if (prop !== status) {
    setProp(status);
    setShown(status);
  }
  const m = CHIP_META[shown];
  return (
    <div>
      <div className="lbl">NFC chip</div>
      <div className="seg full" role="radiogroup" aria-label="NFC chip status">
        {CHIP_STATUSES.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={shown === c}
            className={shown === c ? `on c-${CHIP_META[c].tone}` : undefined}
            disabled={disabled || busy}
            onClick={async () => {
              if (c === shown) return;
              const prev = shown;
              setShown(c);
              setBusy(true);
              const ok = await onChange(c);
              setBusy(false);
              if (!ok) setShown(prev);
            }}
          >
            {CHIP_META[c].label}
          </button>
        ))}
      </div>
      <p className="hint chip-hint" suppressHydrationWarning>
        {m.hint}
        {at && shown === status && status !== "none" ? ` · since ${timeAgo(at)}` : ""}
      </p>
    </div>
  );
}

// ─────────────────────────────── print files ───────────────────────────────

/**
 * Print PDF / Print PNG of one stand (owner design + QR + code). A code that already went out in a print download asks
 * first: two stands with one code send the second client's taps to the first client's page.
 */
export function PrintFileButtons({
  tag,
  printedAt,
  blackDesign,
  size = "xs",
}: {
  tag: { id: number; code: string; kind: TagKind; label: string };
  printedAt: number | null;
  blackDesign: boolean;
  size?: "xs" | "sm";
}) {
  const [ask, setAsk] = useState<null | "pdf" | "png">(null);
  if (tag.kind !== "stand") return null;
  if (standVariant(tag) === "black" && !blackDesign) {
    return (
      <button type="button" className={`btn ${size}`} disabled title="The print would use the white stand design">
        <IconDownload /> {NO_BLACK_DESIGN}
      </button>
    );
  }
  const link = (format: "pdf" | "png", label: string, title: string) =>
    printedAt ? (
      <button type="button" className={`btn ${size}`} onClick={() => setAsk(format)} title={`${title} — already printed ${fmtDate(printedAt)}`}>
        <IconDownload /> {label}
      </button>
    ) : (
      <a className={`btn ${size}`} href={printFileHref(tag.id, format)} download={`ONDE-${tag.code}.${format}`} title={title}>
        <IconDownload /> {label}
      </a>
    );
  return (
    <>
      {link("pdf", "Print PDF", "Stand print, 12 × 12 cm, owner design + this QR")}
      {link("png", "Print PNG", "Stand print, 12 × 12 cm, 423 dpi")}
      <Modal
        open={ask !== null}
        onClose={() => setAsk(null)}
        title={`Print ${tag.code} again?`}
        subtitle={printedAt ? `Its print file was already downloaded on ${fmtDate(printedAt)}.` : undefined}
        size="sm"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setAsk(null)} data-autofocus>
              Cancel
            </button>
            {ask ? (
              <a className="btn danger" href={printFileHref(tag.id, ask)} download={`ONDE-${tag.code}.${ask}`} onClick={() => setAsk(null)}>
                <IconDownload /> Download again ({ask.toUpperCase()})
              </a>
            ) : null}
          </>
        }
      >
        <p className="hint">
          One code = one stand. Print it again only to replace a lost or damaged stand — and throw the old print away, or the two stands will
          share every tap.
        </p>
      </Modal>
    </>
  );
}

// ─────────────────────────────── return to stock ───────────────────────────────

export type ReleaseInfo = {
  id: number;
  code: string;
  tapCount: number;
  destinationUrl: string;
  customerName: string | null;
  orderNumber: string | null;
  /** The in-person sale it was handed over with (still counted, its only stand): offered for cancelling with it. */
  sale?: { number: string; total: number } | null;
};

/** "Return to stock" with a confirmation that says exactly what changes (customer, order, destination, taps). */
export function ReleaseButton({
  tag,
  label = "Return to stock…",
  className = "btn xs",
  onReleased,
}: {
  tag: ReleaseInfo;
  label?: string;
  className?: string;
  onReleased?: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // On by default: a stand sold to the wrong client must not leave a sale (and a returning discount) behind. For a
  // misread code the same client is simply sold the right stand again, which records its sale.
  const [cancelSale, setCancelSale] = useState(true);
  const sale = tag.sale ?? null;
  async function release() {
    setBusy(true);
    const res = await releaseTagAction(tag.id, { cancelSale: Boolean(sale && cancelSale) });
    setBusy(false);
    if (!res.ok) {
      toast.err("Couldn’t return it to stock", res.error);
      return;
    }
    setOpen(false);
    toast.ok(
      `${tag.code} is back in stock`,
      res.data.cancelledSale
        ? `Sale ${res.data.cancelledSale.number} cancelled — it no longer counts in revenue. Sell the stand again from the Stock list.`
        : res.data.order
          ? `Order ${res.data.order.number} now waits for a stand again — use the right code there.`
          : "Sell it again from the Stock list.",
    );
    onReleased?.();
  }
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Return ${tag.code} to stock?`}
        subtitle="Use this to undo a wrong assignment (a misread code, the wrong client) or a stand that came back."
        size="sm"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setOpen(false)} data-autofocus>
              Keep it
            </button>
            <button type="button" className="btn danger" onClick={release} disabled={busy}>
              {busy ? "Returning…" : tag.tapCount ? `Return & delete ${fmtInt(tag.tapCount)} tap${tag.tapCount === 1 ? "" : "s"}` : "Return to stock"}
            </button>
          </>
        }
      >
        <ul className="bullets">
          {tag.customerName ? (
            <li>
              Removed from <b>{tag.customerName}</b>
              {tag.orderNumber ? (
                <>
                  {" "}
                  and {sale ? "sale" : "order"} <b>{tag.orderNumber}</b>
                  {sale && cancelSale ? " (cancelled)" : " (it will wait for a stand again)"}
                </>
              ) : null}
              .
            </li>
          ) : tag.orderNumber ? (
            <li>
              Removed from order <b>{tag.orderNumber}</b>.
            </li>
          ) : null}
          {tag.destinationUrl ? (
            <li>
              Destination cleared (<span className="mono">{displayLink(tag.destinationUrl)}</span>) — taps show the ONDE “not activated yet”
              page until it is sold again.
            </li>
          ) : null}
          {tag.tapCount ? (
            <li>
              Its <b>{fmtInt(tag.tapCount)}</b> tap{tag.tapCount === 1 ? "" : "s"} since it was assigned {tag.tapCount === 1 ? "is" : "are"}{" "}
              deleted, so the client’s figures and the dashboard stay right.
            </li>
          ) : null}
          <li>The chip and the print don’t change: the same stand can be sold again.</li>
        </ul>
        {sale ? (
          <label className="check mt12" style={{ fontSize: 13, alignItems: "flex-start" }}>
            <input type="checkbox" className="chk" checked={cancelSale} onChange={(e) => setCancelSale(e.target.checked)} />
            <span>
              Also cancel sale <b>{sale.number}</b> ({fmtMoney(sale.total)}, paid in person)
              <small className="hint" style={{ display: "block" }}>
                {cancelSale
                  ? "Wrong client or stand given back: the sale stops counting in revenue. Selling the stand again records a new one."
                  : `Keep it only if ${tag.customerName ?? "the client"} paid and gets another stand: their sale ${sale.number} will wait for that stand.`}
              </small>
            </span>
          </label>
        ) : null}
      </Modal>
    </>
  );
}
