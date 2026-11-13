// /[locale]/legal/privacy — what ONDE stores (orders, anonymized tap analytics), no ad trackers, how to delete.
import type { Metadata } from "next";
import { LegalPage, legalMetadata } from "@/components/pages/legal/legalPage";

// Static per locale; contact details refresh every minute from admin settings.
export const revalidate = 60;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return legalMetadata(locale, "privacy");
}

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  return <LegalPage localeParam={locale} kind="privacy" />;
}
