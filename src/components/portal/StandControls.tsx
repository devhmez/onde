"use client";
// Small interactive bits of a product card: the location label editor and the pending-request note (the client can
// withdraw their request; the owner's view approves or rejects it).
import { useId, useRef, useState, useTransition } from "react";
import { IconClock, IconPencil, IconPin, IconPlus } from "./icons";
import { LOCATION_MAX } from "./model";
import { usePortalActions } from "./PortalActions";

export function LocationEditor({
  code,
  value,
  t,
}: {
  code: string;
  value: string | null;
  t: { add: string; addAria: string; label: string; placeholder: string; save: string; cancel: string; edit: string; error: string };
}) {
  const actions = usePortalActions();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [failed, setFailed] = useState(false);
  const [busy, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const uid = useId();

  const begin = () => {
    setDraft(value ?? "");
    setFailed(false);
    setEditing(true);
    window.setTimeout(() => input.current?.focus(), 0);
  };
  const stop = () => {
    setEditing(false);
    window.setTimeout(() => opener.current?.focus(), 0);
  };
  const save = () =>
    start(async () => {
      try {
        const r = await actions.saveLocation({ code, label: draft });
        if (r.ok) stop();
        else setFailed(true);
      } catch {
        setFailed(true);
      }
    });

  if (!editing) {
    return value ? (
      <button ref={opener} type="button" className="pt-loc" onClick={begin} aria-label={`${t.edit} — ${value}`}>
        <IconPin width={14} height={14} />
        <span>{value}</span>
        <IconPencil width={13} height={13} className="pt-loc-ed" />
      </button>
    ) : (
      <button ref={opener} type="button" className="pt-loc add" onClick={begin} aria-label={t.addAria}>
        <IconPlus width={13} height={13} />
        <span>{t.add}</span>
      </button>
    );
  }
  return (
    <form
      className="pt-loc-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label htmlFor={`${uid}-loc`} className="pt-sr">
        {t.label}
      </label>
      <input
        ref={input}
        id={`${uid}-loc`}
        className="pt-input sm"
        value={draft}
        maxLength={LOCATION_MAX}
        placeholder={t.placeholder}
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
      <button type="submit" className="pt-btn sm p" disabled={busy}>
        {t.save}
      </button>
      <button type="button" className="pt-btn sm" onClick={stop} disabled={busy}>
        {t.cancel}
      </button>
      {failed ? (
        <p className="pt-err" role="alert">
          {t.error}
        </p>
      ) : null}
    </form>
  );
}

export function PendingNote({
  code,
  title,
  body,
  url,
  cancelLabel,
  approveLabel,
  rejectLabel,
  errorLabel,
}: {
  code: string;
  title: string;
  body: string;
  url: string;
  cancelLabel: string;
  /** Owner's view only (never sent to a client's page). */
  approveLabel?: string;
  rejectLabel?: string;
  errorLabel: string;
}) {
  const actions = usePortalActions();
  const [busy, start] = useTransition();
  const [failed, setFailed] = useState(false);
  const run = (fn: () => Promise<{ ok: boolean }>) =>
    start(async () => {
      try {
        setFailed(!(await fn()).ok);
      } catch {
        setFailed(true);
      }
    });
  return (
    <div className="pt-pending" role="status">
      <IconClock width={18} height={18} />
      <div className="pt-pending-txt">
        <b>{title}</b>
        <span>{body}</span>
        <span className="pt-url">{url}</span>
        {failed ? <span className="pt-err">{errorLabel}</span> : null}
      </div>
      {actions.viewer === "owner" ? (
        <div className="pt-pending-acts">
          <button type="button" className="pt-btn sm ok" disabled={busy} onClick={() => run(() => actions.decide({ code, decision: "approve" }))}>
            {approveLabel}
          </button>
          <button type="button" className="pt-btn sm ghost" disabled={busy} onClick={() => run(() => actions.decide({ code, decision: "reject" }))}>
            {rejectLabel}
          </button>
        </div>
      ) : (
        <button type="button" className="pt-btn sm ghost" disabled={busy} onClick={() => run(() => actions.cancel({ code }))}>
          {cancelLabel}
        </button>
      )}
    </div>
  );
}
