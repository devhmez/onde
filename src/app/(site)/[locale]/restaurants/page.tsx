// /[locale]/restaurants — Landing page for restaurants and cafés (FR: Plus d'avis Google pour votre restaurant ou votre café).
// Content: messages/<locale>/guides.json ("restaurants"); path, share image and dates: src/components/pages/guides/registry.ts.
import type { Metadata } from "next";
import { GuidePage, guideMetadata } from "@/components/pages/guides/guidePage";

// Static per locale; prices, delivery fee / threshold and WhatsApp refresh every minute from the admin settings.
export const revalidate = 60;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return guideMetadata(locale, "restaurants");
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  return <GuidePage localeParam={locale} guideKey="restaurants" />;
}
