// Root layout of the public site (FR/EN). Owns <html lang>, fonts, metadata defaults and the global shell:
// intro, smooth scroll, nav, cart drawer, footer, grain, page-view beacon — plus the site-wide structured data
// (Organization + WebSite, referenced by @id from every page) and the optional search-engine verification tags.
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import "../../globals.css";
import { locales, isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import CartDrawer from "@/components/shop/CartDrawer";
import InlineScript from "@/components/site/InlineScript";
import { INTRO_BOOT_SCRIPT } from "@/components/site/boot-script";
import IntroLoader from "@/components/site/IntroLoader";
import SmoothScroll from "@/components/site/SmoothScroll";
import Nav from "@/components/site/Nav";
import Footer from "@/components/site/Footer";
import Grain from "@/components/site/Grain";
import { fontVariables } from "@/fonts";
import PageViewTracker from "@/components/site/PageViewTracker";
import { loadContact } from "@/components/site/server-data";
import type { CommonDict } from "@/components/site/types";
import JsonLd from "@/components/pages/JsonLd";
import { siteGraph, siteUrl } from "@/components/pages/seo";
import type { SeoDict } from "@/components/pages/types";

// Static per locale, re-rendered at most every minute so footer contacts/socials follow admin settings.
export const revalidate = 60;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: "#050407",
  colorScheme: "dark",
  viewportFit: "cover",
};

/**
 * Search-engine ownership tags, from the environment (never committed): GOOGLE_SITE_VERIFICATION → <meta
 * name="google-site-verification">, BING_SITE_VERIFICATION → <meta name="msvalidate.01">. Unset = no tag.
 * Only needed for the "HTML tag" verification method; a DNS TXT record (docs/SEO.md) works without them.
 */
function verification(): Metadata["verification"] | undefined {
  const google = process.env.GOOGLE_SITE_VERIFICATION?.trim();
  const bing = process.env.BING_SITE_VERIFICATION?.trim();
  if (!google && !bing) return undefined;
  return { ...(google ? { google } : {}), ...(bing ? { other: { "msvalidate.01": bing } } : {}) };
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getDictionary(locale);
  const meta = (dict.common as CommonDict).meta;
  const verify = verification();
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: meta.title, template: "%s | ONDE" },
    description: meta.description,
    applicationName: "ONDE",
    openGraph: {
      type: "website",
      siteName: "ONDE",
      locale: locale === "fr" ? "fr_TN" : "en_US",
      alternateLocale: locale === "fr" ? ["en_US"] : ["fr_TN"],
      title: meta.title,
      description: meta.description,
      images: [{ url: "/og.jpg", width: 1200, height: 630, alt: meta.ogAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
      images: ["/og.jpg"],
    },
    formatDetection: { telephone: false },
    ...(verify ? { verification: verify } : {}),
  };
}

export default async function SiteLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const [dict, contact] = await Promise.all([getDictionary(locale), loadContact()]);
  const common = dict.common as CommonDict;
  const graph = siteGraph({ locale, contact, description: (dict.seo as SeoDict).org.description });

  return (
    <html
      lang={locale}
      data-intro="done"
      className={fontVariables}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-ink font-sans text-text antialiased">
        <InlineScript html={INTRO_BOOT_SCRIPT} />
        <JsonLd data={graph} />
        <a href="#content" className="skip-link">
          {common.nav.skipToContent}
        </a>
        <IntroLoader dict={common.intro} />
        <SmoothScroll />
        <Nav locale={locale} dict={common} contact={contact} />
        <CartDrawer locale={locale} dict={dict.shop} />
        <div id="content" tabIndex={-1} className="relative outline-none">
          {children}
        </div>
        <Footer locale={locale} dict={common} contact={contact} />
        <Grain />
        <PageViewTracker locale={locale} />
      </body>
    </html>
  );
}
