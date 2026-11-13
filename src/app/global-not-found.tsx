// Global 404 for URLs that match no route at all. The app has several root layouts — (site)/[locale] and
// (admin) — so per the Next.js docs this file renders a complete document on its own (global styles + fonts).
// Fonts: its own non-preloading instances (src/fonts/not-found.ts) — this module is part of every route's bundle, and
// the site's preloading ones would make every page (client page, admin) preload all ten font files.
// Requires `experimental.globalNotFound: true` in next.config.ts; without it Next serves its default 404.
// Language: onde-locale cookie → Accept-Language → fr (detectLocale, the same rule as the proxy).
import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { notFoundFontVariables } from "@/fonts/not-found";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { detectLocale, LOCALE_COOKIE } from "@/server/locale";
import Logo from "@/components/site/Logo";
import PagesStyles from "@/components/pages/PagesStyles";
import NotFoundScene from "@/components/pages/NotFoundScene";
import { loadContactInfo } from "@/components/pages/data";
import type { InactiveDict, NotFoundDict } from "@/components/pages/types";


// Reading cookies/headers makes this 404 render per request (no try/catch: Next must see the dynamic access).
async function requestLocale(): Promise<Locale> {
  const [c, h] = await Promise.all([cookies(), headers()]);
  return detectLocale(c.get(LOCALE_COOKIE)?.value, h.get("accept-language"));
}

async function notFoundDict(locale: Locale): Promise<NotFoundDict> {
  return ((await getDictionary(locale)).inactive as InactiveDict).notFound;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await notFoundDict(await requestLocale());
  return { title: t.meta.title, description: t.meta.description, robots: { index: false, follow: true } };
}

export default async function GlobalNotFound() {
  const locale = await requestLocale();
  const [fr, en, contact] = await Promise.all([notFoundDict("fr"), notFoundDict("en"), loadContactInfo()]);
  return (
    <html lang={locale} data-intro="done" className={notFoundFontVariables}>
      <body className="min-h-dvh bg-ink font-sans text-text antialiased">
        <PagesStyles />
        <header className="absolute inset-x-0 top-0 z-10">
          <div className="container-site flex h-20 items-center">
            {/* No prefetch: its response would make the browser fetch the site's fonts again (see NotFoundScene). */}
            <Link href={`/${locale}`} prefetch={false} aria-label="ONDE" className="rounded-lg text-white transition hover:opacity-80">
              <Logo className="h-8 w-auto" />
            </Link>
          </div>
        </header>
        <main>
          <NotFoundScene dicts={{ fr, en }} locale={locale} whatsapp={contact.whatsapp} prefetch={false} />
        </main>
      </body>
    </html>
  );
}
