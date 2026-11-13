// /[locale]/legal/notice — mentions légales: publisher, host, copyright (law 94-36), third-party trademarks, credits.
import type { Metadata } from "next";
import { LegalPage, legalMetadata } from "@/components/pages/legal/legalPage";

// Static per locale; contact details + optional legal identity (name, tax id) refresh every minute from admin settings.
export const revalidate = 60;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return legalMetadata(locale, "notice");
}

export default async function NoticePage({ params }: Props) {
  const { locale } = await params;
  return <LegalPage localeParam={locale} kind="notice" />;
}
