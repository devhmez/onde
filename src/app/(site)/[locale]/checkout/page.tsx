import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { listProducts } from "@/server/catalog";
import { getPublicSettings } from "@/server/settings";
import { resolveProductImage } from "@/components/shop/catalog";
import { getShopMessages, type ShopMessages } from "@/components/shop/messages";
import { normalizeShopSettings } from "@/components/shop/rules";
import { CONTAINER, EYEBROW } from "@/components/shop/ui";
import CheckoutClient, { type CheckoutCatalogEntry } from "@/components/shop/CheckoutClient";
import FadeIn from "@/components/shop/FadeIn";
import SplitHeading from "@/components/shop/SplitHeading";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getShopMessages(locale);
  return {
    title: { absolute: t.meta.checkoutTitle },
    robots: { index: false, follow: false },
    alternates: { canonical: `/${locale}/checkout` },
  };
}

export default async function CheckoutPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const [dict, rows, rawSettings] = await Promise.all([getDictionary(locale), listProducts(), getPublicSettings()]);
  const t = (dict.shop ?? getShopMessages(locale)) as ShopMessages;
  const settings = normalizeShopSettings(rawSettings);
  // Fresh prices / names / stills for the summary (the cart stores what was shown at add time).
  const catalog: CheckoutCatalogEntry[] = rows.map((p) => ({
    id: p.id,
    name: locale === "fr" ? p.nameFr : p.nameEn,
    price: p.price,
    image: resolveProductImage(p.image, p.slug, p.kind),
  }));

  return (
    <main className="relative isolate pb-32 pt-28 md:pt-36">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[70vh] bg-[radial-gradient(50%_60%_at_20%_10%,rgba(70,28,247,0.2),transparent_70%)]"
      />
      <div className={CONTAINER}>
        <header className="mb-10 max-w-3xl md:mb-14">
          <FadeIn>
            <p className={EYEBROW}>{t.checkout.eyebrow}</p>
          </FadeIn>
          <SplitHeading
            as="h1"
            delay={0.05}
            lines={[{ text: t.checkout.title }]}
            className="mt-4 font-display text-[clamp(2.6rem,6vw,5rem)] font-extrabold leading-[0.95] tracking-[-0.045em]"
          />
          <FadeIn delay={0.3}>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">{t.checkout.subtitle}</p>
          </FadeIn>
        </header>
        <CheckoutClient locale={locale} settings={settings} catalog={catalog} />
      </div>
    </main>
  );
}
