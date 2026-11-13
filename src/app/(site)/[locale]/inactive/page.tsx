// /[locale]/inactive?code=XXXXXX — where /t/[code] sends taps it cannot redirect (not configured, paused, unknown).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import PagesStyles from "@/components/pages/PagesStyles";
import InactiveScene from "@/components/pages/InactiveScene";
import { loadContactInfo, sanitizeCode } from "@/components/pages/data";
import { loadInactiveTag } from "@/components/pages/inactive-data";
import { pageMetadata } from "@/components/pages/seo";
import type { InactiveDict } from "@/components/pages/types";

// Reflects the live tag status on every visit.
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = (await getDictionary(locale)).inactive as InactiveDict;
  const { state, kind } = await loadInactiveTag(sanitizeCode((await searchParams).code));
  // "ONDE — Ce présentoir n'est pas encore activé" when we know which product was tapped.
  const title = kind && (state === "inactive" || state === "paused") ? t.products[kind].meta : t.meta.title;
  return pageMetadata({ locale, path: "/inactive", title, description: t.meta.description, noindex: true });
}

export default async function InactivePage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const code = sanitizeCode(sp.code);
  const [dict, { state, kind }, contact] = await Promise.all([getDictionary(locale), loadInactiveTag(code), loadContactInfo()]);
  return (
    <>
      <PagesStyles />
      <main>
        <InactiveScene t={dict.inactive as InactiveDict} locale={locale} code={code} state={state} kind={kind} whatsapp={contact.whatsapp} />
      </main>
    </>
  );
}
