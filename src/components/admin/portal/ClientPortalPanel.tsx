"use client";
// Customer page → "Client page" (right column): the customer's private page (onde.tn/c/<token>) — on/off, mode
// (Direct / Needs my approval), link with Copy / WhatsApp / View dashboard / Open as client / Regenerate; then pending
// requests (Approve / Reject) and the latest link changes with who made them (You / Client) and a one-click Revert.
// Location labels are edited on the stand cards (CustomerStands), not here.
import { useId, useState, useTransition, type ReactNode } from "react";
import {
  decidePortalRequestAction,
  regeneratePortalAction,
  revertDestinationAction,
  setPortalEnabledAction,
  setPortalModeAction,
} from "@/app/(admin)/admin/portal-actions";
import type { PortalAdminView } from "@/server/portal";
import { Modal, Switch } from "../controls";
import { displayLink, fmtDate, timeAgo } from "../format";
import { IconCheck, IconCopy, IconDashboard, IconExternal, IconWhatsApp } from "../icons";
import { DEST_META } from "../meta";
import { useToast } from "../toast";
import type { DestinationType } from "../types";
import { Pill, Swatch } from "../ui";
import { clientLinkWhatsapp, copyText } from "./share";
import "./portal-admin.css";

/** Recent changes shown before "Show all". */
const HISTORY_SHOWN = 5;

type Result = { ok: true; data: { view: PortalAdminView } } | { ok: false; error: string };

function DestLine({ type, url }: { type: DestinationType | null; url: string | null }) {
  if (!type || !url) return <span className="muted">Not set</span>;
  return (
    <span className="pa-dest" title={url}>
      <Swatch type={type} />
      <b>{DEST_META[type]?.label ?? type}</b>
      <span className="muted pa-url">{displayLink(url)}</span>
    </span>
  );
}

export default function ClientPortalPanel({ customerId, view }: { customerId: number; view: PortalAdminView }) {
  const toast = useToast();
  const uid = useId();
  const [busy, start] = useTransition();
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [allHistory, setAllHistory] = useState(false);
  const dashboard = `/admin/customers/${customerId}/dashboard`;

  const run = (fn: () => Promise<Result>, ok?: string, after?: () => void) =>
    start(async () => {
      try {
        const r = await fn();
        if (r.ok) {
          if (ok) toast.ok(ok);
          after?.();
        } else toast.err("Couldn’t update the client page", r.error);
      } catch {
        toast.err("Couldn’t update the client page", "Network error — try again.");
      }
    });

  const link = view.link;
  const wa = link ? clientLinkWhatsapp(view.phone, view.firstName, link) : "";

  async function copy() {
    if (!link) return;
    await copyText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  let pageCard: ReactNode;
  if (!link) {
    pageCard = (
      <div className="pa-empty">
        <p>
          Give this customer a private page where they see their taps and change where their products lead — no account, no
          password: the link is the key.
        </p>
        <div className="btns">
          <button type="button" className="btn p" disabled={busy} onClick={() => run(() => setPortalEnabledAction(customerId, true), "Client page created")}>
            Create client page
          </button>
          <a className="btn" href={dashboard}>
            <IconDashboard /> View dashboard
          </a>
        </div>
      </div>
    );
  } else {
    pageCard = (
      <>
        <div className="lbl">Private link</div>
        <div className="pa-link">
          <input id={`${uid}-link`} className={`input sm mono${view.enabled ? "" : " pa-dim"}`} value={link} readOnly aria-label="Client page link" onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="btn sm" onClick={copy} aria-label="Copy the client page link">
            {copied ? <IconCheck style={{ color: "var(--ok)" }} /> : <IconCopy />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <div className="btns pa-btns">
          <a className="btn sm wa" href={wa} target="_blank" rel="noreferrer noopener" aria-disabled={!view.enabled}>
            <IconWhatsApp /> Send on WhatsApp
          </a>
          <a className="btn sm p" href={dashboard} title="Their dashboard, exactly as they see it — your changes there are recorded as yours">
            <IconDashboard /> View dashboard
          </a>
        </div>
        <div className="btns pa-btns">
          <a className="btn sm ghost" href={`${link}?preview=1`} target="_blank" rel="noreferrer noopener" aria-disabled={!view.enabled}>
            Open as client <IconExternal />
          </a>
          <button type="button" className="btn sm ghost danger" onClick={() => setConfirmRegen(true)} disabled={busy}>
            Regenerate link
          </button>
        </div>
        <p className="hint mt8">
          {view.createdAt ? `Link created ${fmtDate(view.createdAt)}` : "Link created"} ·{" "}
          <span suppressHydrationWarning>{view.seenAt ? `client last opened it ${timeAgo(view.seenAt)}` : "not opened by the client yet"}</span>
          {view.phone ? null : " · no WhatsApp number on file: you’ll pick the chat"}
        </p>
        {!view.enabled ? (
          <div className="notice warn mt12">
            <span>
              <b>The page is off.</b> The link shows “link not valid”. Turn it back on to reactivate the same link, or regenerate a new one.
            </span>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <section id="client-page" className="pa" aria-labelledby={`${uid}-title`}>
      <div className="card">
        <div className="card-h">
          <div>
            <h3 id={`${uid}-title`}>Client page</h3>
            <div className="sub">Their taps, their products — and they change their own links.</div>
          </div>
          {link ? (
            <div className="row">
              {view.enabled ? <Pill tone="on" live>On</Pill> : <Pill tone="gray">Off</Pill>}
              <Switch
                checked={view.enabled}
                label="Client page on"
                disabled={busy}
                tone="ok"
                onChange={(v) => run(() => setPortalEnabledAction(customerId, v), v ? "Client page turned on" : "Client page turned off — the link no longer works")}
              />
            </div>
          ) : null}
        </div>
        {pageCard}

        <div className="lbl">When the client changes a link</div>
        <div className="seg" role="radiogroup" aria-label="Client changes">
          {(
            [
              ["direct", "Direct"],
              ["approval", "Needs my approval"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={view.mode === m}
              className={view.mode === m ? "on" : undefined}
              disabled={busy}
              onClick={() => {
                if (view.mode !== m) run(() => setPortalModeAction(customerId, m), m === "direct" ? "Client changes now apply instantly" : "Client changes now need your approval");
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="hint mt8">
          {view.mode === "direct"
            ? "Changes apply instantly. You get an iPhone notification for each one and can undo it below."
            : "Each change becomes a request: nothing changes until you approve it. You get an iPhone notification."}{" "}
          {view.changesToday}/{view.limit} client changes in the last 24 h.
        </p>
      </div>

      <div className="card">
        <div className="card-h">
          <div>
            <h3>Requests &amp; link changes</h3>
            <div className="sub">Who changed what — and one click to go back.</div>
          </div>
          {view.pending.length ? (
            <Pill tone="gold" live>
              {view.pending.length} waiting
            </Pill>
          ) : null}
        </div>

        {view.pending.length ? (
          <>
            <div className="lbl">Waiting for your approval</div>
            <ul className="pa-list">
              {view.pending.map((r) => (
                <li key={r.id} className="pa-req">
                  <div className="pa-req-h">
                    <span className="mono">{r.code}</span>
                    {r.location ? <span className="muted">· {r.location}</span> : null}
                    <span className="muted pa-when" suppressHydrationWarning>
                      {timeAgo(r.createdAt)}
                    </span>
                  </div>
                  <div className="pa-change">
                    <div className="pa-from">
                      <DestLine type={r.fromType} url={r.fromUrl} />
                    </div>
                    <div className="pa-to">
                      <span className="pa-arrow" aria-label="to">
                        →
                      </span>
                      <DestLine type={r.toType} url={r.toUrl} />
                    </div>
                  </div>
                  <div className="btns">
                    <button type="button" className="btn sm okb" disabled={busy} onClick={() => run(() => decidePortalRequestAction(r.id, "approve"), `${r.code} now goes to ${DEST_META[r.toType]?.label ?? "the new link"}`)}>
                      Approve
                    </button>
                    <button type="button" className="btn sm danger" disabled={busy} onClick={() => run(() => decidePortalRequestAction(r.id, "reject"), "Request rejected")}>
                      Reject
                    </button>
                    <a className="btn sm ghost" href={r.toUrl} target="_blank" rel="noreferrer noopener">
                      Check link <IconExternal />
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <div className="lbl">Recent changes</div>
        {view.history.length === 0 ? (
          <p className="hint">No destination change yet.</p>
        ) : (
          <>
            <ul className="pa-list">
              {(allHistory ? view.history : view.history.slice(0, HISTORY_SHOWN)).map((h) => (
                <li key={h.id} className="pa-hist">
                  <div className="pa-req-h">
                    {h.actor === "client" ? <Pill tone="vio">Client</Pill> : <Pill tone="gray">You</Pill>}
                    <span className="mono">{h.code}</span>
                    {h.location ? <span className="muted">· {h.location}</span> : null}
                    <span className="muted pa-when" suppressHydrationWarning>
                      {timeAgo(h.changedAt)}
                    </span>
                  </div>
                  <div className="pa-change">
                    {h.fromUrl ? (
                      <div className="pa-from">
                        <DestLine type={h.fromType} url={h.fromUrl} />
                      </div>
                    ) : null}
                    <div className="pa-to">
                      {h.fromUrl ? (
                        <span className="pa-arrow" aria-label="to">
                          →
                        </span>
                      ) : (
                        <span className="muted">Set to</span>
                      )}
                      <DestLine type={h.toType} url={h.toUrl} />
                      {h.canRevert ? (
                        <button
                          type="button"
                          className="btn xs pa-revert"
                          disabled={busy}
                          title={`Put ${h.code} back to ${h.fromUrl ?? ""}`}
                          onClick={() =>
                            run(
                              () => revertDestinationAction(customerId, h.id),
                              `${h.code} is back on ${h.fromType ? (DEST_META[h.fromType]?.label ?? "its previous link") : "its previous link"}`,
                            )
                          }
                        >
                          Revert
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {view.history.length > HISTORY_SHOWN ? (
              <button type="button" className="linkbtn pa-more" aria-expanded={allHistory} onClick={() => setAllHistory((v) => !v)}>
                {allHistory ? "Show fewer" : `Show all ${view.history.length} changes`}
              </button>
            ) : null}
          </>
        )}
      </div>

      <Modal
        open={confirmRegen}
        onClose={() => setConfirmRegen(false)}
        title="Regenerate the link?"
        subtitle="The current link stops working immediately. Send the new one to the client."
        size="sm"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setConfirmRegen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn p"
              disabled={busy}
              data-autofocus
              onClick={() => run(() => regeneratePortalAction(customerId), "New link created — the old one no longer works", () => setConfirmRegen(false))}
            >
              Regenerate
            </button>
          </>
        }
      >
        <p className="hint">Use it if the link was shared with the wrong person. The client’s products, taps and settings stay as they are.</p>
      </Modal>
    </section>
  );
}
