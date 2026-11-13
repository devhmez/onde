// /[locale]/legal has no content of its own: send visitors (and crawlers, with a permanent 308) to the terms of sale.
import { notFound, permanentRedirect } from "next/navigation";
import { isLocale } from "@/i18n/config";

type Props = { params: Promise<{ locale: string }> };

export default async function LegalIndex({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  permanentRedirect(`/${locale}/legal/terms`);
}
