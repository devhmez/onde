// /[locale]/contact — WhatsApp-first contact page (phone, email/socials from admin settings when set, pro orders, FAQ).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import PagesStyles from "@/components/pages/PagesStyles";
import ContactView from "@/components/pages/contact/ContactView";
import { loadContactInfo, loadRules } from "@/components/pages/data";
import { jsonLd, localizedUrl, orgId, pageMetadata } from "@/components/pages/seo";
import type { ContactDict } from "@/components/pages/types";

// Static per locale, refreshed every minute so newly configured email/socials appear without a deploy.
export const revalidate = 60;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = (await getDictionary(locale)).contact as ContactDict;
  return pageMetadata({ locale, path: "/contact", title: t.meta.title, description: t.meta.description });
}

export default async function ContactPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const [dict, contact, rules] = await Promise.all([getDictionary(locale), loadContactInfo(), loadRules()]);
  const t = dict.contact as ContactDict;

  // The Organization itself (phone, email, socials, contact points) is declared once by the site layout.
  const orgLd = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    url: localizedUrl(locale, "/contact"),
    name: t.meta.title,
    inLanguage: locale,
    mainEntity: { "@id": orgId() },
  };

  return (
    <>
      <PagesStyles />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(orgLd) }} />
      <main>
        <ContactView t={t} locale={locale} contact={contact} rules={rules} />
      </main>
    </>
  );
}
