// Shared renderer for the guide / landing pages (/guides/*, /restaurants): breadcrumb, hero (eyebrow, H1, dates,
// reading time and byline for articles; lead, highlights, and for landing pages an offer line and CTA buttons),
// scroll-spy table of contents, numbered sections (paragraphs with inline links,
// lists, steps, callouts, live product tiles), a visible FAQ, a CTA box and links to the other guides.
// Server component in the legal pages' design language; the only client pieces are the TOC, the reading bar, the FAQ
// accordion and the magnetic buttons, all already used elsewhere on the site.
import type { CSSProperties } from "react";
import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { ShopProduct } from "@/components/shop/catalog";
import Faq, { type FaqEntry } from "@/components/shop/Faq";
import { Eyebrow } from "@/components/site/Section";
import MagneticButton from "@/components/site/MagneticButton";
import { LightPool } from "../Ambient";
import { CharRise } from "../motion";
import { fmt, waLink } from "../lib";
import { IconArrowRight, IconCheck, IconWhatsApp } from "../icons";
import { LegalToc, ReadingProgress } from "../legal/LegalChrome";
import type { GuideBlock, GuidePageDict, GuidesDict } from "../types";
import ProductTiles from "./ProductTiles";
import RichText, { localHref, plainText } from "./RichText";

type Props = {
  locale: Locale;
  page: GuidePageDict;
  common: GuidesDict["common"];
  /** Placeholder values ({fee}, {threshold}) filled from the live business rules. */
  vars: Record<string, string | number>;
  products: Map<string, ShopProduct>;
  related: { href: string; title: string; body: string }[];
  whatsapp: string;
  dates: { modified: string };
  /** Guides are articles (date, reading time, byline); a landing page (/restaurants) shows none of them. */
  article: boolean;
};

const blockWords = (b: GuideBlock): number => {
  if (typeof b === "string") return plainText(b).split(/\s+/).length;
  if ("list" in b) return b.list.join(" ").split(/\s+/).length;
  if ("steps" in b) return b.steps.join(" ").split(/\s+/).length;
  if ("note" in b) return b.note.split(/\s+/).length;
  return 0;
};

export default function GuideDoc({ locale, page, common, vars, products, related, whatsapp, dates, article }: Props) {
  const f = (s: string) => fmt(s, vars);
  // Offer line with live prices: left out while a placeholder has no value (product inactive or deleted).
  const offer = page.offer ? f(page.offer) : "";
  const showOffer = offer !== "" && !/\{\w+\}/.test(offer);
  const faq: FaqEntry[] = page.faq.map((it) => ({
    q: f(it.q),
    a: f(it.a),
    ...(it.link ? { link: { href: localHref(locale, it.link.href), label: it.link.label } } : {}),
  }));
  const words =
    page.lead.split(/\s+/).length +
    page.sections.reduce((n, s) => n + s.title.split(/\s+/).length + s.blocks.reduce((m, b) => m + blockWords(b), 0), 0) +
    page.faq.reduce((n, it) => n + `${it.q} ${it.a}`.split(/\s+/).length, 0);
  const minutes = Math.max(1, Math.round(words / 200));
  const updated = new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${dates.modified}T00:00:00Z`),
  );
  const toc = [...page.sections.map((s) => ({ id: s.id, title: s.title })), { id: "faq", title: common.faqTitle }];
  const rich = (text: string) => <RichText text={f(text)} locale={locale} newTab={common.newTab} />;

  return (
    <>
      <ReadingProgress />

      <header className="relative overflow-x-clip pb-12 pt-[clamp(7.5rem,13vw,10rem)]">
        <LightPool className="left-[-20vw] top-[-30%] h-[80vh] w-[80vw]" opacity={0.22} />
        <div className="container-site relative">
          <nav aria-label={common.breadcrumbLabel} className="op-fade-up" style={{ "--d": "60ms" } as CSSProperties}>
            <ol className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <li>
                <Link href={`/${locale}`} className="transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-violet-2">
                  {common.home}
                </Link>
              </li>
              <li aria-hidden="true" className="text-line">
                /
              </li>
              <li aria-current="page" className="text-text/80">
                {page.breadcrumb}
              </li>
            </ol>
          </nav>
          <h1 className="mt-10 max-w-5xl text-display text-[clamp(2.5rem,6.4vw,5.6rem)]">
            <span className="op-fade-up mb-5 flex" style={{ "--d": "120ms" } as CSSProperties}>
              <Eyebrow as="span">{page.eyebrow}</Eyebrow>
              <span className="sr-only"> — </span>
            </span>
            {/* The H1 is these pages' LCP: letters stay opaque from the first frame (blur + rise only). */}
            <CharRise text={page.title} delayMs={120} paint="visible" />
          </h1>
          {article ? (
            <p className="op-fade-up mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted" style={{ "--d": "500ms" } as CSSProperties}>
              <span>{fmt(common.updated, { date: updated })}</span>
              <span aria-hidden className="h-1 w-1 rounded-full bg-line" />
              <span>{fmt(common.readingTime, { min: minutes })}</span>
              <span aria-hidden className="h-1 w-1 rounded-full bg-line" />
              <span>{common.author}</span>
            </p>
          ) : null}
          <p className="op-fade-up mt-8 max-w-3xl text-lg leading-relaxed text-text/85 md:text-xl" style={{ "--d": "620ms" } as CSSProperties}>
            {rich(page.lead)}
          </p>
          {showOffer ? (
            <p className="op-fade-up mt-4 max-w-3xl text-base font-medium leading-relaxed text-white md:text-lg" style={{ "--d": "680ms" } as CSSProperties}>
              {offer}
            </p>
          ) : null}
          {page.highlights.length ? (
            <ul className="op-fade-up mt-8 flex flex-wrap gap-2" style={{ "--d": "720ms" } as CSSProperties}>
              {page.highlights.map((h) => (
                <li key={h} className="inline-flex items-center gap-2 rounded-full border border-ok/30 bg-ok/10 px-3.5 py-1.5 text-sm font-medium text-ok">
                  <IconCheck size={14} /> {h}
                </li>
              ))}
            </ul>
          ) : null}
          {page.heroCta ? (
            <div className="op-fade-up op-noprint mt-9 flex flex-wrap gap-3" style={{ "--d": "800ms" } as CSSProperties}>
              <MagneticButton href={localHref(locale, page.heroCta.href)} icon={<IconArrowRight size={16} />}>
                {page.heroCta.primary}
              </MagneticButton>
              <MagneticButton
                href={waLink(whatsapp, page.heroCta.waMessage)}
                target="_blank"
                rel="noopener noreferrer"
                variant="whatsapp"
                icon={<IconWhatsApp size={18} />}
                iconPosition="start"
              >
                {common.whatsapp}
              </MagneticButton>
            </div>
          ) : null}
        </div>
      </header>

      <div className="container-site pb-[clamp(4rem,10vw,8rem)]">
        <div className="grid gap-10 lg:grid-cols-[17rem_1fr] lg:gap-16">
          <aside>
            <LegalToc items={toc} title={common.toc} />
          </aside>
          <article className="min-w-0 max-w-3xl">
            {page.sections.map((s) => (
              <section
                key={s.id}
                id={s.id}
                tabIndex={-1}
                aria-labelledby={`${s.id}-h`}
                className="scroll-mt-28 border-t border-line py-10 outline-none first:border-t-0 first:pt-0"
              >
                <h2 id={`${s.id}-h`} className="font-display text-2xl font-bold tracking-tight text-white md:text-3xl">
                  {s.title}
                </h2>
                <div className="mt-5 space-y-4 text-base leading-[1.75] text-text/80 md:text-[1.05rem]">
                  {s.blocks.map((b, bi) => {
                    if (typeof b === "string") return <p key={bi}>{rich(b)}</p>;
                    if ("list" in b)
                      return (
                        <ul key={bi} className="space-y-2.5 pl-1">
                          {b.list.map((li) => (
                            <li key={li} className="flex gap-3">
                              <span aria-hidden className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full bg-violet-2" />
                              <span>{rich(li)}</span>
                            </li>
                          ))}
                        </ul>
                      );
                    if ("steps" in b)
                      return (
                        <ol key={bi} className="space-y-3 rounded-[24px] border border-violet-2/20 bg-violet/[0.06] p-5 md:p-6">
                          {b.steps.map((st, i) => (
                            <li key={st} className="flex gap-4">
                              <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-violet font-display text-sm font-bold text-white">
                                {i + 1}
                              </span>
                              <span className="pt-0.5">{rich(st)}</span>
                            </li>
                          ))}
                        </ol>
                      );
                    if ("note" in b)
                      return (
                        <p key={bi} className="rounded-2xl border-l-2 border-violet-2 bg-panel/70 px-5 py-4 text-[0.98rem] text-text/85">
                          {rich(b.note)}
                        </p>
                      );
                    const tiles = b.products.map((slug) => products.get(slug)).filter((p): p is ShopProduct => !!p);
                    return <ProductTiles key={bi} products={tiles} locale={locale} label={common.productsLabel} />;
                  })}
                </div>
              </section>
            ))}

            <section id="faq" tabIndex={-1} aria-labelledby="faq-h" className="scroll-mt-28 border-t border-line py-10 outline-none">
              <p className="eyebrow">{common.faqEyebrow}</p>
              <h2 id="faq-h" className="mt-3 font-display text-2xl font-bold tracking-tight text-white md:text-3xl">
                {common.faqTitle}
              </h2>
              <Faq items={faq} className="mt-6" />
            </section>

            <aside className="op-noprint mt-6 flex flex-col items-start gap-6 rounded-[28px] border border-white/[0.07] bg-gradient-to-br from-panel to-violet/15 p-7 md:p-9">
              <div>
                <p className="font-display text-2xl font-bold tracking-tight text-white md:text-3xl">{page.cta.title}</p>
                <p className="mt-2 max-w-xl text-muted">{f(page.cta.body)}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <MagneticButton href={localHref(locale, page.cta.href)} icon={<IconArrowRight size={16} />}>
                  {page.cta.primary}
                </MagneticButton>
                <MagneticButton
                  href={waLink(whatsapp, common.waMessage)}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="whatsapp"
                  icon={<IconWhatsApp size={18} />}
                  iconPosition="start"
                >
                  {common.whatsapp}
                </MagneticButton>
              </div>
            </aside>

            {related.length > 0 && (
              <nav aria-labelledby="related-h" className="op-noprint mt-14">
                <p id="related-h" className="eyebrow">
                  {common.relatedEyebrow}
                </p>
                <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                  {related.map((r) => (
                    <li key={r.href}>
                      <Link
                        href={localHref(locale, r.href)}
                        className="group flex h-full flex-col rounded-[24px] border border-white/[0.08] bg-panel/50 p-5 transition-colors duration-300 hover:border-violet-2/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-2"
                      >
                        <span className="flex items-center justify-between gap-3 font-display text-lg font-bold tracking-tight text-white">
                          {r.title}
                          <IconArrowRight size={16} className="shrink-0 text-violet-3 transition-transform duration-300 group-hover:translate-x-1" />
                        </span>
                        <span className="mt-1.5 text-sm leading-relaxed text-muted">{r.body}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </article>
        </div>
      </div>
    </>
  );
}
