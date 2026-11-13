// /[locale]/legal/terms — conditions générales de vente (Tunisia, TND, cash on delivery, smart-link service).
import type { Metadata } from "next";
import { LegalPage, legalMetadata } from "@/components/pages/legal/legalPage";

// Static per locale; delivery fee / threshold / discount / contact refresh every minute from admin settings.
export const revalidate = 60;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return legalMetadata(locale, "terms");
}

export default async function TermsPage({ params }: Props) {
  const { locale } = await params;
  return <LegalPage localeParam={locale} kind="terms" />;
}
