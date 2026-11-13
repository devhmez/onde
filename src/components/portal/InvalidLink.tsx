// "This link is not valid — contact ONDE": the one page for every token that does not open a client page.
import Logo from "@/components/site/Logo";
import type { Locale } from "@/i18n/config";
import type { PortalDict } from "./dict";
import { IconChat, IconLock } from "./icons";

export default function InvalidLink({ t, locale, whatsapp }: { t: PortalDict; locale: Locale; whatsapp: string }) {
  return (
    <>
      <div className="pt-glow" aria-hidden />
      <main className="pt-wrap pt-invalid" id="main">
        <div className="pt-top">
          <Logo className="pt-logo" title="ONDE" />
          <nav className="pt-lang" aria-label={t.header.lang}>
            <a href="?lang=fr" hrefLang="fr" lang="fr" aria-current={locale === "fr" ? "true" : undefined}>
              FR
            </a>
            <a href="?lang=en" hrefLang="en" lang="en" aria-current={locale === "en" ? "true" : undefined}>
              EN
            </a>
          </nav>
        </div>
        <div className="pt-invalid-card">
          <span className="pt-invalid-ic" aria-hidden>
            <IconLock width={28} height={28} />
            <i />
            <i />
          </span>
          <p className="pt-eyebrow">{t.invalid.eyebrow}</p>
          <h1 className="pt-title sm">{t.invalid.title}</h1>
          <p className="pt-lead">{t.invalid.lead}</p>
          <div className="pt-invalid-actions">
            {whatsapp ? (
              <a
                className="pt-btn wa wide"
                href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(t.invalid.message)}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                <IconChat width={17} height={17} />
                {t.invalid.cta}
              </a>
            ) : null}
            <a className="pt-btn wide" href={`/${locale}`} rel="noreferrer">
              {t.invalid.home}
            </a>
          </div>
        </div>
      </main>
    </>
  );
}
