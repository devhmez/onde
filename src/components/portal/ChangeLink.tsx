"use client";
// "Changer le lien": one dialog for the whole page (opened by each product's button), three steps —
//   1. choose the type + paste the link  →  server validates (actions.preview)
//   2. "Les clients arriveront ici : …"   →  confirm (actions.submit: applied now, or sent for approval)
//   3. done / request sent
// When the client has no change left today, the dialog opens on a "limit reached" notice instead of the form.
// The owner's view (actions.viewer === "owner") uses the same dialog: applied at once, no limit, an admin note.
// A native <dialog> (focus trap, Esc, inert page) styled as a bottom sheet on phones and a centred card on desktop.
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import type { DestinationType } from "../admin/types";
import { fill, type PortalDict } from "./dict";
import { shortUrl } from "./format";
import { DestIcon, IconChat, IconCheck, IconClock, IconExternal, IconX } from "./icons";
import { CHOICE_TYPE, choiceForType, LINK_CHOICES, PORTAL_DAILY_LIMIT, type LinkChoice, type LinkError, type LinkPreview, type PortalMode } from "./model";
import { usePortalActions } from "./PortalActions";

/** `owner`: the admin-only strings — only the owner's view passes them, so they never reach a client's page payload. */
export type ChangeDict = Pick<PortalDict, "change" | "choices" | "types" | "errors"> & { owner?: PortalDict["owner"] };
export type ChangeStand = { code: string; name: string; destType: DestinationType; destUrl: string };
/** "Écrire à ONDE" from the limit notice (WhatsApp link + label), when ONDE has a WhatsApp number. */
export type ChangeHelp = { href: string; label: string } | null;

type Ctx = { open: (code: string, opener: HTMLElement | null) => void };
const OpenCtx = createContext<Ctx | null>(null);

/** Errors about what was typed: only these turn the link field red. */
const LINK_INPUT_ERRORS = new Set<LinkError | "network">(["empty", "invalid", "not_https", "blocked_host", "wrong_platform", "too_long", "same"]);

/**
 * iPhone keyboard per choice: numbers for WhatsApp, the e-mail keyboard (@ and . on the first screen) where an @handle
 * is the usual answer, the URL keyboard for links. Never auto-capitalized or auto-corrected (see the input).
 */
const INPUT_MODE: Record<LinkChoice, "tel" | "email" | "url"> = {
  google: "url",
  instagram: "email",
  facebook: "url",
  tiktok: "email",
  site: "url",
  whatsapp: "tel",
  other: "url",
};

export function ChangeLinkProvider({
  mode,
  changesLeft,
  stands,
  t,
  help,
  children,
}: {
  mode: PortalMode;
  changesLeft: number;
  stands: ChangeStand[];
  t: ChangeDict;
  help: ChangeHelp;
  children: ReactNode;
}) {
  const [code, setCode] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const open = useCallback((c: string, el: HTMLElement | null) => {
    opener.current = el;
    setCode(c);
  }, []);
  const close = useCallback(() => {
    setCode(null);
    const el = opener.current;
    window.setTimeout(() => el?.focus(), 0);
  }, []);
  const stand = code ? (stands.find((s) => s.code === code) ?? null) : null;
  return (
    <OpenCtx.Provider value={{ open }}>
      {children}
      {stand ? <ChangeDialog key={stand.code} mode={mode} changesLeft={changesLeft} stand={stand} t={t} help={help} onClose={close} /> : null}
    </OpenCtx.Provider>
  );
}

export function ChangeLinkButton({ code, label, ariaLabel }: { code: string; label: string; ariaLabel: string }) {
  const ctx = useContext(OpenCtx);
  return (
    <button type="button" className="pt-btn p" aria-label={ariaLabel} aria-haspopup="dialog" onClick={(e) => ctx?.open(code, e.currentTarget)}>
      {label}
    </button>
  );
}

type Step = "limit" | "form" | "preview" | "done";
type Done = { status: "applied" | "pending"; preview: LinkPreview; changesLeft: number };

/** A tap that lands within this delay of a new step belongs to the previous one (double tap): it is ignored. */
const STEP_GUARD_MS = 350;

function ChangeDialog({
  mode,
  changesLeft,
  stand,
  t,
  help,
  onClose,
}: {
  mode: PortalMode;
  changesLeft: number;
  stand: ChangeStand;
  t: ChangeDict;
  help: ChangeHelp;
  onClose: () => void;
}) {
  const actions = usePortalActions();
  const owner = actions.viewer === "owner";
  // The owner's changes apply at once, whatever the client's mode.
  const effectiveMode: PortalMode = owner ? "direct" : mode;
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const uid = useId();
  const [step, setStep] = useState<Step>(!owner && changesLeft <= 0 ? "limit" : "form");
  const [choice, setChoice] = useState<LinkChoice>(choiceForType(stand.destType));
  const [link, setLink] = useState("");
  const [error, setError] = useState<LinkError | "network" | null>(null);
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [busy, startTransition] = useTransition();
  // `busy` only updates on the next render: a double tap lands twice before the button is disabled. This guard is
  // synchronous, so a second check / confirm never starts while one is in flight (the server is idempotent too).
  const inflight = useRef(false);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    document.documentElement.classList.add("pt-lock");
    return () => {
      document.documentElement.classList.remove("pt-lock");
      if (d?.open) d.close();
    };
  }, []);

  // Move focus to the new step's heading so screen readers announce it. Remember when the step appeared: a double
  // tap on "Continuer" must not land its second tap on "Confirmer" before the preview could be read, nor a double tap
  // on "Confirmer" its second tap on "Fermer" (same place on a phone) before "C'est fait !" could be seen.
  const first = useRef(true);
  const stepShownAt = useRef(0);
  const goTo = (s: Step) => {
    stepShownAt.current = performance.now();
    setStep(s);
  };
  useEffect(() => {
    stepShownAt.current = performance.now();
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus();
  }, [step]);
  const tooSoon = () => performance.now() - stepShownAt.current < STEP_GUARD_MS;

  const message = (e: LinkError | "network") => fill(t.errors[e], { type: t.types[CHOICE_TYPE[choice]] });
  const c = t.choices[choice];
  const linkError = error !== null && LINK_INPUT_ERRORS.has(error);

  function check() {
    if (busy || inflight.current) return;
    if (!link.trim()) {
      setError("empty");
      input.current?.focus();
      return;
    }
    setError(null);
    inflight.current = true;
    startTransition(async () => {
      try {
        const r = await actions.preview({ code: stand.code, choice, link });
        if (r.ok) {
          setPreview(r.preview);
          goTo("preview");
        } else if (r.error === "daily_limit" && !owner) {
          goTo("limit");
        } else {
          setError(r.error);
          if (LINK_INPUT_ERRORS.has(r.error)) input.current?.focus();
        }
      } catch {
        setError("network");
      } finally {
        inflight.current = false;
      }
    });
  }

  function confirm() {
    if (busy || inflight.current || tooSoon()) return;
    setError(null);
    inflight.current = true;
    startTransition(async () => {
      try {
        const r = await actions.submit({ code: stand.code, choice, link });
        if (r.ok) {
          setDone({ status: r.status, preview: r.preview, changesLeft: r.changesLeft });
          goTo("done");
        } else if (r.error === "daily_limit" && !owner) {
          goTo("limit");
        } else {
          setError(r.error);
          if (LINK_INPUT_ERRORS.has(r.error)) goTo("form");
        }
      } catch {
        setError("network");
      } finally {
        inflight.current = false;
      }
    });
  }

  /** "Fermer" on the last step: not for the second tap of a double tap on "Confirmer". */
  const closeDone = () => {
    if (tooSoon()) return;
    onClose();
  };

  const left = done ? done.changesLeft : changesLeft;
  const leftText = owner ? (t.owner?.left ?? "") : left === 1 ? t.change.leftOne : fill(t.change.left, { n: left });
  const title =
    step === "limit"
      ? t.change.limitTitle
      : step === "form"
        ? t.change.title
        : step === "preview"
          ? t.change.checkTitle
          : done?.status === "pending"
            ? t.change.pendingTitle
            : t.change.doneTitle;

  return (
    <dialog
      ref={ref}
      className="pt-sheet"
      aria-labelledby={`${uid}-h`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="pt-sheet-in">
        <div className="pt-sheet-grab" aria-hidden />
        <div className="pt-sheet-h">
          <div>
            <p className="pt-sheet-kicker">
              {stand.name} · <span className="pt-mono">{stand.code}</span>
            </p>
            <h2 id={`${uid}-h`} ref={heading} tabIndex={-1}>
              {title}
            </h2>
          </div>
          <button type="button" className="pt-x" onClick={step === "done" ? closeDone : onClose} aria-label={t.change.close}>
            <IconX width={18} height={18} />
          </button>
        </div>

        {step === "limit" ? (
          <div className="pt-sheet-b">
            <div className="pt-done-top">
              <span className="pt-done-ic gold" aria-hidden>
                <IconClock width={26} height={26} />
              </span>
              <p className="pt-done-txt">{fill(t.change.limitBody, { n: PORTAL_DAILY_LIMIT })}</p>
            </div>
            {help ? <p className="pt-hint">{t.change.limitHelp}</p> : null}
            <div className="pt-sheet-f">
              {help ? (
                <a className="pt-btn wa wide" href={help.href} target="_blank" rel="noreferrer noopener">
                  <IconChat width={17} height={17} />
                  {help.label}
                </a>
              ) : null}
              <button type="button" className={`pt-btn wide${help ? "" : " p"}`} onClick={onClose}>
                {t.change.close}
              </button>
            </div>
          </div>
        ) : null}

        {step === "form" ? (
          <form
            className="pt-sheet-b"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              check();
            }}
          >
            <div className="pt-current">
              <span className="pt-lbl">{t.change.current}</span>
              <div className="pt-current-row">
                <DestIcon type={stand.destType} size={28} unset={!stand.destUrl} />
                <span className="pt-current-txt">
                  <b>{t.types[stand.destType]}</b>
                  {stand.destUrl ? <span>{shortUrl(stand.destUrl)}</span> : null}
                </span>
              </div>
            </div>

            <fieldset className="pt-choices">
              <legend>{t.change.step1}</legend>
              <div className="pt-choice-grid">
                {LINK_CHOICES.map((k) => (
                  <label key={k} className={`pt-choice${choice === k ? " on" : ""}`}>
                    <input
                      type="radio"
                      name={`${uid}-choice`}
                      value={k}
                      checked={choice === k}
                      onChange={() => {
                        setChoice(k);
                        setError(null);
                      }}
                    />
                    <DestIcon type={CHOICE_TYPE[k]} size={28} />
                    <span>{t.choices[k].label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="pt-field">
              <label htmlFor={`${uid}-link`}>{t.change.linkLabel}</label>
              <input
                ref={input}
                id={`${uid}-link`}
                className={`pt-input${linkError ? " bad" : ""}`}
                type="text"
                inputMode={INPUT_MODE[choice]}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                maxLength={2100}
                placeholder={c.placeholder}
                value={link}
                aria-invalid={linkError ? true : undefined}
                aria-describedby={`${uid}-hint ${uid}-err`}
                onChange={(e) => {
                  setLink(e.target.value);
                  if (error) setError(null);
                }}
              />
              <p id={`${uid}-hint`} className="pt-hint">
                {c.hint}
              </p>
              <p id={`${uid}-err`} className="pt-err" role="alert">
                {error ? message(error) : ""}
              </p>
            </div>

            <div className="pt-sheet-f">
              <button type="submit" className="pt-btn p wide" disabled={busy}>
                {busy ? t.change.checking : t.change.continue}
              </button>
              <p className="pt-hint center">{leftText}</p>
            </div>
          </form>
        ) : null}

        {step === "preview" && preview ? (
          <div className="pt-sheet-b">
            <p className="pt-preview-lbl">{t.change.previewTitle}</p>
            <div className="pt-preview">
              <DestIcon type={preview.type} size={44} />
              <div className="pt-preview-txt">
                <b>{t.types[preview.type]}</b>
                <span className="pt-url">{preview.url}</span>
                <a className="pt-link" href={preview.url} target="_blank" rel="noreferrer noopener">
                  {t.change.openCheck} <IconExternal width={14} height={14} />
                </a>
              </div>
            </div>
            <p className={`pt-note${owner ? " vio" : effectiveMode === "approval" ? " gold" : ""}`}>
              {owner ? t.owner?.note : effectiveMode === "approval" ? t.change.approvalNote : t.change.directNote}
            </p>
            <p className="pt-err" role="alert">
              {error ? message(error) : ""}
            </p>
            <div className="pt-sheet-f two">
              <button type="button" className="pt-btn" onClick={() => goTo("form")} disabled={busy}>
                {t.change.back}
              </button>
              <button type="button" className="pt-btn p" onClick={confirm} disabled={busy}>
                {busy ? t.change.saving : effectiveMode === "approval" ? t.change.sendRequest : t.change.confirm}
              </button>
            </div>
          </div>
        ) : null}

        {step === "done" && done ? (
          <div className="pt-sheet-b pt-done">
            <div className="pt-done-top">
              <span className={`pt-done-ic${done.status === "pending" ? " gold" : ""}`} aria-hidden>
                {done.status === "pending" ? <IconClock width={26} height={26} /> : <IconCheck width={26} height={26} />}
              </span>
              <p className="pt-done-txt">
                {done.status === "pending" ? t.change.pendingBody : fill(t.change.doneBody, { code: stand.code, type: t.types[done.preview.type] })}
              </p>
            </div>
            <div className="pt-preview small">
              <DestIcon type={done.preview.type} size={32} />
              <div className="pt-preview-txt">
                <b>{t.types[done.preview.type]}</b>
                <span className="pt-url">{shortUrl(done.preview.url)}</span>
              </div>
            </div>
            <p className="pt-hint center">{leftText}</p>
            <div className="pt-sheet-f">
              <button type="button" className="pt-btn p wide" onClick={closeDone}>
                {t.change.close}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
