"use client";
// The film's "Edit destination" panel: Current → New destination, Product active switch,
// "Save — update instantly", green "✓ Redirect updated in 0.4 s · chip untouched", permanent link + QR, history.
// A stock stand (not sold yet) shows "Sell this stand" instead of the destination editor. Every stand also shows its
// NFC chip state, links to its client / order / stand page, its print files, and "Return to stock".
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import type { UpdateTagInput } from "@/app/(admin)/admin/actions";
import { deleteTagAction } from "@/app/(admin)/admin/actions";
import { reconcileDestinationType } from "@/lib/destination-type";
import { CopyButton, Modal, Switch } from "../controls";
import { normalizeDestination } from "../destinations";
import { displayLink, fmtDate, fmtInt, timeAgo } from "../format";
import { IconDownload, IconExternal, IconX } from "../icons";
import { DEST_META, isStock, productLabel, standHref } from "../meta";
import { useToast } from "../toast";
import type { ActionResult, CustomerOption, DestinationType, TagDetail, TagRow } from "../types";
import { Pill, Swatch } from "../ui";
import CustomerPicker from "./CustomerPicker";
import DestSelect from "./DestSelect";
import SellStand from "./SellStand";
import { ChipControl, PrintFileButtons, ReleaseButton } from "./StandControls";

export type TagPatch = Omit<UpdateTagInput, "id">;

function seconds(ms: number) {
  const s = ms / 1000;
  return s < 0.1 ? s.toFixed(2) : s.toFixed(1);
}

export default function EditPanel({
  row,
  detail,
  customers,
  blackDesign,
  onUpdate,
  onDeleted,
  onClose,
  onStandPage = false,
}: {
  row: TagRow;
  detail: TagDetail | null;
  customers: CustomerOption[];
  /** The black stand's print design is installed (until then a black stand has no print files). */
  blackDesign: boolean;
  onUpdate: (patch: TagPatch) => Promise<ActionResult<{ tag: TagRow }>>;
  onDeleted: (id: number) => void;
  onClose?: () => void;
  /** Rendered on the stand's own page (no "Stand page" link). */
  onStandPage?: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const newLabelId = useId();
  const urlId = useId();
  const [type, setType] = useState<DestinationType>(row.destinationType);
  const [url, setUrl] = useState(row.destinationUrl);
  const [autoType, setAutoType] = useState<DestinationType | null>(null);
  const [touched, setTouched] = useState(false);
  const stock = isStock(row);
  const [showMore, setShowMore] = useState(false);
  const [label, setLabel] = useState(row.label);
  const [customerId, setCustomerId] = useState<number | null>(row.customerId);
  const [pickerText, setPickerText] = useState("");
  const [notes, setNotes] = useState(row.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "bad" | "info"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const norm = useMemo(() => (url.trim() ? normalizeDestination(type, url) : null), [type, url]);
  const nextUrl = norm?.ok ? norm.url : url.trim();
  const destChanged = type !== row.destinationType || (url.trim() !== "" && nextUrl !== row.destinationUrl);
  const detailsChanged = label.trim() !== row.label || customerId !== row.customerId || notes.trim() !== (row.notes ?? "").trim();
  const dirty = destChanged || detailsChanged;
  const urlError = touched && url.trim() && norm && !norm.ok ? norm.error : touched && !url.trim() && destChanged ? "Paste the link this product should open." : null;
  const live = row.status === "active";

  /** The pasted link decides the type when it clearly belongs to a platform (Instagram link → Instagram). */
  function onUrl(value: string) {
    setUrl(value);
    setFeedback(null);
    const n = value.trim() ? normalizeDestination(type, value) : null;
    if (n?.ok) {
      const next = reconcileDestinationType(type, n.url) as DestinationType;
      if (next !== type) {
        setType(next);
        setAutoType(next);
        return;
      }
    }
    setAutoType(null);
  }

  async function save() {
    if (pickerText) {
      setFeedback({ tone: "bad", text: `“${pickerText}” isn’t a customer — pick one from the list, or clear the field.` });
      return;
    }
    if (!dirty) {
      setFeedback({ tone: "info", text: "Pick a new destination above, then save." });
      return;
    }
    setTouched(true);
    if (destChanged && (!url.trim() || (norm && !norm.ok))) {
      setFeedback({ tone: "bad", text: !url.trim() ? "Paste the link this product should open." : norm && !norm.ok ? norm.error : "Invalid link" });
      return;
    }
    const patch: TagPatch = {};
    if (destChanged) {
      patch.destinationType = type;
      patch.destinationUrl = nextUrl;
    }
    if (label.trim() !== row.label) patch.label = label.trim();
    if (customerId !== row.customerId) patch.customerId = customerId;
    if (notes.trim() !== (row.notes ?? "").trim()) patch.notes = notes.trim();
    setSaving(true);
    setFeedback(null);
    const t0 = performance.now();
    const res = await onUpdate(patch);
    const ms = performance.now() - t0;
    setSaving(false);
    if (res.ok) {
      setUrl(res.data.tag.destinationUrl);
      setType(res.data.tag.destinationType);
      setAutoType(null);
      setLabel(res.data.tag.label);
      setCustomerId(res.data.tag.customerId);
      setNotes(res.data.tag.notes ?? "");
      setTouched(false);
      setFeedback({ tone: "ok", text: destChanged ? `Redirect updated in ${seconds(ms)} s · chip untouched` : `Saved in ${seconds(ms)} s` });
    } else {
      setFeedback({ tone: "bad", text: res.error });
    }
  }

  async function toggleActive(next: boolean) {
    setToggling(true);
    const res = await onUpdate({ status: next ? "active" : "disabled" });
    setToggling(false);
    if (res.ok) {
      if (next) toast.ok(`${row.code} is live again`, stock ? "Not sold yet: taps show the “not activated yet” page." : "Taps go straight to the destination.");
      else toast.info(`${row.code} disabled`, "Taps now land on the ONDE “inactive” page.");
    } else toast.err("Couldn’t change the status", res.error);
  }

  async function remove() {
    setDeleting(true);
    const res = await deleteTagAction(row.id);
    setDeleting(false);
    setConfirmDelete(false);
    if (res.ok) {
      toast.ok(`${row.code} deleted`);
      onDeleted(row.id);
    } else toast.err("Couldn’t delete", res.error);
  }

  const who = row.customerName ?? "Unassigned";
  const qr = `/api/admin/tags/${row.id}/qr`;
  const history = detail?.history ?? null;
  const product = productLabel(row);
  const order = detail?.order ?? null;

  return (
    <div className="card edit">
      <h3>
        {stock ? "Stock stand" : "Edit destination"}
        <span className="row" style={{ gap: 6 }}>
          {!live ? (
            <Pill tone="off">Off</Pill>
          ) : stock ? (
            <Pill tone="gray">Not sold</Pill>
          ) : !row.destinationUrl ? (
            <Pill tone="gold">No link yet</Pill>
          ) : (
            <Pill tone="on" live>
              Live
            </Pill>
          )}
          {onClose ? (
            <button type="button" className="x panel-close" aria-label="Close panel" onClick={onClose}>
              <IconX />
            </button>
          ) : null}
        </span>
      </h3>
      <div className="sub">
        <span className="mono" style={{ color: "#fff" }}>
          {row.code}
        </span>{" "}
        · {stock ? "In stock" : who} · {product}
        {detail ? <> · {detail.printedAt ? `printed ${fmtDate(detail.printedAt)}` : "not printed yet"}</> : null}
      </div>
      <nav className="panel-links" aria-label="Related pages">
        {!onStandPage ? <Link href={standHref(row.code)}>Stand page →</Link> : null}
        {row.customerId ? <Link href={`/admin/customers/${row.customerId}`}>{detail?.customer ? `${who} — profile →` : "Customer profile →"}</Link> : null}
        {row.orderId ? <Link href={`/admin/orders/${row.orderId}`}>{order ? `Order ${order.number} →` : "Order →"}</Link> : null}
      </nav>

      {stock ? (
        <SellStand
          stand={{ id: row.id, code: row.code, product, kind: row.kind }}
          customers={customers}
          title="Sell this stand"
          // From the Products list the sold stand leaves the Stock view: open its page (client, destination, tap test) so the
          // panel never silently moves on to another stock stand. On the stand page it re-renders in place.
          onSold={onStandPage ? undefined : (r) => router.push(standHref(r.tag.code))}
        />
      ) : (
        <>
          <div className="lbl">Current</div>
          <div className="sel" aria-label="Current destination">
            <Swatch type={row.destinationType} unset={!row.destinationUrl} />
            <span className="grow">{row.destinationUrl ? DEST_META[row.destinationType].label : "Not set yet — taps show the inactive page"}</span>
          </div>
          {row.destinationUrl ? (
            <div className="cur-url" title={row.destinationUrl}>
              {displayLink(row.destinationUrl)}
            </div>
          ) : null}

          <div className="arrow" aria-hidden>
            ↓
          </div>

          <div className="lbl" style={{ marginTop: 0 }} id={newLabelId}>
            New destination
          </div>
          <DestSelect value={type} onChange={(t) => (setType(t), setAutoType(null), setFeedback(null))} labelledBy={newLabelId} />
          <label className={`sel sel-url${urlError ? " bad" : ""}`} htmlFor={urlId}>
            <span className="sr-only">Destination link</span>
            <input
              id={urlId}
              value={url}
              placeholder={DEST_META[type].placeholder}
              onChange={(e) => onUrl(e.target.value)}
              onBlur={() => setTouched(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && dirty && !saving) {
                  e.preventDefault();
                  void save();
                }
              }}
              inputMode="url"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>
          <div className="hint" style={{ marginTop: 6 }}>
            {urlError ? (
              <span className="err">{urlError}</span>
            ) : autoType ? (
              <>
                Looks like <b style={{ color: "#fff" }}>{DEST_META[autoType].label}</b> — type switched.
                {norm?.ok ? (
                  <>
                    {" "}
                    Will open <span className="mono vio3">{displayLink(norm.url)}</span>
                  </>
                ) : null}
              </>
            ) : norm?.ok && norm.url !== url.trim() ? (
              <>
                Will open <span className="mono vio3">{displayLink(norm.url)}</span>
              </>
            ) : (
              DEST_META[type].hint
            )}
          </div>
        </>
      )}

      <button type="button" className="disclose" aria-expanded={showMore} onClick={() => setShowMore((s) => !s)}>
        {showMore ? "− Hide details" : stock ? "+ Label & notes" : "+ Label, customer & notes"}
      </button>
      <AnimatePresence initial={false}>
        {showMore ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor={`${urlId}-label`}>Label</label>
              <input id={`${urlId}-label`} className="input" value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} placeholder="Café Lumière — counter stand" />
            </div>
            {!stock ? (
              <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor={`${urlId}-cust`}>Customer</label>
                <CustomerPicker id={`${urlId}-cust`} customers={customers} value={customerId} onChange={setCustomerId} onPendingText={setPickerText} />
                <span className="hint">Wrong client? “Return to stock” below, then sell it again.</span>
              </div>
            ) : null}
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor={`${urlId}-notes`}>Notes</label>
              <textarea id={`${urlId}-notes`} className="textarea" value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} placeholder="Placement, print details, anything useful…" />
            </div>
            {stock ? (
              <button type="button" className="btn sm mt12" onClick={save} disabled={saving || !detailsChanged}>
                Save label & notes
              </button>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <ChipControl
        status={row.chipStatus}
        at={row.chipAt}
        onChange={async (chipStatus) => {
          const res = await onUpdate({ chipStatus });
          if (!res.ok) toast.err("Couldn’t save the chip status", res.error);
          return res.ok;
        }}
      />

      <div className="tog">
        <span>Product active</span>
        <Switch checked={live} onChange={toggleActive} label="Product active" disabled={toggling} />
      </div>

      {!stock ? (
        <>
          <button type="button" className={`save${saving ? " busy" : ""}`} onClick={save} disabled={saving} aria-describedby={`${urlId}-live`}>
            Save — update instantly
          </button>
        </>
      ) : null}
      <div id={`${urlId}-live`} className={`live${feedback && feedback.tone !== "ok" ? ` ${feedback.tone}` : ""}`} aria-live="polite">
        <AnimatePresence mode="wait">
          {feedback ? (
            <motion.span
              key={feedback.text}
              style={{ display: "inline-block" }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              {feedback.tone === "ok" ? "✓ " : ""}
              {feedback.text}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="qr">
        <a className="q" href={`${qr}?format=svg`} target="_blank" rel="noreferrer" aria-label={`Open QR code for ${row.code}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- authenticated dynamic SVG from the admin API */}
          <img src={`${qr}?format=svg`} alt={`QR code for ${displayLink(row.link)}`} width={52} height={52} />
        </a>
        <p>
          Chip link (write it once)
          <br />
          <span className="copy">
            <b>{displayLink(row.link)}</b>
            <CopyButton text={row.link} label="Copy chip link" onCopied={() => toast.ok("Chip link copied", "Paste it in NFC Tools → Write → URL. It never changes.")} />
          </span>
          <br />
          NFC + QR · same link
        </p>
      </div>
      <div className="panel-actions">
        <PrintFileButtons tag={row} printedAt={detail?.printedAt ?? null} blackDesign={blackDesign} />
        {row.kind !== "stand" ? (
          <>
            <a className="btn xs" href={`${qr}?format=png&size=1024&download=1`} download={`onde-${row.code}.png`} title="QR image (counts as printed)">
              <IconDownload /> QR PNG
            </a>
            <a className="btn xs" href={`${qr}?format=svg&download=1`} download={`onde-${row.code}.svg`} title="QR vector (counts as printed)">
              <IconDownload /> QR SVG
            </a>
          </>
        ) : null}
        {row.destinationUrl ? (
          <a className="btn xs" href={row.destinationUrl} target="_blank" rel="noreferrer">
            <IconExternal /> Open destination
          </a>
        ) : null}
      </div>

      <div className="statline">
        <span>
          <b>{fmtInt(row.tapCount)}</b> tap{row.tapCount === 1 ? "" : "s"} total
        </span>
        <span>
          <b>{detail ? fmtInt(detail.taps30d) : "…"}</b> in 30 days
        </span>
        <span suppressHydrationWarning>last tap {timeAgo(row.lastTapAt)}</span>
      </div>
      {stock && row.tapCount ? <p className="hint mt8">Taps on a stand in stock are your chip tests — they reset to 0 when it is sold.</p> : null}

      <div className="lbl">Destination history</div>
      {history === null ? (
        <div className="stack" style={{ gap: 8 }} aria-busy="true">
          <div className="sk" style={{ height: 14 }} />
          <div className="sk" style={{ height: 14, width: "80%" }} />
        </div>
      ) : history.length === 0 ? (
        <p className="hint">No changes yet — every destination you set is logged here.</p>
      ) : (
        <ul className="hist">
          {history.slice(0, 6).map((h) => {
            const to = h.toType as DestinationType;
            const from = h.fromType as DestinationType | null;
            return (
              <li key={h.id} title={`${h.fromUrl ? `${h.fromUrl} → ` : ""}${h.toUrl || "(back to stock)"}`}>
                {from && h.fromUrl ? (
                  <>
                    <Swatch type={from} />
                    <span className="muted">{DEST_META[from]?.label ?? from}</span>
                    <span className="to" aria-hidden>
                      →
                    </span>
                  </>
                ) : (
                  <span className="muted">Set to</span>
                )}
                {h.toUrl ? (
                  <>
                    <Swatch type={to} />
                    <span>{DEST_META[to]?.label ?? to}</span>
                  </>
                ) : (
                  <span>Back to stock</span>
                )}
                {h.actor === "client" ? <span className="pill vio" style={{ height: 18, padding: "0 7px", fontSize: 11 }}>Client</span> : null}
                <span className="when" suppressHydrationWarning>
                  {timeAgo(h.changedAt)}
                </span>
                {h.toUrl ? <span className="hurl">{displayLink(h.toUrl)}</span> : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="danger-zone">
        {!stock ? (
          <ReleaseButton
            tag={{
              id: row.id,
              code: row.code,
              tapCount: row.tapCount,
              destinationUrl: row.destinationUrl,
              customerName: row.customerName,
              orderNumber: order?.number ?? (row.orderId ? `#${row.orderId}` : null),
              sale: detail?.inPersonSale ?? null,
            }}
          />
        ) : null}
        {/* A printed code or a written chip is a physical stand: it is returned to stock or disabled, never deleted. */}
        {row.tapCount === 0 && detail && !detail.printedAt && row.chipStatus === "none" ? (
          <>
            <button type="button" className="btn xs danger" onClick={() => setConfirmDelete(true)}>
              Delete smart link
            </button>
            <span className="hint">Only before it is printed, written or tapped.</span>
          </>
        ) : null}
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${row.code}?`}
        subtitle="The code is freed forever. If this chip is already written or the QR printed, they will lead nowhere."
        size="sm"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setConfirmDelete(false)} data-autofocus>
              Keep it
            </button>
            <button type="button" className="btn danger" onClick={remove} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete permanently"}
            </button>
          </>
        }
      >
        <p className="hint">
          {detail?.printedAt ? `${row.code} was printed on ${fmtDate(detail.printedAt)} — keep it and sell that stand instead. ` : ""}
          Prefer “Product active” off{!stock ? " or “Return to stock”" : ""} if the stand exists.
        </p>
      </Modal>
    </div>
  );
}
