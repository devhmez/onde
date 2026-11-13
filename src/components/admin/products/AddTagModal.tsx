"use client";
// "+ Add product": create a smart link (kind, label, customer, destination) and get its code + QR to write to the chip.
// It mints a NEW code that has no print: when printed stock of that kind waits, the modal says so first (selling a
// stock stand keeps one code per stand).
import Image from "next/image";
import { motion } from "motion/react";
import { useId, useState } from "react";
import { createTagAction } from "@/app/(admin)/admin/actions";
import { CopyButton, Modal } from "../controls";
import { normalizeDestination } from "../destinations";
import { displayLink } from "../format";
import { IconDownload } from "../icons";
import { DEST_META, DEST_TYPES, KIND_IMAGE, KIND_LABEL, kindNoun, TAG_KINDS } from "../meta";
import { useToast } from "../toast";
import type { CustomerOption, DestinationType, TagKind, TagRow } from "../types";
import { Swatch } from "../ui";
import CustomerPicker from "./CustomerPicker";

export default function AddTagModal({
  open,
  onClose,
  customers,
  onCreated,
  stockByKind = {},
  onUseStock,
}: {
  open: boolean;
  onClose: () => void;
  customers: CustomerOption[];
  onCreated: (row: TagRow) => void;
  stockByKind?: Partial<Record<TagKind, number>>;
  onUseStock?: () => void;
}) {
  const toast = useToast();
  const uid = useId();
  const [kind, setKind] = useState<TagKind>("stand");
  const [label, setLabel] = useState("");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [type, setType] = useState<DestinationType>("google_review");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<TagRow | null>(null);

  const norm = url.trim() ? normalizeDestination(type, url) : null;

  function reset() {
    setLabel("");
    setUrl("");
    setNotes("");
    setError(null);
    setFields({});
    setCreated(null);
  }

  async function submit() {
    if (norm && !norm.ok) {
      setFields({ destinationUrl: norm.error });
      return;
    }
    setPending(true);
    setError(null);
    setFields({});
    const res = await createTagAction({
      kind,
      label: label.trim() || undefined,
      customerId: customerId ?? undefined,
      destinationType: type,
      destinationUrl: url.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      setFields(res.fields ?? {});
      return;
    }
    setCreated(res.data.tag);
    onCreated(res.data.tag);
    toast.ok(`Smart link ${res.data.tag.code} created`, "Write the link to the chip, then tap to test.");
  }

  const close = () => {
    onClose();
    window.setTimeout(reset, 250);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={created ? "Ready to write" : "Add product"}
      subtitle={created ? "Write this permanent link to the NFC chip once. You can change the destination forever after." : "Every product gets a permanent smart link — onde.tn/t/CODE."}
      footer={
        created ? (
          <>
            <button type="button" className="btn" onClick={reset}>
              Create another
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
            <button type="button" className="btn p" onClick={submit} disabled={pending}>
              {pending ? "Creating…" : "Create smart link"}
            </button>
          </>
        )
      }
    >
      {created ? (
        <motion.div className="created" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 24 }}>
          <div className="bigq">
            {/* eslint-disable-next-line @next/next/no-img-element -- authenticated dynamic SVG */}
            <img src={`/api/admin/tags/${created.id}/qr?format=svg`} alt={`QR code for ${created.code}`} width={144} height={144} />
          </div>
          <div className="code-xl">{created.code}</div>
          <div>
            <span className="url copy">
              {displayLink(created.link)}
              <CopyButton text={created.link} label="Copy permanent link" />
            </span>
          </div>
          <div className="row" style={{ justifyContent: "center", marginTop: 14 }}>
            <a className="btn sm" href={`/api/admin/tags/${created.id}/qr?format=png&size=1024&download=1`} download={`onde-${created.code}.png`}>
              <IconDownload /> PNG
            </a>
            <a className="btn sm" href={`/api/admin/tags/${created.id}/qr?format=svg&download=1`} download={`onde-${created.code}.svg`}>
              <IconDownload /> SVG
            </a>
          </div>
          <p className="hint" style={{ marginTop: 14 }}>
            NFC Tools → Write → Add a record → URL → paste the link → tap the chip.{" "}
            {created.destinationUrl ? (
              <>
                It opens <b style={{ color: "#fff" }}>{DEST_META[created.destinationType].label}</b> right now.
              </>
            ) : (
              <>No destination yet — set one from the panel before handing it over.</>
            )}
          </p>
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
            <div className="kind-pick" role="group" aria-label="Product type">
              {TAG_KINDS.map((k) => (
                <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
                  <Image src={KIND_IMAGE[k]} alt="" width={64} height={64} />
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </div>

          {stockByKind[kind] ? (
            <div className="notice warn mt12" role="note">
              <div>
                <b>
                  {stockByKind[kind]} {kindNoun(kind)}
                  {stockByKind[kind] === 1 ? " is" : "s are"} in stock.
                </b>{" "}
                Selling one of those keeps its printed QR and chip. This creates a new code with no print.{" "}
                {onUseStock ? (
                  <button type="button" className="linkbtn" onClick={onUseStock}>
                    Sell from stock →
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="form-grid mt16">
            <div className="field">
              <label htmlFor={`${uid}-label`}>Label</label>
              <input
                id={`${uid}-label`}
                className="input"
                value={label}
                maxLength={120}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={`e.g. Café Lumière — ${KIND_LABEL[kind].toLowerCase()}`}
              />
            </div>
            <div className="field">
              <label htmlFor={`${uid}-cust`}>Customer</label>
              <CustomerPicker id={`${uid}-cust`} customers={customers} value={customerId} onChange={setCustomerId} />
            </div>
          </div>

          <div className="field mt16">
            <span className="flabel">Destination</span>
            <div className="dest-pick" role="group" aria-label="Destination type">
              {DEST_TYPES.map((t) => (
                <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)}>
                  <Swatch type={t} />
                  {DEST_META[t].label}
                </button>
              ))}
            </div>
          </div>
          <div className="field mt12">
            <label htmlFor={`${uid}-url`}>Link</label>
            <input
              id={`${uid}-url`}
              className={`input${fields.destinationUrl ? " bad" : ""}`}
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setFields({});
              }}
              placeholder={DEST_META[type].placeholder}
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
            />
            {fields.destinationUrl ? (
              <span className="err">{fields.destinationUrl}</span>
            ) : norm?.ok && norm.url !== url.trim() ? (
              <span className="hint">
                Will open <span className="mono vio3">{displayLink(norm.url)}</span>
              </span>
            ) : (
              <span className="hint">{DEST_META[type].hint} Leave empty to configure later.</span>
            )}
          </div>
          <div className="field mt12">
            <label htmlFor={`${uid}-notes`}>Notes</label>
            <textarea id={`${uid}-notes`} className="textarea" style={{ minHeight: 64 }} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
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
