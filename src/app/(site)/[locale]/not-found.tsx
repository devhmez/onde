// In-site 404 (rendered inside the public layout — nav, footer, cart) whenever a page under /[locale] calls
// notFound(), e.g. an unknown product slug. not-found files receive no params: the client scene reads the
// locale from the route, so both (tiny) dictionaries are handed over. Next adds <meta name="robots" content="noindex">.
// A notFound() thrown before anything streamed (unknown product or order) answers HTTP 404 with Next's error shell
// and the scene renders on the client; the <title> of that response comes from generateMetadata below (Next resolves
// a not-found boundary's metadata with its segment params), the same one as the global 404 for unmatched URLs.
import type { Metadata } from "next";
import frInactive from "../../../../messages/fr/inactive.json";
import enInactive from "../../../../messages/en/inactive.json";
import { defaultLocale, isLocale } from "@/i18n/config";
import PagesStyles from "@/components/pages/PagesStyles";
import NotFoundScene from "@/components/pages/NotFoundScene";
import { loadContactInfo } from "@/components/pages/data";

export async function generateMetadata({ params }: { params?: Promise<{ locale?: string }> }): Promise<Metadata> {
  const raw = (await params)?.locale ?? "";
  const locale = isLocale(raw) ? raw : defaultLocale;
  const t = (locale === "en" ? enInactive : frInactive).notFound.meta;
  return { title: { absolute: t.title }, description: t.description, robots: { index: false, follow: true } };
}

export default async function LocaleNotFound() {
  const contact = await loadContactInfo();
  return (
    <>
      <PagesStyles />
      <main>
        <NotFoundScene dicts={{ fr: frInactive.notFound, en: enInactive.notFound }} whatsapp={contact.whatsapp} />
      </main>
    </>
  );
}
