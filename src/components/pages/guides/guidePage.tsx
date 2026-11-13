// Server helpers shared by the guide / landing routes (metadata + page body + structured data).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { formatDT } from "@/lib/business";
import { toShopProduct, type ShopProduct } from "@/components/shop/catalog";
import { loadProducts } from "@/components/site/server-data";
import PagesStyles from "../PagesStyles";
import JsonLd from "../JsonLd";
import { loadContactInfo, loadRules } from "../data";
import { fmt } from "../lib";
import { articleLd, breadcrumbLd, faqLd, pageMetadata } from "../seo";
import type { GuideKey, GuidesDict, SeoDict } from "../types";
import GuideDoc from "./GuideDoc";
import { plainText } from "./RichText";
import { GUIDES } from "./registry";

export async function guideMetadata(localeParam: string, key: GuideKey): Promise<Metadata> {
  if (!isLocale(localeParam)) return {};
  const page = ((await getDictionary(localeParam)).guides as GuidesDict)[key];
  const entry = GUIDES[key];
  return pageMetadata({
    locale: localeParam,
    path: entry.path,
    title: page.meta.title,
    description: page.meta.description,
    ogAlt: page.meta.ogAlt,
    images: [{ url: entry.og, width: 1200, height: 630, type: "image/jpeg" }],
    ...(entry.article ? { ogType: "article" as const, publishedTime: entry.published, modifiedTime: entry.modified } : {}),
  });
}

export async function GuidePage({ localeParam, guideKey }: { localeParam: string; guideKey: GuideKey }) {
  if (!isLocale(localeParam)) notFound();
  const locale = localeParam;
  const entry = GUIDES[guideKey];
  const [dict, rules, contact, rows] = await Promise.all([getDictionary(locale), loadRules(), loadContactInfo(), loadProducts()]);
  const guides = dict.guides as GuidesDict;
  const seo = dict.seo as SeoDict;
  const page = guides[guideKey];
  const products = new Map<string, ShopProduct>(rows.filter((r) => r.active).map((r) => [r.slug, toShopProduct(r, locale)]));
  // Live catalog prices for the landing-page offer line: cheapest stand, Café Pack (a missing one drops the line).
  const money = (millimes: number) => formatDT(millimes, locale).replace(/ /g, "\u00a0");
  const standPrices = [...products.values()].filter((p) => p.kind === "stand" && p.price > 0).map((p) => p.price);
  const pack = products.get("pack-cafe");
  const vars: Record<string, string> = {
    fee: formatDT(rules.deliveryFee, locale),
    threshold: formatDT(rules.freeDeliveryThreshold, locale),
    ...(standPrices.length ? { stand: money(Math.min(...standPrices)) } : {}),
    ...(pack && pack.price > 0 ? { pack: money(pack.price) } : {}),
  };
  const related = seo.guideLinks.filter((g) => g.href !== entry.path);

  const faq = page.faq.map((it) => ({ q: fmt(it.q, vars), a: fmt(it.a, vars) }));
  const structured: unknown[] = [
    breadcrumbLd(locale, [
      { name: guides.common.home, path: "" },
      { name: page.breadcrumb, path: entry.path },
    ]),
    faqLd(faq),
  ];
  if (entry.article) {
    structured.push(
      articleLd({
        locale,
        path: entry.path,
        headline: page.title,
        description: plainText(page.meta.description),
        image: entry.og,
        datePublished: entry.published,
        dateModified: entry.modified,
        section: page.eyebrow,
      }),
    );
  }

  return (
    <>
      <PagesStyles />
      <JsonLd data={structured} />
      <main>
        <GuideDoc
          locale={locale}
          page={page}
          common={guides.common}
          vars={vars}
          products={products}
          related={related}
          whatsapp={contact.whatsapp}
          dates={{ modified: entry.modified }}
          article={entry.article}
        />
      </main>
    </>
  );
}
