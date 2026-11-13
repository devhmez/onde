// Cinematic home page — scroll-driven story from "one tap" to "order now". Dynamic: reads the live catalog
// and the pricing rules (free-delivery threshold, delivery fee, returning discount) from the database.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { formatDT } from "@/lib/business";
import { pageMetadata } from "@/components/pages/seo";
import Hero from "@/components/site/home/Hero";
import BusinessDrum from "@/components/site/home/BusinessDrum";
import Stats from "@/components/site/home/Stats";
import TapStorySection from "@/components/site/home/TapStorySection";
import HowItWorks from "@/components/site/home/HowItWorks";
import SmartLink from "@/components/site/home/SmartLink";
import Products from "@/components/site/home/Products";
import Offers from "@/components/site/home/Offers";
import FilmTeaser from "@/components/site/home/FilmTeaser";
import Faq from "@/components/site/home/Faq";
import FinalCta from "@/components/site/home/FinalCta";
import { loadContact, loadProducts, loadRules } from "@/components/site/server-data";
import {
  fill,
  formatPhone,
  nbsp,
  telHref,
  whatsappHref,
  type CommonDict,
  type HomeDict,
} from "@/components/site/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ locale: string }> };

/** Cheapest active product ("19 DT") for the meta description; the sentence drops the price if the catalog is empty. */
function fromPrice(products: Awaited<ReturnType<typeof loadProducts>>, locale: "fr" | "en"): string | null {
  const prices = products.filter((p) => p.active && p.price > 0).map((p) => p.price);
  return prices.length ? formatDT(Math.min(...prices), locale) : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const [dict, products] = await Promise.all([getDictionary(locale), loadProducts()]);
  const home = dict.home as HomeDict;
  const common = dict.common as CommonDict;
  const from = fromPrice(products, locale);
  const description = from
    ? fill(home.meta.description, { from })
    : home.meta.description.replace(/(?:Dès|From) \{from\}, (\p{L})/u, (_m, c: string) => c.toUpperCase());
  return pageMetadata({ locale, path: "", title: home.meta.title, description, ogAlt: common.meta.ogAlt });
}

export default async function HomePage({ params }: Params) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const [dict, products, rules, contact] = await Promise.all([
    getDictionary(locale),
    loadProducts(),
    loadRules(),
    loadContact(),
  ]);
  const home = dict.home as HomeDict;
  const common = dict.common as CommonDict;

  const money = (millimes: number) => nbsp(formatDT(millimes, locale));
  const pct = rules.returningDiscountPct;
  const vars = {
    threshold: money(rules.freeDeliveryThreshold),
    fee: money(rules.deliveryFee),
    pct,
  };
  const wa = whatsappHref(contact.whatsapp, common.whatsapp.message);
  const exampleBefore = 100_000;
  const exampleAfter = Math.round((exampleBefore * (100 - pct)) / 100);

  const offers = home.offers;
  const offerCards = {
    delivery: {
      title: fill(offers.delivery.title, vars),
      body: fill(offers.delivery.body, vars),
      badge: fill(offers.delivery.badge, vars),
      done: offers.delivery.done,
      from: money(0),
      to: vars.threshold,
    },
    returning: {
      title: fill(offers.returning.title, vars),
      body: fill(offers.returning.body, vars),
      badge: offers.returning.badge,
      example: offers.returning.example,
      before: money(exampleBefore),
      after: money(exampleAfter),
      pct: locale === "fr" ? `${pct} %` : `${pct}%`,
    },
    cod: offers.cod,
  };

  const faqItems = home.faq.items.map((it) => ({
    q: it.q,
    a: fill(it.a, vars),
    ...(it.link ? { link: { href: `/${locale}${it.link.href}`, label: it.link.label } } : {}),
  }));

  // Organization + WebSite structured data come from the site layout (one graph for every page).
  return (
    <main id="main">
      <Hero
        locale={locale}
        dict={home.hero}
        trust={home.hero.trust.map((t) => fill(t, vars))}
        poster="/products/stand_white.webp"
      />
      <BusinessDrum dict={home.drum} />
      <Stats locale={locale} dict={home.stats} />
      <TapStorySection locale={locale} labels={home.tapstory} dict={dict.tapstory ?? {}} />
      <HowItWorks locale={locale} dict={home.how} />
      <SmartLink dict={home.smart} />
      <Products locale={locale} dict={home.products} products={products} whatsappHref={wa} />
      <Offers dict={offers} cards={offerCards} />
      <FilmTeaser locale={locale} dict={home.film} cursorLabel={common.cursor.play} />
      <Faq dict={home.faq} items={faqItems} whatsappHref={wa} />
      <FinalCta
        locale={locale}
        dict={home.final}
        whatsappHref={wa}
        phoneHref={telHref(contact.phone)}
        phoneDisplay={formatPhone(contact.phone)}
      />
    </main>
  );
}
