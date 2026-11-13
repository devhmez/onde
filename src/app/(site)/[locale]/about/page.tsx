// /[locale]/about — "Le film": the cinematic film player, then the ONDE story told in scroll scenes.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { formatDT } from "@/lib/business";
import PagesStyles from "@/components/pages/PagesStyles";
import AboutHero, { FILM } from "@/components/pages/about/AboutHero";
import WhySection from "@/components/pages/about/WhySection";
import StatsSection from "@/components/pages/about/StatsSection";
import HowSection from "@/components/pages/about/HowSection";
import SmartLinkSection from "@/components/pages/about/SmartLinkSection";
import TunisiaSection from "@/components/pages/about/TunisiaSection";
import CountersSection from "@/components/pages/about/CountersSection";
import FinalCta from "@/components/pages/about/FinalCta";
import { loadContactInfo, loadRules } from "@/components/pages/data";
import { isoDuration } from "@/components/pages/lib";
import JsonLd from "@/components/pages/JsonLd";
import { breadcrumbLd, localizedUrl, orgId, pageMetadata, siteUrl, websiteId } from "@/components/pages/seo";
import type { AboutDict, SeoDict } from "@/components/pages/types";

// Static per locale, refreshed every minute (delivery threshold / WhatsApp follow admin settings).
export const revalidate = 60;

type Props = { params: Promise<{ locale: string }> };

const FILM_PUBLISHED = "2026-10-09";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = (await getDictionary(locale)).about as AboutDict;
  return pageMetadata({
    locale,
    path: "/about",
    title: t.meta.title,
    description: t.meta.description,
    ogAlt: t.meta.ogAlt,
    video: { url: FILM.src1080, width: 1920, height: 1080, type: "video/mp4" },
  });
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const [dict, rules, contact] = await Promise.all([getDictionary(locale), loadRules(), loadContactInfo()]);
  const t = dict.about as AboutDict;
  const seo = dict.seo as SeoDict;
  const threshold = formatDT(rules.freeDeliveryThreshold, locale);
  const base = siteUrl();

  const videoLd = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: t.player.title,
    description: t.meta.description,
    thumbnailUrl: [`${base}${FILM.poster}`],
    uploadDate: FILM_PUBLISHED,
    duration: isoDuration(FILM.duration),
    contentUrl: `${base}${FILM.src1080}`,
    embedUrl: localizedUrl(locale, "/about"),
    inLanguage: "en",
    publisher: { "@id": orgId() },
    hasPart: t.chapters.map((c, i) => ({
      "@type": "Clip",
      name: c.label,
      startOffset: c.t,
      endOffset: t.chapters[i + 1]?.t ?? FILM.duration,
      url: `${localizedUrl(locale, "/about")}#t=${c.t}`,
    })),
  };

  return (
    <>
      <PagesStyles />
      <JsonLd
        data={[
          videoLd,
          {
            "@context": "https://schema.org",
            "@type": "AboutPage",
            url: localizedUrl(locale, "/about"),
            name: t.meta.title,
            inLanguage: locale,
            about: { "@id": orgId() },
            isPartOf: { "@id": websiteId() },
          },
          breadcrumbLd(locale, [
            { name: seo.breadcrumb.home, path: "" },
            { name: t.hero.eyebrow, path: "/about" },
          ]),
        ]}
      />
      {/* The site layout wraps pages in div#content without a landmark: each page provides its own <main>. */}
      <main>
        <AboutHero t={t.hero} chapters={t.chapters} player={t.player} />
        <div id="story" className="scroll-mt-24">
          <WhySection t={t.why} />
          <StatsSection t={t.stats} locale={locale} />
          <HowSection t={t.how} />
          <SmartLinkSection t={t.link} />
          <TunisiaSection t={t.tunisia} threshold={threshold} />
          <CountersSection t={t.counters} />
        </div>
        <FinalCta t={t.cta} shopHref={`/${locale}/shop`} whatsapp={contact.whatsapp} threshold={threshold} />
      </main>
    </>
  );
}
