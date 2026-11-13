"use client";
// Customer page → "Stands & links": every product this client owns as a card — QR, code (as printed under the QR),
// product, location label ("Comptoir" — the client sees and can edit it on their page), live/disabled, chip, where it
// points, taps (30 days + total), and the actions the owner needs at the counter: change destination, print file,
// disable/enable, open the stand. Plus "Sell a stock stand" to this client.
import Link from "next/link";
import { useId, useRef, useState } from "react";
import { updateTagAction } from "@/app/(admin)/admin/actions";
import { setTagLocationAction } from "@/app/(admin)/admin/portal-actions";
import { reconcileDestinationType } from "@/lib/destination-type";
import { normalizeDestination } from "../destinations";
import { displayLink, fmtDate, fmtInt, timeAgo } from "../format";
import { IconExternal, IconPin, IconPlus } from "../icons";
import { DEST_META, DEST_TYPES, standHref } from "../meta";
import SellStand from "../products/SellStand";
import { PrintFileButtons } from "../products/StandControls";
import { useToast } from "../toast";
import type { CustomerOption, DestinationType, StandCard } from "../types";
import { ChipPill, EmptyState, Swatch, TagStatusPill } from "../ui";

function DestinationForm({ s, onDone }: { s: StandCard; onDone: () => void }) {
  const toast = useToast();
  const uid = useId();
  const [type, setType] = useState<DestinationType>(s.destinationType);
  const [url, setUrl] = useState(s.destinationUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const norm = url.trim() ? normalizeDestination(type, url) : null;
  const finalType = norm?.ok ? (reconcileDestinationType(type, norm.url) as DestinationType) : type;
  return (
    <form
      className="qdest"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!norm) return setError("Paste the link this stand should open.");
        if (!norm.ok) return setError(norm.error);
        setBusy(true);
        const res = await updateTagAction({ id: s.id, destinationType: finalType, destinationUrl: norm.url });
        setBusy(false);
        if (!res.ok) return setError(res.error);
        toast.ok(`${s.code} now opens ${DEST_META[res.data.tag.destinationType].label}`, `${displayLink(res.data.tag.destinationUrl)} — chip and print unchanged.`);
        onDone();
      }}
    >
      <label className="sr-only" htmlFor={`${uid}-t`}>
        Destination type
      </label>
      <select id={`${uid}-t`} className="select" value={type} onChange={(e) => setType(e.target.value as DestinationType)}>
        {DEST_TYPES.map((t) => (
          <option key={t} value={t}>
            {DEST_META[t].label}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor={`${uid}-u`}>
        Destination link
      </label>
      <input
        id={`${uid}-u`}
        className={`input${error ? " bad" : ""}`}
        value={url}
        placeholder={DEST_META[type].placeholder}
        inputMode={type === "whatsapp" || type === "contact" ? "tel" : type === "instagram" || type === "tiktok" ? "email" : "url"}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => {
          setUrl(e.target.value);
          setError(null);
          // The pasted link decides the type when it clearly belongs to a platform (Instagram link → Instagram).
          const n = e.target.value.trim() ? normalizeDestination(type, e.target.value) : null;
          if (n?.ok) setType(reconcileDestinationType(type, n.url) as DestinationType);
        }}
      />
      <span className={error ? "err" : "hint"}>
        {error ??
          (norm?.ok ? (
            <>
              Will open <span className="mono vio3">{displayLink(norm.url)}</span>
              {` · ${DEST_META[finalType].label}`}
            </>
          ) : (
            DEST_META[type].hint
          ))}
      </span>
      <div className="row">
        <button type="submit" className="btn sm p" disabled={busy}>
          {busy ? "Saving…" : "Save — update instantly"}
        </button>
        <button type="button" className="btn sm" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Where the product stands ("Comptoir", "Terrasse") — shown on the client's page; they can edit it there too. */
function LocationLabel({ s, customerId }: { s: StandCard; customerId: number }) {
  const toast = useToast();
  const uid = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(s.locationLabel ?? "");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const current = s.locationLabel ?? "";
  const stop = () => {
    setEditing(false);
    window.setTimeout(() => opener.current?.focus(), 0);
  };
  if (!editing) {
    return (
      <button
        ref={opener}
        type="button"
        className={`sloc${current ? "" : " add"}`}
        title="Location label — shown on the client page (the client can edit it too)"
        aria-label={current ? `Location of ${s.code}: ${current} — edit` : `Add a location to ${s.code}`}
        onClick={() => {
          setDraft(current);
          setEditing(true);
          window.setTimeout(() => input.current?.focus(), 0);
        }}
      >
        {current ? <IconPin /> : <IconPlus />}
        <span>{current || "Location"}</span>
      </button>
    );
  }
  return (
    <form
      className="sloc-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (draft.trim() === current) return stop();
        setBusy(true);
        try {
          const res = await setTagLocationAction(customerId, s.id, draft);
          if (res.ok) {
            toast.ok(draft.trim() ? `${s.code} · ${draft.trim()}` : `${s.code}: location removed`, "The client sees it on their page.");
            stop();
          } else toast.err("Couldn’t save the location", res.error);
        } catch {
          toast.err("Couldn’t save the location", "Network error — try again.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="sr-only" htmlFor={`${uid}-loc`}>
        Location of {s.code}
      </label>
      <input
        ref={input}
        id={`${uid}-loc`}
        className="input sm"
        value={draft}
        maxLength={40}
        placeholder="e.g. Comptoir, Terrasse"
        autoComplete="off"
        enterKeyHint="done"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            stop();
          }
        }}
      />
      <button type="submit" className="btn xs p" disabled={busy}>
        {busy ? "Saving…" : "Save"}
      </button>
      <button type="button" className="btn xs" onClick={stop} disabled={busy}>
        Cancel
      </button>
    </form>
  );
}

function Card({ s, blackDesign, customerId }: { s: StandCard; blackDesign: boolean; customerId: number }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const live = s.status === "active";
  return (
    <article className={`scard${live ? "" : " off"}`} aria-label={`Stand ${s.code}`}>
      {/* Two groups (display: contents in a grid of cards): a lone card lays them out side by side (admin.css). */}
      <div className="scard-main">
        <div className="scard-top">
          <Link className="q" href={standHref(s.code)} aria-label={`Open stand ${s.code}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- authenticated dynamic SVG */}
            <img src={`/api/admin/tags/${s.id}/qr?format=svg`} alt={`QR code of ${s.code}`} width={64} height={64} loading="lazy" />
          </Link>
          <div className="scard-id">
            <span className="code">
              <Link href={standHref(s.code)}>{s.code}</Link>
            </span>
            <small>
              {s.product} · {s.printedAt ? `printed ${fmtDate(s.printedAt)}` : "not printed"}
            </small>
            <LocationLabel s={s} customerId={customerId} />
            <span className="pills">
              <TagStatusPill status={s.status} url={s.destinationUrl} />
              <ChipPill status={s.chipStatus} />
            </span>
          </div>
        </div>
        <div className="dest-line">
          {s.destinationUrl ? (
            <>
              <span className="dest">
                <Swatch type={s.destinationType} />
                {DEST_META[s.destinationType].label}
              </span>
              <a href={s.destinationUrl} target="_blank" rel="noreferrer" title={s.destinationUrl}>
                {displayLink(s.destinationUrl)}
              </a>
            </>
          ) : (
            <>
              <span className="dest unset">
                <Swatch type={s.destinationType} unset />
                No destination yet
              </span>
              <span className="u">Taps show “not activated yet” — add their link.</span>
            </>
          )}
        </div>
      </div>
      <div className="scard-side">
        <div className="nums">
          <span>
            <b>{fmtInt(s.taps30d)}</b> tap{s.taps30d === 1 ? "" : "s"} · 30 d
          </span>
          <span>
            <b>{fmtInt(s.tapCount)}</b> total
          </span>
          <span suppressHydrationWarning>last {timeAgo(s.lastTapAt)}</span>
        </div>
        {editing ? (
          <DestinationForm s={s} onDone={() => setEditing(false)} />
        ) : (
          <div className="acts">
            <button type="button" className={`btn xs${s.destinationUrl ? "" : " p"}`} onClick={() => setEditing(true)}>
              {s.destinationUrl ? "Change destination" : "Add their link"}
            </button>
            <PrintFileButtons tag={s} printedAt={s.printedAt} blackDesign={blackDesign} />
            <button
              type="button"
              className={`btn xs${live ? " danger" : " okb"}`}
              disabled={toggling}
              onClick={async () => {
                setToggling(true);
                const res = await updateTagAction({ id: s.id, status: live ? "disabled" : "active" });
                setToggling(false);
                if (!res.ok) toast.err("Couldn’t change the status", res.error);
                else if (live) toast.info(`${s.code} disabled`, "Taps now land on the ONDE “inactive” page.");
                else toast.ok(`${s.code} is live again`, "Taps go straight to the destination.");
              }}
            >
              {live ? "Disable" : "Enable"}
            </button>
            {s.destinationUrl ? (
              <a className="btn xs" href={s.destinationUrl} target="_blank" rel="noreferrer" aria-label={`Open the destination of ${s.code}`}>
                <IconExternal />
              </a>
            ) : null}
            <Link className="btn xs" href={standHref(s.code)}>
              Open →
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}

export default function CustomerStands({
  stands,
  customer,
  blackDesign,
  stockCount,
}: {
  stands: StandCard[];
  customer: CustomerOption;
  blackDesign: boolean;
  /** Stock links available to sell (any kind). */
  stockCount: number;
}) {
  const [selling, setSelling] = useState(false);
  const lastUrl = stands.find((s) => s.destinationUrl && s.destinationType === "google_review")?.destinationUrl ?? "";
  return (
    <div>
      <div className="card-h">
        <div>
          <h3>Stands &amp; links</h3>
          <div className="sub">
            {stands.length
              ? `${stands.length} product${stands.length === 1 ? "" : "s"} — the code is the one printed under each QR.`
              : "Nothing yet — sell a stand from stock, or create links from an order."}
          </div>
        </div>
        {stockCount > 0 ? (
          <button type="button" className={`btn sm${selling ? "" : " p"}`} aria-expanded={selling} onClick={() => setSelling((v) => !v)}>
            {selling ? "Close" : "+ Sell a stock stand"}
          </button>
        ) : null}
      </div>
      {selling ? (
        <SellStand
          stand={null}
          customers={[customer]}
          fixedCustomer={customer}
          defaultUrl={lastUrl}
          title={`Sell a stock stand to ${customer.businessName?.trim() || customer.name}`}
          onSold={() => setSelling(false)}
        />
      ) : null}
      {stands.length === 0 ? (
        !selling ? (
          <EmptyState title="No stands yet">
            {stockCount > 0 ? `${stockCount} stand${stockCount === 1 ? " is" : "s are"} in stock — “+ Sell a stock stand” assigns one in a step.` : "Create stock in Products → + Add stock, or create links from one of their orders."}
          </EmptyState>
        ) : null
      ) : (
        <div className={`stand-cards${stands.length === 1 ? " one" : ""}`}>
          {stands.map((s) => (
            <Card key={s.id} s={s} blackDesign={blackDesign} customerId={customer.id} />
          ))}
        </div>
      )}
    </div>
  );
}
