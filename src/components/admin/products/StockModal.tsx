"use client";
// "+ Add stock": create N smart links at once for one product model — no customer, no destination — to print on
// stands and write to chips in advance. Taps show the branded "not activated yet" page until the link is sold.
import Image from "next/image";
import { motion } from "motion/react";
import { useId, useState } from "react";
import { createStockTagsAction } from "@/app/(admin)/admin/actions";
import { standVariant } from "@/lib/business";
import { Modal } from "../controls";
import { IconDownload } from "../icons";
import { NO_BLACK_DESIGN, printZipHref, STOCK_MODELS } from "../meta";
import { useToast } from "../toast";
import type { TagRow } from "../types";

type ModelId = (typeof STOCK_MODELS)[number]["id"];
const QUICK = [5, 10, 20, 50];

export default function StockModal({
  open,
  onClose,
  onCreated,
  blackDesign,
}: {
  open: boolean;
  onClose: () => void;
  /** Called with the new links (the workspace switches to the Stock view behind the modal). */
  onCreated: (rows: TagRow[]) => void;
  /** The black stand's print design is installed (until then black stands get no print files). */
  blackDesign: boolean;
}) {
  const toast = useToast();
  const uid = useId();
  const [modelId, setModelId] = useState<ModelId>("stand-white");
  const [count, setCount] = useState("20");
  const [notes, setNotes] = useState("");
  const [bleed, setBleed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<TagRow[] | null>(null);

  const model = STOCK_MODELS.find((m) => m.id === modelId) ?? STOCK_MODELS[0];
  const n = Number.parseInt(count, 10);
  const valid = Number.isInteger(n) && n >= 1 && n <= 200;

  function reset() {
    setCount("20");
    setNotes("");
    setError(null);
    setCreated(null);
  }

  async function submit() {
    if (!valid) {
      setError("Enter a number between 1 and 200.");
      return;
    }
    setPending(true);
    setError(null);
    const res = await createStockTagsAction({ kind: model.kind, count: n, label: model.label, notes: notes.trim() || undefined });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCreated(res.data.tags);
    onCreated(res.data.tags);
    const printable = blackDesign || !res.data.tags.some((t) => standVariant(t) === "black");
    toast.ok(
      `${res.data.tags.length} stock link${res.data.tags.length > 1 ? "s" : ""} created`,
      printable ? "Download the print files, then write the chips." : "Print them once the black design is added.",
    );
  }

  const close = () => {
    onClose();
    window.setTimeout(reset, 250);
  };

  const stands = created?.filter((t) => t.kind === "stand").length ?? 0;
  // Never hand out the white design for black stands: no print files until the black design exists.
  const noDesign = !blackDesign && (created?.some((t) => standVariant(t) === "black") ?? false);

  return (
    <Modal
      open={open}
      onClose={close}
      title={created ? `${created.length} stock link${created.length > 1 ? "s" : ""} ready` : "Add stock"}
      subtitle={
        created
          ? "Each code is permanent. Print it, write it to its chip, and assign it to a customer the day you sell it."
          : "Create codes in advance — no customer, no destination yet. Taps show the ONDE “not activated yet” page until you assign them."
      }
      footer={
        created ? (
          <>
            <button type="button" className="btn" onClick={reset}>
              Create more
            </button>
            <button type="button" className="btn p" onClick={close} data-autofocus>
              Done
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <button type="button" className="btn p" onClick={submit} disabled={pending || !valid}>
              {pending ? "Creating…" : `Create ${valid ? n : ""} stock link${n === 1 ? "" : "s"}`}
            </button>
          </>
        )
      }
    >
      {created ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
          <div className="code-grid" aria-label="New codes">
            {created.map((t) => (
              <span key={t.id}>{t.code}</span>
            ))}
          </div>
          <div className="notice mt16">
            <div>
              {noDesign ? (
                <>
                  <b>Print files</b> — none for black stands yet: there is no black design, and they are never printed on the white one. The codes
                  are saved; print them from the Stock tab once the black design is added.
                </>
              ) : (
                <>
                  <b>Print files</b> — {stands ? `one PNG + PDF per stand (owner design, 12 × 12 cm, QR in the box)` : "QR files"} and a chip
                  sheet listing every link to write.
                </>
              )}
              <div className="row wrap mt12">
                {noDesign ? (
                  <button type="button" className="btn sm" disabled title="The print files would use the white stand design">
                    <IconDownload /> {NO_BLACK_DESIGN}
                  </button>
                ) : (
                  <a className="btn sm p" href={printZipHref({ ids: created.map((t) => t.id), bleed })} download>
                    <IconDownload /> Download print files (ZIP)
                  </a>
                )}
                {stands && !noDesign ? (
                  <label className="check" style={{ fontSize: 12.5 }}>
                    <input type="checkbox" className="chk" checked={bleed} onChange={(e) => setBleed(e.target.checked)} />
                    + PDFs with 3 mm bleed
                  </label>
                ) : null}
              </div>
            </div>
          </div>
        </motion.div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="field">
            <span className="flabel">Product</span>
            <div className="kind-pick five" role="group" aria-label="Product model">
              {STOCK_MODELS.map((m) => (
                <button key={m.id} type="button" aria-pressed={modelId === m.id} onClick={() => setModelId(m.id)}>
                  <Image src={m.image} alt="" width={64} height={64} />
                  {m.short}
                </button>
              ))}
            </div>
          </div>
          <div className="form-grid mt16">
            <div className="field">
              <label htmlFor={`${uid}-n`}>How many</label>
              <input
                id={`${uid}-n`}
                className={`input${count && !valid ? " bad" : ""}`}
                inputMode="numeric"
                value={count}
                onChange={(e) => {
                  setCount(e.target.value.replace(/\D/g, "").slice(0, 3));
                  setError(null);
                }}
              />
              <div className="qty-chips">
                {QUICK.map((q) => (
                  <button key={q} type="button" className="btn xs" aria-pressed={n === q} onClick={() => setCount(String(q))}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label htmlFor={`${uid}-notes`}>Batch note</label>
              <input
                id={`${uid}-notes`}
                className="input"
                value={notes}
                maxLength={200}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional — e.g. Print run #1, Oct 2026"
              />
              <span className="hint">Saved on each link (notes).</span>
            </div>
          </div>
          {model.id === "stand-black" && !blackDesign ? (
            <p className="hint mt12" role="note">
              <b>{NO_BLACK_DESIGN}.</b> The codes and the chip links work, but there are no print files for black stands until the owner
              supplies the black design (assets/print/stand12-design-black.png).
            </p>
          ) : null}
          <p className="hint mt12">
            Labels them “{model.label}”. Codes are 6 characters without look-alikes (no 0/O, 1/I/L…). Nothing is printed or written yet
            {model.id === "stand-black" && !blackDesign ? "." : " — you get the print files right after."}
          </p>
          {error ? (
            <p className="err mt12" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>
      )}
    </Modal>
  );
}
