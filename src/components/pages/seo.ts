// SEO helpers shared by every public page: absolute URLs from PUBLIC_BASE_URL, hreflang alternates, Open Graph + Twitter,
// and the JSON-LD builders (one Organization + WebSite graph for the whole site, breadcrumbs, FAQ, articles).
// Pure (no server-only imports): safe in server components, route handlers and metadata functions.
import type { Metadata } from "next";
import { locales, defaultLocale, type Locale } from "@/i18n/config";
import { BRAND } from "@/lib/business";

const FALLBACK_BASE = "https://onde.tn";

/** Public origin of the site (no trailing slash), e.g. "https://onde.tn". Read at request time. */
export function siteUrl(): string {
  const raw = process.env.PUBLIC_BASE_URL?.trim();
  if (!raw) return FALLBACK_BASE;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return FALLBACK_BASE;
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return FALLBACK_BASE;
  }
}

/** Absolute URL of a site path ("/og.jpg" → "https://onde.tn/og.jpg"). Absolute http(s) URLs pass through. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${siteUrl()}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** Absolute URL of a localized route. `path` is "" for the home page or starts with "/". */
export function localizedUrl(locale: Locale, path: string): string {
  return `${siteUrl()}/${locale}${path}`;
}

/** hreflang map for a localized path, including x-default (→ default locale). */
export function languageAlternates(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of locales) out[l] = localizedUrl(l, path);
  out["x-default"] = localizedUrl(defaultLocale, path);
  return out;
}

const OG_LOCALE: Record<Locale, string> = { fr: "fr_TN", en: "en_US" };

export type OgImage = { url: string; width: number; height: number; alt?: string; type?: string };

/** The default share image (1200 × 630, the ONDE stand on a counter). */
export const DEFAULT_OG: OgImage = { url: "/og.jpg", width: 1200, height: 630, type: "image/jpeg" };

type PageMetaInput = {
  locale: Locale;
  /** Localized path without the locale prefix: "" (home), "/about", "/legal/terms" … */
  path: string;
  title: string;
  description: string;
  ogAlt?: string;
  /** Share images, most specific first (relative to the site root or absolute). Default: /og.jpg. */
  images?: OgImage[];
  /** "article" for guides (adds published / modified times). */
  ogType?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  noindex?: boolean;
  video?: { url: string; width: number; height: number; type: string };
};

export function pageMetadata({
  locale,
  path,
  title,
  description,
  ogAlt,
  images,
  ogType = "website",
  publishedTime,
  modifiedTime,
  noindex,
  video,
}: PageMetaInput): Metadata {
  const base = siteUrl();
  const url = localizedUrl(locale, path);
  const ogImages = (images?.length ? images : [DEFAULT_OG]).map((img) => ({
    url: absoluteUrl(img.url),
    width: img.width,
    height: img.height,
    alt: img.alt ?? ogAlt ?? title,
    ...(img.type ? { type: img.type } : {}),
  }));
  const og = {
    siteName: "ONDE",
    url,
    title,
    description,
    locale: OG_LOCALE[locale],
    alternateLocale: locales.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
    images: ogImages,
    ...(video ? { videos: [{ url: `${base}${video.url}`, width: video.width, height: video.height, type: video.type }] } : {}),
  };
  return {
    metadataBase: new URL(base),
    title: { absolute: title },
    description,
    alternates: { canonical: url, languages: languageAlternates(path) },
    openGraph:
      ogType === "article"
        ? { ...og, type: "article", ...(publishedTime ? { publishedTime } : {}), ...(modifiedTime ? { modifiedTime } : {}) }
        : { ...og, type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [ogImages[0].url] },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

/** Serialize JSON-LD safely for a <script type="application/ld+json"> (escapes "<" to avoid tag injection). */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/* ------------------------------------------------------------------------------------------------------------------
   Structured data (schema.org). One Organization + one WebSite node, declared on every page by the site layout and
   referenced everywhere else by @id (product seller, article publisher, contact page, film publisher).
   ------------------------------------------------------------------------------------------------------------------ */

export const orgId = () => `${siteUrl()}/#organization`;
export const websiteId = () => `${siteUrl()}/#website`;

/** Square logo on a solid background (Google needs ≥ 112 × 112 px that reads well on white). */
export const LOGO = { path: "/brand/onde-logo-512.png", width: 512, height: 512 } as const;

/** Official ONDE profiles: used when the admin settings leave a network empty. */
export const DEFAULT_SOCIALS = {
  instagram: "https://www.instagram.com/onde.tn",
  tiktok: "https://www.tiktok.com/@onde.tn",
  facebook: "https://www.facebook.com/onde.tn",
} as const;

type Network = keyof typeof DEFAULT_SOCIALS;
const SOCIAL_HOST: Record<Network, RegExp> = {
  instagram: /(^|\.)instagram\.com$/i,
  tiktok: /(^|\.)tiktok\.com$/i,
  facebook: /(^|\.)(facebook\.com|fb\.com)$/i,
};

/** Settings value (URL or @handle) → canonical https profile URL; the official profile when unset or invalid. */
export function profileUrl(network: Network, raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (v) {
    const candidate = /^https?:\/\//i.test(v)
      ? v
      : /^[\w.-]+\.[a-z]{2,}\//i.test(v)
        ? `https://${v}`
        : network === "tiktok"
          ? `https://www.tiktok.com/@${v.replace(/^@/, "")}`
          : `https://www.${network}.com/${v.replace(/^@/, "")}`;
    try {
      const u = new URL(candidate);
      if (SOCIAL_HOST[network].test(u.hostname)) {
        u.protocol = "https:";
        return u.toString().replace(/\/+$/, "");
      }
    } catch {
      /* fall through to the official profile */
    }
  }
  return DEFAULT_SOCIALS[network];
}

export type OrgContact = { phone: string; email: string; instagram: string; facebook: string; tiktok: string };

/** "+216 25 875 529" from an 8-digit Tunisian number (falls back to the brand number). */
function intlPhone(phone8: string): string {
  const d = phone8.replace(/\D/g, "").slice(-8);
  return d.length === 8 ? `+216 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}` : BRAND.phoneDisplay;
}

/** The site-wide @graph: Organization (brand entity, logo, socials, contact points) + WebSite (site name). */
export function siteGraph(input: { locale: Locale; contact: OrgContact; description: string }) {
  const base = siteUrl();
  const telephone = intlPhone(input.contact.phone);
  const email = input.contact.email || `contact@${BRAND.domain}`;
  const sameAs = (["instagram", "tiktok", "facebook"] as const).map((n) => profileUrl(n, input.contact[n]));
  const contactPoint = (["customer service", "sales"] as const).map((contactType) => ({
    "@type": "ContactPoint",
    contactType,
    telephone,
    email,
    areaServed: "TN",
    availableLanguage: ["French", "English"],
  }));
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": orgId(),
        name: BRAND.name,
        alternateName: [BRAND.domain, "ONDE Tunisie", "ONDE NFC"],
        url: `${base}/`,
        logo: { "@type": "ImageObject", "@id": `${base}/#logo`, url: `${base}${LOGO.path}`, width: LOGO.width, height: LOGO.height, caption: BRAND.name },
        image: `${base}${DEFAULT_OG.url}`,
        description: input.description,
        email,
        telephone,
        address: { "@type": "PostalAddress", addressCountry: "TN" },
        areaServed: { "@type": "Country", name: "Tunisia" },
        contactPoint,
        sameAs,
      },
      {
        "@type": "WebSite",
        "@id": websiteId(),
        url: `${base}/`,
        name: BRAND.name,
        alternateName: [BRAND.domain, "ONDE Tunisie"],
        inLanguage: [...locales],
        publisher: { "@id": orgId() },
      },
    ],
  };
}

export type Crumb = { name: string; path?: string };

/** BreadcrumbList for localized paths. The last crumb is the current page (its URL is optional for Google). */
export function breadcrumbLd(locale: Locale, crumbs: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      ...(c.path !== undefined ? { item: localizedUrl(locale, c.path) } : {}),
    })),
  };
}

/** FAQPage for a FAQ that is visible on the page (same questions, same answers). */
export function faqLd(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({ "@type": "Question", name: it.q, acceptedAnswer: { "@type": "Answer", text: it.a } })),
  };
}

/** Article (guides). Author and publisher are the ONDE organization. */
export function articleLd(input: {
  locale: Locale;
  path: string;
  headline: string;
  description: string;
  image: string;
  datePublished: string;
  dateModified: string;
  section?: string;
}) {
  const url = localizedUrl(input.locale, input.path);
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${url}#article`,
    headline: input.headline,
    description: input.description,
    image: [absoluteUrl(input.image)],
    datePublished: input.datePublished,
    dateModified: input.dateModified,
    inLanguage: input.locale,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@type": "Organization", "@id": orgId(), name: BRAND.name, url: `${siteUrl()}/` },
    publisher: { "@id": orgId() },
    isPartOf: { "@id": websiteId() },
    ...(input.section ? { articleSection: input.section } : {}),
  };
}
