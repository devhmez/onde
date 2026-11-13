import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { formatDT } from "@/lib/business";
import { listProducts } from "@/server/catalog";
import { getPublicSettings } from "@/server/settings";
import { toShopProduct } from "@/components/shop/catalog";
import { fmt, getShopMessages, type ShopMessages } from "@/components/shop/messages";
import { normalizeShopSettings } from "@/components/shop/rules";
import CinematicBackdrop from "@/components/shop/CinematicBackdrop";
import FadeIn from "@/components/shop/FadeIn";
import HelpBand from "@/components/shop/HelpBand";
import OffersBand from "@/components/shop/OffersBand";
import ShopCatalog from "@/components/shop/ShopCatalog";
import SplitHeading from "@/components/shop/SplitHeading";
import { CashIcon, ChevronDownIcon, GiftIcon, TruckIcon } from "@/components/shop/Icons";
import { CONTAINER, EYEBROW } from "@/components/shop/ui";
import Faq, { type FaqEntry } from "@/components/shop/Faq";
import JsonLd from "@/components/pages/JsonLd";
import { breadcrumbLd, faqLd, localizedUrl, pageMetadata } from "@/components/pages/seo";
import type { SeoDict } from "@/components/pages/types";
import type { ShopProduct } from "@/components/shop/catalog";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getShopMessages(locale);
  const settings = normalizeShopSettings(await getPublicSettings());
  const description = fmt(t.meta.shopDescription, { threshold: formatDT(settings.rules.freeDeliveryThreshold, locale) });
  return pageMetadata({ locale, path: "/shop", title: t.meta.shopTitle, description });
}

/** Lowest live price per single-product kind ({stand}, {card}, …) for the buying FAQ. */
function kindPrices(products: ShopProduct[], locale: "fr" | "en"): Record<string, string> {
  const out: Record<string, string> = {};
  for (const kind of ["stand", "card", "keychain", "sticker"] as const) {
    const prices = products.filter((p) => p.kind === kind && p.price > 0).map((p) => p.price);
    if (prices.length) out[kind] = formatDT(Math.min(...prices), locale);
  }
  return out;
}

export default async function ShopPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const [dict, rows, rawSettings, sp] = await Promise.all([
    getDictionary(locale),
    listProducts(),
    getPublicSettings(),
    searchParams,
  ]);
  const t = (dict.shop ?? getShopMessages(locale)) as ShopMessages;
  const settings = normalizeShopSettings(rawSettings);
  const products = rows.map((p) => toShopProduct(p, locale));
  const cat = typeof sp.cat === "string" ? sp.cat : undefined;
  const { freeDeliveryThreshold, returningDiscountPct } = settings.rules;
  const seo = dict.seo as SeoDict;

  // Buying FAQ (visible below the catalog, same text in FAQPage). A question whose price is unknown is left out.
  const faqVars = {
    ...kindPrices(products, locale),
    fee: formatDT(settings.rules.deliveryFee, locale),
    threshold: formatDT(freeDeliveryThreshold, locale),
  };
  const faq: FaqEntry[] = seo.shop.faq
    .map((it) => ({
      q: fmt(it.q, faqVars),
      a: fmt(it.a, faqVars),
      ...(it.link ? { link: { href: `/${locale}${it.link.href}`, label: it.link.label } } : {}),
    }))
    .filter((it) => !/\{\w+\}/.test(it.q + it.a));
  const structured: unknown[] = [
    breadcrumbLd(locale, [
      { name: seo.breadcrumb.home, path: "" },
      { name: seo.breadcrumb.shop, path: "/shop" },
    ]),
  ];
  if (products.length) {
    structured.push({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: seo.shop.itemListName,
      itemListElement: products.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: localizedUrl(locale, `/shop/${p.slug}`),
        name: p.name,
      })),
    });
  }
  if (faq.length) structured.push(faqLd(faq));

  const chips = [
    { icon: <TruckIcon size={16} />, text: fmt(t.hero.chipDelivery, { amount: formatDT(freeDeliveryThreshold, locale) }) },
    ...(returningDiscountPct > 0
      ? [{ icon: <GiftIcon size={16} />, text: fmt(t.hero.chipReturning, { pct: returningDiscountPct }) }]
      : []),
    { icon: <CashIcon size={16} />, text: t.hero.chipCod },
  ];

  return (
    <main className="relative">
      <JsonLd data={structured} />
      {/* ---------- hero ---------- */}
      <section className="relative isolate flex min-h-[86svh] items-end overflow-hidden pb-16 pt-36 sm:pb-24">
        <CinematicBackdrop
          video="/media/loop-family.mp4"
          poster="/media/loop-family.webp"
          videoMobile="/media/loop-v_family.mp4"
          posterMobile="/media/loop-v_family.webp"
          ringsAt={{ x: 76, y: 42 }}
        />
        <div className={CONTAINER}>
          <SplitHeading
            as="h1"
            delay={0.1}
            kicker={seo.shop.kicker}
            kickerClassName={`${EYEBROW} mb-5 font-sans`}
            lines={[
              { text: t.hero.titleA },
              { text: t.hero.titleB, wordClassName: "bg-gradient-to-br from-white via-violet-3 to-violet-2 bg-clip-text pb-[0.06em] text-transparent" },
            ]}
            className="font-display text-[clamp(3.2rem,9vw,8.5rem)] font-extrabold leading-[0.92] tracking-[-0.045em]"
          />
          <FadeIn delay={0.45}>
            <p className="mt-7 max-w-xl text-base leading-relaxed text-text/80 sm:text-lg">{t.hero.subtitle}</p>
          </FadeIn>
          <FadeIn delay={0.6}>
            <ul className="mt-8 flex flex-wrap gap-2.5">
              {chips.map((c) => (
                <li
                  key={c.text}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm text-text backdrop-blur-md"
                >
                  <span className="text-violet-3">{c.icon}</span>
                  {c.text}
                </li>
              ))}
            </ul>
          </FadeIn>
          <FadeIn delay={0.8}>
            <a
              href="#catalog"
              className="group/scroll mt-12 inline-flex items-center gap-3 text-sm font-medium text-muted transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-2"
            >
              <span className="grid size-10 place-items-center rounded-full border border-white/15 transition-transform duration-500 ease-expo group-hover/scroll:translate-y-1">
                <ChevronDownIcon size={18} />
              </span>
              {t.hero.scroll}
            </a>
          </FadeIn>
        </div>
      </section>

      {/* ---------- catalog ---------- */}
      <section id="catalog" aria-label={t.filters.label} className="relative scroll-mt-28">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[60vh] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(70,28,247,0.16),transparent_70%)]"
        />
        <div className={`${CONTAINER} pb-24 pt-6`}>
          <ShopCatalog products={products} locale={locale} initialCategory={cat} />
        </div>
      </section>

      {/* ---------- offers ---------- */}
      <div className={`${CONTAINER} pb-24`}>
        <OffersBand locale={locale} settings={settings} />
      </div>

      {/* ---------- buying FAQ ---------- */}
      {faq.length > 0 && (
        <section aria-labelledby="shop-faq-title" className="relative pb-24">
          <div className={`${CONTAINER} grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20`}>
            <div className="lg:sticky lg:top-28 lg:self-start">
              <p className={EYEBROW}>{seo.shop.faqEyebrow}</p>
              <h2
                id="shop-faq-title"
                className="mt-4 font-display text-4xl font-extrabold leading-[1] tracking-[-0.035em] sm:text-5xl"
              >
                {seo.shop.faqTitle}
              </h2>
            </div>
            <Faq items={faq} />
          </div>
        </section>
      )}

      {/* ---------- help ---------- */}
      <div className={`${CONTAINER} pb-32`}>
        <HelpBand locale={locale} t={t} settings={settings} />
      </div>
    </main>
  );
}
