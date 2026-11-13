import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { formatDT } from "@/lib/business";
import { getProductBySlug, listProducts } from "@/server/catalog";
import { getPublicSettings } from "@/server/settings";
import { storyMedia, storyProductFor, toShopProduct } from "@/components/shop/catalog";
import { fmt, getShopMessages, type ShopMessages } from "@/components/shop/messages";
import { normalizeShopSettings } from "@/components/shop/rules";
import { CONTAINER, EYEBROW } from "@/components/shop/ui";
import Faq from "@/components/shop/Faq";
import FadeIn from "@/components/shop/FadeIn";
import HelpBand from "@/components/shop/HelpBand";
import ProductCard from "@/components/shop/ProductCard";
import ProductPurchase from "@/components/shop/ProductPurchase";
import ProductStage from "@/components/shop/ProductStage";
import SplitHeading from "@/components/shop/SplitHeading";
import TapStorySection from "@/components/shop/TapStorySection";
import { ArrowRightIcon, CheckIcon } from "@/components/shop/Icons";
import JsonLd from "@/components/pages/JsonLd";
import RichText from "@/components/pages/guides/RichText";
import { absoluteUrl, breadcrumbLd, localizedUrl, orgId, pageMetadata } from "@/components/pages/seo";
import type { SeoDict, SeoProductCopy } from "@/components/pages/types";
import type { Locale } from "@/i18n/config";
import type { ShopProduct } from "@/components/shop/catalog";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string; slug: string }> };

/** Per-product SEO copy (messages/<locale>/seo.json → products[slug]); null for a product added later in admin. */
function seoCopy(seo: SeoDict, slug: string): SeoProductCopy | null {
  return Object.prototype.hasOwnProperty.call(seo.products, slug) ? seo.products[slug] : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const row = await getProductBySlug(slug);
  if (!row || !row.active) return {};
  const p = toShopProduct(row, locale);
  const t = getShopMessages(locale);
  const copy = seoCopy((await getDictionary(locale)).seo as SeoDict, p.slug);
  const price = formatDT(p.price, locale);
  // SEO copy is keyed by slug (launch catalog); a product added later in admin falls back to the generic template.
  const title = copy ? copy.title : fmt(t.meta.productTitle, { name: p.name });
  const description = (copy ? fmt(copy.description, { price }) : fmt(t.meta.productDescription, { name: p.name, tagline: p.tagline }))
    .replace(/\s+/g, " ")
    .trim();
  return pageMetadata({
    locale,
    path: `/shop/${p.slug}`,
    title,
    description,
    images: [
      { url: p.image, width: 900, height: 900, alt: p.name },
      { url: "/og.jpg", width: 1200, height: 630, alt: p.name, type: "image/jpeg" },
    ],
  });
}

/** Product + Offer (price in TND, sale strikethrough, shipping to Tunisia, returns) — mirrors what the page shows. */
function productLd(input: {
  locale: Locale;
  product: ShopProduct;
  description: string;
  category: string;
  color: string;
  inStock: boolean;
  deliveryFee: number;
  freeDeliveryThreshold: number;
}) {
  const { locale, product } = input;
  const url = localizedUrl(locale, `/shop/${product.slug}`);
  const dt = (millimes: number) => Number((millimes / 1000).toFixed(3));
  const onSale = !!product.saleEndsAt && !!product.compareAt && product.compareAt > product.price;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: product.name,
    description: input.description,
    url,
    image: [absoluteUrl(product.image)],
    sku: product.slug,
    brand: { "@type": "Brand", name: "ONDE" },
    category: input.category,
    ...(input.color ? { color: input.color } : {}),
    offers: {
      "@type": "Offer",
      url,
      price: dt(product.price),
      priceCurrency: "TND",
      ...(onSale
        ? {
            priceValidUntil: new Date(product.saleEndsAt as number).toISOString().slice(0, 10),
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              priceType: "https://schema.org/StrikethroughPrice",
              price: dt(product.compareAt as number),
              priceCurrency: "TND",
            },
          }
        : {}),
      availability: input.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@id": orgId() },
      shippingDetails: {
        "@type": "OfferShippingDetails",
        shippingRate: {
          "@type": "MonetaryAmount",
          value: product.price >= input.freeDeliveryThreshold ? 0 : dt(input.deliveryFee),
          currency: "TND",
        },
        shippingDestination: { "@type": "DefinedRegion", addressCountry: "TN" },
        // "3 jours maximum après confirmation": up to 1 day to prepare + up to 2 days in transit.
        deliveryTime: {
          "@type": "ShippingDeliveryTime",
          handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" },
          transitTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 2, unitCode: "DAY" },
        },
      },
      // Terms of sale, "Retours, rétractation et remboursements": 10 working days from delivery, return costs paid
      // by the customer (withdrawal). Keep in sync with messages/<locale>/legal.json.
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: "TN",
        returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: 10,
        returnMethod: "https://schema.org/ReturnByMail",
        returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
      },
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  // Existence check first, so an unknown slug skips the dictionary/catalog/settings reads. Nothing has streamed yet
  // (there is no loading.tsx above this route), so notFound() answers a real HTTP 404.
  const row = await getProductBySlug(slug);
  if (!row || !row.active) notFound();
  const [dict, rows, rawSettings] = await Promise.all([getDictionary(locale), listProducts(), getPublicSettings()]);

  const t = (dict.shop ?? getShopMessages(locale)) as ShopMessages;
  const settings = normalizeShopSettings(rawSettings);
  const product = toShopProduct(row, locale);
  const story = storyProductFor(product.slug, product.kind);
  const media = storyMedia(story);
  const specs = t.product.specs[product.kind] ?? [];
  const paragraphs = product.description.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);

  const vars = {
    fee: formatDT(settings.rules.deliveryFee, locale),
    threshold: formatDT(settings.rules.freeDeliveryThreshold, locale),
    pct: settings.rules.returningDiscountPct,
  };
  const faq = t.product.faq
    .filter((f) => settings.rules.returningDiscountPct > 0 || !f.q.includes("{pct}"))
    .map((f) => ({ q: fmt(f.q, vars), a: fmt(f.a, vars) }));

  const others = rows.filter((r) => r.id !== row.id).map((r) => toShopProduct(r, locale));
  const related = [...others.filter((o) => o.kind !== product.kind), ...others.filter((o) => o.kind === product.kind)].slice(0, 3);

  const seo = dict.seo as SeoDict;
  const copy = seoCopy(seo, product.slug);
  const kindCopy = seo.kinds[product.kind];
  const lead = copy ? fmt(copy.lead, { price: formatDT(product.price, locale) }) : "";
  const structured = [
    productLd({
      locale,
      product,
      description: paragraphs[0] || product.tagline || product.name,
      category: copy?.category || kindCopy.category,
      color: copy?.color ?? "",
      inStock: settings.storeOpen,
      deliveryFee: settings.rules.deliveryFee,
      freeDeliveryThreshold: settings.rules.freeDeliveryThreshold,
    }),
    breadcrumbLd(locale, [
      { name: seo.breadcrumb.home, path: "" },
      { name: seo.breadcrumb.shop, path: "/shop" },
      { name: product.name, path: `/shop/${product.slug}` },
    ]),
  ];

  return (
    <main className="relative">
      <JsonLd data={structured} />

      {/* ---------- buy ---------- */}
      <section className="relative isolate pb-20 pt-28 md:pt-32">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[90vh] bg-[radial-gradient(55%_60%_at_30%_20%,rgba(70,28,247,0.22),transparent_70%)]"
        />
        <div className={CONTAINER}>
          <nav aria-label={t.product.breadcrumbLabel}>
            <ol className="flex items-center gap-2 text-sm text-muted">
              <li>
                <Link href={`/${locale}`} className="transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-violet-2">
                  {seo.breadcrumb.home}
                </Link>
              </li>
              <li aria-hidden="true" className="text-line">
                /
              </li>
              <li>
                <Link href={`/${locale}/shop`} className="transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-violet-2">
                  {t.product.breadcrumbShop}
                </Link>
              </li>
              <li aria-hidden="true" className="text-line">
                /
              </li>
              <li aria-current="page" className="truncate text-text/80">
                {product.name}
              </li>
            </ol>
          </nav>
          <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16">
            {/* No fade-in wrapper: the product still is the LCP element and must paint as soon as it loads. */}
            <div className="lg:sticky lg:top-28 lg:self-start">
              <ProductStage model={story} image={product.image} alt={product.name} locale={locale} />
            </div>
            <ProductPurchase
              product={product}
              locale={locale}
              settings={settings}
              kicker={copy?.kicker || kindCopy.kicker}
              guideHref={`/${locale}/guides/google-review-link`}
            />
          </div>
        </div>
      </section>

      {/* ---------- details ---------- */}
      {(paragraphs.length > 0 || specs.length > 0 || lead) && (
        <section className="relative pb-24">
          <div className={`${CONTAINER} grid gap-12 border-t border-white/[0.07] pt-16 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-20`}>
            {(paragraphs.length > 0 || lead) && (
              <FadeIn inView>
                <h2 className={EYEBROW}>{t.product.descriptionTitle}</h2>
                <div className="mt-6 space-y-5 text-[17px] leading-relaxed text-text/80">
                  {lead && (
                    <p className="text-xl leading-relaxed text-text">
                      <RichText text={lead} locale={locale} newTab="" />
                    </p>
                  )}
                  {paragraphs.map((para, i) => (
                    <p key={i} className={i === 0 && !lead ? "text-xl leading-relaxed text-text" : undefined}>
                      {para}
                    </p>
                  ))}
                </div>
              </FadeIn>
            )}
            {specs.length > 0 && (
              <FadeIn inView delay={0.1}>
                <h2 className={EYEBROW}>{t.product.specsTitle}</h2>
                <ul className="mt-6 divide-y divide-white/[0.07] rounded-[28px] border border-white/[0.08] bg-panel/50 px-6">
                  {specs.map((s) => (
                    <li key={s} className="flex items-start gap-3 py-4 text-[15px] leading-snug">
                      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-violet/20 text-violet-3">
                        <CheckIcon size={14} strokeWidth={2.4} />
                      </span>
                      {s}
                    </li>
                  ))}
                </ul>
              </FadeIn>
            )}
          </div>
        </section>
      )}

      {/* ---------- tap story ---------- */}
      <section aria-labelledby="story-title" className="relative">
        <div className={`${CONTAINER} pb-10`}>
          <p className={EYEBROW}>{t.product.storyEyebrow}</p>
          <SplitHeading
            id="story-title"
            inView
            lines={[{ text: t.product.storyTitle }]}
            className="mt-4 font-display text-[clamp(2.6rem,7vw,6.5rem)] font-extrabold leading-[0.95] tracking-[-0.045em]"
          />
          <FadeIn inView delay={0.2}>
            <p className="mt-5 max-w-xl text-lg text-muted">{t.product.storySubtitle}</p>
          </FadeIn>
        </div>
        <TapStorySection product={story} locale={locale} dict={dict.tapstory} media={media} steps={t.product.storySteps} />
      </section>

      {/* ---------- FAQ ---------- */}
      <section aria-labelledby="faq-title" className="relative py-24 sm:py-32">
        <div className={`${CONTAINER} grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20`}>
          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className={EYEBROW}>{t.product.faqEyebrow}</p>
            <SplitHeading
              id="faq-title"
              inView
              lines={[{ text: t.product.faqTitle }]}
              className="mt-4 font-display text-4xl font-extrabold leading-[1] tracking-[-0.035em] sm:text-5xl"
            />
          </div>
          <FadeIn inView>
            <Faq items={faq} />
          </FadeIn>
        </div>
      </section>

      {/* ---------- related ---------- */}
      {related.length > 0 && (
        <section aria-labelledby="related-title" className="relative pb-24">
          <div className={CONTAINER}>
            <p className={EYEBROW}>{t.product.relatedEyebrow}</p>
            <SplitHeading
              id="related-title"
              inView
              lines={[{ text: t.product.relatedTitle }]}
              className="mt-4 font-display text-4xl font-extrabold leading-[1] tracking-[-0.035em] sm:text-5xl"
            />
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
              {related.map((p, i) => (
                <FadeIn as="li" inView delay={i * 0.08} key={p.id} className="h-full">
                  <ProductCard product={p} locale={locale} />
                </FadeIn>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ---------- guides (internal links to the how-to pages) ---------- */}
      <nav aria-labelledby="guides-title" className="relative pb-24">
        <div className={CONTAINER}>
          <p className={EYEBROW}>{seo.product.guidesEyebrow}</p>
          <h2 id="guides-title" className="mt-4 font-display text-3xl font-extrabold leading-[1] tracking-[-0.035em] sm:text-4xl">
            {seo.product.guidesTitle}
          </h2>
          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            {seo.guideLinks.map((g) => (
              <li key={g.href}>
                <Link
                  href={`/${locale}${g.href}`}
                  className="group flex h-full flex-col rounded-[24px] border border-white/[0.08] bg-panel/50 p-6 transition-colors duration-300 hover:border-violet-2/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-2"
                >
                  <span className="flex items-center justify-between gap-3 font-display text-lg font-bold tracking-tight">
                    {g.title}
                    <ArrowRightIcon size={16} className="shrink-0 text-violet-3 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                  <span className="mt-2 text-sm leading-relaxed text-muted">{g.body}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className={`${CONTAINER} pb-32`}>
        <HelpBand locale={locale} t={t} settings={settings} />
      </div>
    </main>
  );
}
