// /[locale]/guides/google-review-link — How to find your Google review link (FR: Comment trouver votre lien d'avis Google).
// Content: messages/<locale>/guides.json ("reviewLink"); path, share image and dates: src/components/pages/guides/registry.ts.
import type { Metadata } from "next";
import { GuidePage, guideMetadata } from "@/components/pages/guides/guidePage";

// Static per locale; prices, delivery fee / threshold and WhatsApp refresh every minute from the admin settings.
export const revalidate = 60;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return guideMetadata(locale, "reviewLink");
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  return <GuidePage localeParam={locale} guideKey="reviewLink" />;
}
