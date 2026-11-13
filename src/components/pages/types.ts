// Typed views over the pages-module message namespaces (messages/<locale>/{about,contact,legal,inactive}.json).
// FR is the reference shape; EN has the same keys.
import type aboutFr from "../../../messages/fr/about.json";
import type contactFr from "../../../messages/fr/contact.json";
import type legalFr from "../../../messages/fr/legal.json";
import type inactiveFr from "../../../messages/fr/inactive.json";

export type AboutDict = typeof aboutFr;
export type ContactDict = typeof contactFr;
export type LegalDict = typeof legalFr;
export type InactiveDict = typeof inactiveFr;
export type NotFoundDict = InactiveDict["notFound"];
export type FilmPlayerLabels = AboutDict["player"];
export type FilmChapter = { t: number; label: string };

export type LegalKind = "terms" | "privacy" | "notice";
export type LegalBlock = string | { list: string[] };
export type LegalSection = { id: string; title: string; blocks: LegalBlock[] };
export type LegalDocDict = { title: string; intro: string; sections: LegalSection[]; highlights?: string[] };

/* ---------------------------------------------------------------- guides + landing pages (messages/<locale>/guides.json) */

/** Paragraph (inline links as [label](/path) or [label](https://…)), bullet list, numbered steps, callout, product tiles. */
export type GuideBlock = string | { list: string[] } | { steps: string[] } | { note: string } | { products: string[] };
export type GuideSection = { id: string; title: string; blocks: GuideBlock[] };
export type FaqItem = { q: string; a: string; link?: { href: string; label: string } };
export type GuidePageDict = {
  meta: { title: string; description: string; ogAlt: string };
  breadcrumb: string;
  eyebrow: string;
  title: string;
  lead: string;
  highlights: string[];
  /** Landing pages: one line under the lead with live prices ({stand}, {pack}); dropped if a price is unknown. */
  offer?: string;
  /** Landing pages: buttons under the highlights (primary link + WhatsApp with this prefilled message). */
  heroCta?: { primary: string; href: string; waMessage: string };
  sections: GuideSection[];
  faq: FaqItem[];
  cta: { title: string; body: string; primary: string; href: string };
};
export type GuideKey = "reviewLink" | "moreReviews" | "restaurants";
export type GuidesDict = {
  common: {
    breadcrumbLabel: string;
    home: string;
    toc: string;
    updated: string;
    readingTime: string;
    author: string;
    faqEyebrow: string;
    faqTitle: string;
    relatedEyebrow: string;
    productsLabel: string;
    whatsapp: string;
    waMessage: string;
    newTab: string;
  };
} & Record<GuideKey, GuidePageDict>;

/* ---------------------------------------------------------------- server-only SEO copy (messages/<locale>/seo.json) */

export type SeoProductCopy = {
  title: string;
  description: string;
  kicker: string;
  lead: string;
  category: string;
  color: string;
};
export type SeoDict = {
  org: { description: string };
  breadcrumb: { label: string; home: string; shop: string };
  shop: { kicker: string; itemListName: string; faqEyebrow: string; faqTitle: string; faq: FaqItem[] };
  product: { guidesEyebrow: string; guidesTitle: string };
  guideLinks: { href: string; title: string; body: string }[];
  products: Record<string, SeoProductCopy>;
  kinds: Record<"stand" | "card" | "keychain" | "sticker" | "pack", { kicker: string; category: string }>;
};
