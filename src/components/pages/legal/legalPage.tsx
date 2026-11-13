// Server helpers shared by /legal/terms, /legal/privacy and /legal/notice (metadata + page body).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { formatDT } from "@/lib/business";
import PagesStyles from "../PagesStyles";
import { loadContactInfo, loadRules } from "../data";
import { fmt, formatPhone } from "../lib";
import { pageMetadata } from "../seo";
import type { LegalDict, LegalDocDict, LegalKind } from "../types";
import LegalDoc from "./LegalDoc";

type LegalIdentity = { legalName: string; taxId: string; address: string };

/**
 * Optional legal identity typed in admin → Settings (empty = the lines using it are hidden). Read server-side only:
 * these values are not part of the public settings API. Never throws (same fallback policy as ../data).
 */
async function loadLegalIdentity(): Promise<LegalIdentity> {
  try {
    const { getSettings } = await import("@/server/settings");
    const s = await getSettings();
    return { legalName: (s.legalName ?? "").trim(), taxId: (s.taxId ?? "").trim(), address: (s.address ?? "").trim() };
  } catch (err) {
    console.warn("[pages] legal identity unavailable, using defaults:", err instanceof Error ? err.message : err);
    return { legalName: "", taxId: "", address: "" };
  }
}

export async function legalMetadata(localeParam: string, kind: LegalKind): Promise<Metadata> {
  if (!isLocale(localeParam)) return {};
  const t = (await getDictionary(localeParam)).legal as LegalDict;
  return pageMetadata({ locale: localeParam, path: `/legal/${kind}`, title: t[kind].meta.title, description: t[kind].meta.description });
}

export async function LegalPage({ localeParam, kind }: { localeParam: string; kind: LegalKind }) {
  if (!isLocale(localeParam)) notFound();
  const locale = localeParam;
  const [dict, rules, contact, identity] = await Promise.all([getDictionary(locale), loadRules(), loadContactInfo(), loadLegalIdentity()]);
  const t = dict.legal as LegalDict;
  const vars = {
    deliveryFee: formatDT(rules.deliveryFee, locale),
    threshold: formatDT(rules.freeDeliveryThreshold, locale),
    pct: rules.returningDiscountPct,
    phone: formatPhone(contact.phone),
    emailClause: contact.email ? fmt(t.common.emailClause, { email: contact.email }) : "",
    year: new Date().getFullYear(),
    legalNameLine: identity.legalName ? fmt(t.common.identity.legalName, { legalName: identity.legalName }) : "",
    taxIdLine: identity.taxId ? fmt(t.common.identity.taxId, { taxId: identity.taxId }) : "",
    addressLine: identity.address ? fmt(t.common.identity.address, { address: identity.address }) : "",
    // Always the operator (a person or company identified in "Publisher"), never the raw legal name.
    director: t.notice.directorFallback,
  };
  return (
    <>
      <PagesStyles />
      <main>
        <LegalDoc locale={locale} kind={kind} doc={t[kind] as LegalDocDict} common={t.common} vars={vars} whatsapp={contact.whatsapp} />
      </main>
    </>
  );
}
