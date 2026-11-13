"use client";
// Order → "Smart links": one permanent onde.tn/t/CODE per physical unit.
// "Use a stock stand" comes first whenever printed stock exists: type the code printed under its QR and that link
// becomes the unit's smart link (no second code). A wrong code is undone with "Not this stand? Undo" (back to stock).
// Minting new codes asks first while printed stock waits; a minted code that nothing carries yet (never printed,
// tapped or written) can be replaced by a stock stand.
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useId, useState } from "react";
import { assignStockTagAction, createTagsForOrderAction } from "@/app/(admin)/admin/actions";
import { CopyButton, Modal } from "../controls";
import { displayLink, fmtDate, fmtInt } from "../format";
import { DEST_META, kindNoun, standHref, TAG_KINDS } from "../meta";
import { PrintFileButtons, ReleaseButton } from "../products/StandControls";
import { useToast } from "../toast";
import type { StandCard, TagKind } from "../types";
import { ChipPill, EmptyState, TagStatusPill } from "../ui";

type PerKind = Partial<Record<TagKind, number>>;

export default function OrderTags({
  orderId,
  orderNumber,
  tags,
  cancelled,
  missingByKind,
  stockByKind,
  replaceableByKind,
  blackDesign,
  inPersonSale = null,
}: {
  orderId: number;
  orderNumber: string;
  tags: StandCard[];
  cancelled: boolean;
  /** Units of the order still without a smart link, per kind. */
  missingByKind: PerKind;
  /** Stock links (printed in advance, not sold) per kind. */
  stockByKind: PerKind;
  /** Codes minted for this order that nothing physical carries yet, per kind (a stock stand may replace them). */
  replaceableByKind: Partial<Record<TagKind, string[]>>;
  blackDesign: boolean;
  /** This order is an in-person sale with this one stand: Return to stock offers to cancel it. */
  inPersonSale?: { number: string; total: number } | null;
}) {
  const toast = useToast();
  const uid = useId();
  const [pending, setPending] = useState(false);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [code, setCode] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [replace, setReplace] = useState<{ code: string; message: string } | null>(null);
  const [confirmMint, setConfirmMint] = useState(false);
  /** The stock stand just used here: its card offers "Not this stand? Undo". */
  const [undoId, setUndoId] = useState<number | null>(null);

  // Kinds this order still needs (or has only an unprinted minted code for) AND has in stock: printed stock first.
  const usable = TAG_KINDS.filter((k) => ((missingByKind[k] ?? 0) > 0 || (replaceableByKind[k]?.length ?? 0) > 0) && (stockByKind[k] ?? 0) > 0);
  const missing = TAG_KINDS.reduce((n, k) => n + (missingByKind[k] ?? 0), 0);
  const stockForMissing = TAG_KINDS.filter((k) => (missingByKind[k] ?? 0) > 0 && (stockByKind[k] ?? 0) > 0);

  async function assignStock(replaceCode?: string) {
    const c = code.trim();
    if (!c) {
      setCodeError("Type the code printed under the QR.");
      return;
    }
    setAssigning(true);
    setCodeError(null);
    const res = await assignStockTagAction({ orderId, code: c, replace: replaceCode });
    setAssigning(false);
    if (!res.ok) {
      if ("replaceCode" in res) setReplace({ code: res.replaceCode, message: res.error });
      else setCodeError(res.error);
      return;
    }
    const t = res.data.tag;
    setCode("");
    setReplace(null);
    setFresh(new Set([t.id]));
    setUndoId(t.id);
    const live = t.status === "active";
    toast.ok(
      `${t.code} is now this order’s ${kindNoun(t.kind)}`,
      [
        res.data.replaced ? `${res.data.replaced} (never printed) was deleted.` : null,
        res.data.activated ? "It was disabled — it is live again." : null,
        t.destinationUrl && live ? "Its taps open the customer’s link — chip and print unchanged." : "No destination yet: open it and paste the customer’s link.",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  async function generate() {
    setConfirmMint(false);
    setPending(true);
    const res = await createTagsForOrderAction(orderId);
    setPending(false);
    if (!res.ok) return toast.err("Couldn’t create the smart links", res.error);
    if (res.data.tags.length === 0) return toast.info("Nothing to create", "Every unit of this order already has its smart link.");
    setFresh(new Set(res.data.tags.map((t) => t.id)));
    toast.ok(`${res.data.tags.length} smart link${res.data.tags.length > 1 ? "s" : ""} created`, "New codes: print them, write each chip, then tap to test.");
  }

  return (
    <div>
      <div className="card-h">
        <div>
          <h3>Smart links</h3>
          <div className="sub">One permanent onde.tn/t/CODE per physical product (packs expand automatically).</div>
        </div>
        {!cancelled && (missing > 0 || tags.length === 0) ? (
          <button
            type="button"
            className={`btn sm${tags.length || usable.length ? "" : " p"}`}
            onClick={() => (stockForMissing.length ? setConfirmMint(true) : void generate())}
            disabled={pending}
            title={usable.length ? "Mints new codes — for products that are not printed yet" : undefined}
          >
            {pending ? "Creating…" : tags.length ? "Create missing links" : usable.length ? "Create new codes instead" : "Create smart links for this order"}
          </button>
        ) : null}
      </div>
      {!cancelled && usable.length ? (
        <form
          className="stockbar"
          onSubmit={(e) => {
            e.preventDefault();
            void assignStock();
          }}
        >
          <label htmlFor={`${uid}-code`} className="grow" style={{ minWidth: 200 }}>
            <b>{usable.includes("stand") ? "Use a stock stand" : `Use a stock ${kindNoun(usable[0])}`}</b> — type the code printed under its QR (or tap
            the stand: the page shows it).{" "}
            {usable.map((k, i) => (
              <span key={k}>
                {i ? " · " : ""}
                {fmtInt(stockByKind[k] ?? 0)} {kindNoun(k)}
                {(stockByKind[k] ?? 0) === 1 ? "" : "s"} in stock
              </span>
            ))}
          </label>
          <input
            id={`${uid}-code`}
            className={`input sm mono${codeError ? " bad" : ""}`}
            style={{ width: 130, textTransform: "uppercase" }}
            value={code}
            maxLength={16}
            placeholder="K7M3QX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={codeError ? true : undefined}
            aria-describedby={codeError ? `${uid}-err` : undefined}
            onChange={(e) => {
              setCode(e.target.value);
              setCodeError(null);
              setReplace(null);
            }}
          />
          <button type="submit" className="btn sm p" disabled={assigning}>
            {assigning ? "Using…" : "Use"}
          </button>
          {codeError ? (
            <span id={`${uid}-err`} className="err" role="alert" style={{ flexBasis: "100%" }}>
              {codeError}
            </span>
          ) : null}
          {replace ? (
            <span className="notice warn" role="alert" style={{ flexBasis: "100%" }}>
              <span>
                {replace.message} Replace <b className="mono">{replace.code}</b> with <b className="mono">{code.trim().toUpperCase()}</b>?{" "}
                {replace.code} is deleted (it exists on no stand).
                <span className="row wrap mt8">
                  <button type="button" className="btn sm p" disabled={assigning} onClick={() => void assignStock(replace.code)}>
                    Replace {replace.code}
                  </button>
                  <button type="button" className="btn sm" onClick={() => setReplace(null)}>
                    Cancel
                  </button>
                </span>
              </span>
            </span>
          ) : null}
        </form>
      ) : null}
      {tags.length === 0 ? (
        <EmptyState title="No smart links for this order yet">
          {cancelled
            ? "This order is cancelled — reopen it to create its smart links."
            : usable.length
              ? "Selling a stand you already printed? Use its code above. Otherwise create new codes once the order is confirmed."
              : "Generate them once the order is confirmed. Destinations are pre-filled from what the customer asked for."}
        </EmptyState>
      ) : (
        <div className="stand-cards">
          <AnimatePresence initial={false}>
            {tags.map((t, i) => (
              <motion.article
                key={t.id}
                className={`scard${t.status === "active" ? "" : " off"}`}
                initial={fresh.has(t.id) ? { opacity: 0, y: 10, scale: 0.96 } : false}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 320, damping: 26, delay: fresh.has(t.id) ? i * 0.05 : 0 }}
              >
                <div className="scard-top">
                  <Link className="q" href={standHref(t.code)} aria-label={`Open stand ${t.code}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- authenticated dynamic SVG */}
                    <img src={`/api/admin/tags/${t.id}/qr?format=svg`} alt="" width={64} height={64} />
                  </Link>
                  <div className="scard-id">
                    <span className="copy code">
                      <Link href={standHref(t.code)}>{t.code}</Link>
                      <CopyButton text={t.link} label={`Copy chip link ${displayLink(t.link)}`} />
                    </span>
                    <small>
                      {t.product} · {t.printedAt ? `printed ${fmtDate(t.printedAt)}` : "not printed"}
                    </small>
                    <span className="pills">
                      <TagStatusPill status={t.status} url={t.destinationUrl} />
                      <ChipPill status={t.chipStatus} />
                    </span>
                  </div>
                </div>
                <div className="dest-line">
                  {t.destinationUrl ? (
                    <>
                      <span>{DEST_META[t.destinationType].label}</span>
                      <a href={t.destinationUrl} target="_blank" rel="noreferrer">
                        {displayLink(t.destinationUrl)}
                      </a>
                    </>
                  ) : (
                    <span className="u">No destination yet — open it and paste the customer’s link.</span>
                  )}
                </div>
                <div className="acts">
                  <Link className="btn xs" href={standHref(t.code)}>
                    Open / configure
                  </Link>
                  <PrintFileButtons tag={t} printedAt={t.printedAt} blackDesign={blackDesign} />
                  <ReleaseButton
                    tag={{ id: t.id, code: t.code, tapCount: t.tapCount, destinationUrl: t.destinationUrl, customerName: t.customerName, orderNumber, sale: inPersonSale }}
                    label={undoId === t.id ? "Not this stand? Undo" : "Return to stock…"}
                    className={`btn xs${undoId === t.id ? " danger" : ""}`}
                  />
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </div>
      )}

      <Modal
        open={confirmMint}
        onClose={() => setConfirmMint(false)}
        title="Create new codes?"
        subtitle={stockForMissing.map((k) => `${fmtInt(stockByKind[k] ?? 0)} ${kindNoun(k)}${(stockByKind[k] ?? 0) === 1 ? " is" : "s are"} in stock`).join(" · ")}
        size="sm"
        footer={
          <>
            <button
              type="button"
              className="btn p"
              onClick={() => {
                setConfirmMint(false);
                window.setTimeout(() => document.getElementById(`${uid}-code`)?.focus(), 60);
              }}
              data-autofocus
            >
              Use a stock stand
            </button>
            <button type="button" className="btn" onClick={() => void generate()}>
              Create new codes
            </button>
          </>
        }
      >
        <p className="hint">
          New codes have <b>no print and no chip</b> yet. If the stand you hand over comes from your printed stock, type its code in “Use a stock
          stand” instead — otherwise the order gets a second code that is on no stand.
        </p>
      </Modal>
    </div>
  );
}
