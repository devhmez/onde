"use client";
// The owner's sticky bar above a client's dashboard (/admin/customers/<id>/dashboard): who you are looking at, back to
// the customer, the dashboard's language, and the client link — Copy / Send on WhatsApp, or Create / Turn on.
// Admin UI (English) inside the client page's document: styled by owner-banner.css only (no admin.css here).
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setPortalEnabledAction } from "@/app/(admin)/admin/portal-actions";
import { IconBack, IconCheck, IconCopy, IconWhatsApp } from "../icons";
import { clientLinkWhatsapp, copyText } from "./share";
import "./owner-banner.css";

export type OwnerBannerProps = {
  customerId: number;
  business: string;
  locale: "fr" | "en";
  link: string | null;
  enabled: boolean;
  anonymized: boolean;
  phone: string | null;
  firstName: string;
  /** Client link changes used in the last 24 h / allowed. */
  changesUsed: number;
  limit: number;
  mode: "direct" | "approval";
};

export default function OwnerBanner(p: OwnerBannerProps) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const back = `/admin/customers/${p.customerId}`;

  const turnOn = () =>
    start(async () => {
      setError(null);
      try {
        const r = await setPortalEnabledAction(p.customerId, true);
        if (r.ok) router.refresh();
        else setError(r.error);
      } catch {
        setError("Network error — try again.");
      }
    });

  let linkActions;
  // Anonymized first: the token may survive anonymization, but no client link can be shown, copied or turned on.
  if (p.anonymized) {
    linkActions = <span className="ob-pill">Anonymized — no client link</span>;
  } else if (p.link && p.enabled) {
    const link = p.link;
    linkActions = (
      <>
        <button
          type="button"
          className="ob-btn"
          onClick={async () => {
            await copyText(link);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          }}
        >
          {copied ? <IconCheck width={16} height={16} className="ob-ok" /> : <IconCopy width={16} height={16} />}
          {copied ? (
            <span>Copied</span>
          ) : (
            <span>
              Copy <span className="ob-long">client </span>link
            </span>
          )}
        </button>
        <a className="ob-btn wa" href={clientLinkWhatsapp(p.phone, p.firstName, link)} target="_blank" rel="noreferrer noopener">
          <IconWhatsApp width={16} height={16} />
          <span>
            <span className="ob-long">Send on </span>WhatsApp
          </span>
        </a>
      </>
    );
  } else if (p.link) {
    linkActions = (
      <>
        <span className="ob-pill">Client link off</span>
        <button type="button" className="ob-btn" disabled={busy} onClick={turnOn}>
          {busy ? "Turning on…" : "Turn link on"}
        </button>
      </>
    );
  } else {
    linkActions = (
      <button type="button" className="ob-btn p" disabled={busy} onClick={turnOn}>
        {busy ? "Creating…" : "Create client link"}
      </button>
    );
  }

  return (
    <div className="ob" role="region" aria-label="Admin view of this client's dashboard">
      <div className="ob-in">
        <a className="ob-back" href={back} aria-label={`Back to ${p.business}`}>
          <IconBack width={18} height={18} />
          <span>Back to customer</span>
        </a>
        <div className="ob-txt">
          <p>
            <span className="ob-badge">Admin</span> You’re viewing <b>{p.business}</b>’s dashboard as admin
          </p>
          <p className="ob-sub">
            Your changes here apply at once — no client notification, not counted in their daily limit. Client: {p.changesUsed}/{p.limit}{" "}
            changes in 24{"\u00a0"}h{p.mode === "approval" ? ", their own changes wait for your approval" : ""}.
          </p>
        </div>
        <div className="ob-acts">
          <nav className="ob-lang" aria-label="Dashboard language">
            <a href="?lang=fr" hrefLang="fr" aria-current={p.locale === "fr" ? "true" : undefined}>
              FR
            </a>
            <a href="?lang=en" hrefLang="en" aria-current={p.locale === "en" ? "true" : undefined}>
              EN
            </a>
          </nav>
          {linkActions}
        </div>
      </div>
      {error ? (
        <p className="ob-err" role="alert">
          {error}
        </p>
      ) : (
        <span className="ob-sr" aria-live="polite">
          {copied ? "Client link copied" : ""}
        </span>
      )}
    </div>
  );
}
