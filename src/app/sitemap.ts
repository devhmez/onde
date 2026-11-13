// /sitemap.xml — every indexable public page in FR and EN, each entry with its hreflang alternates (+ x-default → fr),
// a last-modified date and its main images. Products come from the live catalog, so this is generated per request
// (cheap SQLite read; falls back to the static pages). Not listed on purpose (noindex): checkout, order, inactive.
import type { MetadataRoute } from "next";
import { locales } from "@/i18n/config";
import { loadProductSlugs } from "@/components/pages/data";
import { GUIDE_LIST } from "@/components/pages/guides/registry";
import { absoluteUrl, languageAlternates, localizedUrl } from "@/components/pages/seo";
import { resolveProductImage } from "@/components/shop/catalog";

export const dynamic = "force-dynamic";

type Freq = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
type Page = { path: string; priority: number; changeFrequency: Freq; lastModified: string; images?: string[] };

/** Last content change of the static pages (titles, copy, structured data). Bump it when their copy changes. */
const CONTENT_UPDATED = "2026-10-14";
/** The film's poster (FILM.poster in src/components/pages/about/AboutHero.tsx). */
const FILM_POSTER = "/media/trailer-poster.webp";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await loadProductSlugs();
  const stills = products.map((p) => absoluteUrl(resolveProductImage(p.image, p.slug, p.kind)));
  const uniqueStills = [...new Set(stills)];

  const pages: Page[] = [
    { path: "", priority: 1, changeFrequency: "weekly", lastModified: CONTENT_UPDATED, images: [absoluteUrl("/og.jpg"), ...uniqueStills.slice(0, 2)] },
    { path: "/shop", priority: 0.9, changeFrequency: "weekly", lastModified: CONTENT_UPDATED, images: uniqueStills },
    ...products.map((p, i) => ({
      path: `/shop/${encodeURIComponent(p.slug)}`,
      priority: 0.8,
      changeFrequency: "weekly" as Freq,
      // The product rows carry no edit date: use the later of their creation and the last copy update.
      lastModified: new Date(Math.max(Number.isFinite(p.createdAt) ? p.createdAt : 0, Date.parse(CONTENT_UPDATED))).toISOString(),
      images: [stills[i]],
    })),
    ...GUIDE_LIST.map((g) => ({
      path: g.path,
      priority: 0.7,
      changeFrequency: "monthly" as Freq,
      lastModified: g.modified,
      images: [absoluteUrl(g.og)],
    })),
    { path: "/about", priority: 0.6, changeFrequency: "monthly", lastModified: CONTENT_UPDATED, images: [absoluteUrl(FILM_POSTER)] },
    { path: "/contact", priority: 0.6, changeFrequency: "monthly", lastModified: CONTENT_UPDATED },
    { path: "/legal/terms", priority: 0.2, changeFrequency: "yearly", lastModified: CONTENT_UPDATED },
    { path: "/legal/privacy", priority: 0.2, changeFrequency: "yearly", lastModified: CONTENT_UPDATED },
    { path: "/legal/notice", priority: 0.2, changeFrequency: "yearly", lastModified: CONTENT_UPDATED },
  ];

  return pages.flatMap((p) =>
    locales.map((locale) => ({
      url: localizedUrl(locale, p.path),
      lastModified: p.lastModified,
      changeFrequency: p.changeFrequency,
      priority: p.priority,
      ...(p.images?.length ? { images: p.images } : {}),
      alternates: { languages: languageAlternates(p.path) },
    })),
  );
}
