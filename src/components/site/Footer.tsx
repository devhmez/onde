// Site footer (server component). Contact: phone + WhatsApp always; email / socials only when set in admin
// settings (empty → hidden). Giant outlined "onde" wordmark that draws on scroll, tagline, guide links, legal links
// (terms, privacy, legal notice & copyright).
import Link from "next/link";
import type { Locale } from "@/i18n/config";
import FooterWordmark from "./FooterWordmark";
import BackToTop from "./BackToTop";
import {
  formatPhone,
  socialHref,
  telHref,
  whatsappHref,
  type CommonDict,
  type SiteContact,
} from "./types";

type FooterProps = { locale: Locale; dict: CommonDict; contact: SiteContact };

const SOCIAL_ICONS: Record<"instagram" | "facebook" | "tiktok", string> = {
  instagram:
    "M12 7.2a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6Zm0 7.9a3.1 3.1 0 1 1 0-6.2 3.1 3.1 0 0 1 0 6.2Zm6.1-8.1a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0ZM21.3 8c-.1-1.5-.4-2.8-1.5-3.8S17.5 2.8 16 2.7c-1.6-.1-6.3-.1-7.9 0-1.5.1-2.8.4-3.8 1.5S2.8 6.5 2.7 8c-.1 1.6-.1 6.3 0 7.9.1 1.5.4 2.8 1.5 3.8s2.3 1.4 3.8 1.5c1.6.1 6.3.1 7.9 0 1.5-.1 2.8-.4 3.8-1.5s1.4-2.3 1.5-3.8c.1-1.6.1-6.3 0-7.9Zm-2 9.6a3.2 3.2 0 0 1-1.8 1.8c-1.3.5-4.3.4-5.6.4s-4.4.1-5.6-.4a3.2 3.2 0 0 1-1.8-1.8c-.5-1.3-.4-4.3-.4-5.6s-.1-4.4.4-5.6a3.2 3.2 0 0 1 1.8-1.8c1.3-.5 4.3-.4 5.6-.4s4.4-.1 5.6.4a3.2 3.2 0 0 1 1.8 1.8c.5 1.3.4 4.3.4 5.6s.1 4.4-.4 5.6Z",
  facebook:
    "M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7A10 10 0 0 0 22 12Z",
  tiktok:
    "M19.6 6.7a4.8 4.8 0 0 1-3.8-4.2V2h-3.4v13.7a2.9 2.9 0 1 1-2-2.7V9.5a6.3 6.3 0 1 0 5.4 6.2V8.8a8.2 8.2 0 0 0 4.8 1.5V6.9l-1-.2Z",
};

export default function Footer({ locale, dict, contact }: FooterProps) {
  const base = `/${locale}`;
  const f = dict.footer;
  const year = new Date().getFullYear();
  const socials = (["instagram", "facebook", "tiktok"] as const)
    .map((k) => ({ k, href: socialHref(k, contact[k]) }))
    .filter((s) => s.href);

  const explore = [
    { href: base, label: dict.nav.home },
    { href: `${base}/shop`, label: dict.nav.shop },
    { href: `${base}/about`, label: dict.nav.about },
    { href: `${base}/contact`, label: dict.nav.contact },
  ];
  const guides = [
    { href: `${base}/guides/google-review-link`, label: f.guideReviewLink },
    { href: `${base}/guides/get-more-google-reviews`, label: f.guideMoreReviews },
    { href: `${base}/restaurants`, label: f.restaurants },
  ];
  const legal = [
    { href: `${base}/legal/terms`, label: f.terms },
    { href: `${base}/legal/privacy`, label: f.privacy },
    { href: `${base}/legal/notice`, label: f.notice },
  ];

  return (
    <footer className="relative overflow-hidden border-t border-white/[0.06] bg-ink-2">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[60%]"
        style={{ background: "radial-gradient(60% 80% at 50% 0%, rgb(70 28 247 / 0.16), transparent 70%)" }}
      />
      <div className="container-site relative pt-[clamp(4rem,9vw,7rem)]">
        <div className="grid gap-12 md:grid-cols-12 md:gap-8">
          <div className="md:col-span-5">
            <p className="text-display text-[clamp(2rem,4.4vw,3.4rem)] leading-[0.98]">
              {f.tagline.split(". ").map((part, i, arr) => (
                <span key={i} className={i === arr.length - 1 ? "block text-violet-3" : "block"}>
                  {part}
                  {i < arr.length - 1 ? "." : ""}
                </span>
              ))}
            </p>
            <p className="mt-6 max-w-sm text-[0.95rem] leading-relaxed text-muted">{f.pitch}</p>
            <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-line bg-panel/60 px-4 py-2 text-xs font-medium text-text/80">
              <span className="h-1.5 w-1.5 rounded-full bg-ok shadow-[0_0_10px_2px_rgb(43_212_138/0.6)]" aria-hidden="true" />
              {f.delivery}
            </p>
          </div>

          <nav aria-label={f.explore} className="md:col-span-2 md:col-start-7">
            <h2 className="eyebrow mb-5 text-muted">{f.explore}</h2>
            <ul className="space-y-3">
              {explore.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="group inline-flex text-[0.95rem] text-text/85 transition-colors hover:text-text">
                    <span className="roll">
                      <span>{l.label}</span>
                      <span aria-hidden="true">{l.label}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <h2 className="eyebrow mb-5 mt-10 text-muted">{f.guides}</h2>
            <ul className="space-y-3">
              {guides.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-[0.95rem] text-text/85 transition-colors hover:text-text">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="md:col-span-3">
            <h2 className="eyebrow mb-5 text-muted">{f.contact}</h2>
            <ul className="space-y-3 text-[0.95rem]">
              <li>
                <a href={telHref(contact.phone)} className="group flex flex-col">
                  <span className="text-xs text-muted">{f.phone}</span>
                  <span className="font-medium text-text transition-colors group-hover:text-violet-3">{formatPhone(contact.phone)}</span>
                </a>
              </li>
              <li>
                <a
                  href={whatsappHref(contact.whatsapp, dict.whatsapp.message)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col"
                >
                  <span className="text-xs text-muted">{f.whatsapp}</span>
                  <span className="inline-flex items-center gap-2 font-medium text-text transition-colors group-hover:text-whatsapp">
                    wa.me/{contact.whatsapp.replace(/\D/g, "")}
                    <svg viewBox="0 0 16 16" className="h-3 w-3 opacity-60" aria-hidden="true">
                      <path d="M5 11 11 5M6 5h5v5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </span>
                </a>
              </li>
              {contact.email && (
                <li>
                  <a href={`mailto:${contact.email}`} className="group flex flex-col">
                    <span className="text-xs text-muted">{f.email}</span>
                    <span className="break-all font-medium text-text transition-colors group-hover:text-violet-3">{contact.email}</span>
                  </a>
                </li>
              )}
            </ul>
          </div>

          <div className="md:col-span-2">
            {socials.length > 0 && (
              <div className="mb-8">
                <h2 className="eyebrow mb-5 text-muted">{f.follow}</h2>
                <ul className="flex gap-2">
                  {socials.map((s) => (
                    <li key={s.k}>
                      <a
                        href={s.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={s.k.charAt(0).toUpperCase() + s.k.slice(1)}
                        className="grid h-11 w-11 place-items-center rounded-full border border-line text-text/80 transition-all duration-300 hover:-translate-y-0.5 hover:border-violet-2 hover:bg-violet/20 hover:text-text"
                      >
                        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true">
                          <path d={SOCIAL_ICONS[s.k]} />
                        </svg>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <h2 className="eyebrow mb-5 text-muted">{f.legal}</h2>
            <ul className="space-y-3 text-[0.95rem]">
              {legal.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-text/85 transition-colors hover:text-text">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-[clamp(3.5rem,8vw,6rem)]">
          <FooterWordmark />
        </div>

        <div className="flex flex-col-reverse items-start justify-between gap-6 border-t border-white/[0.06] py-7 text-xs text-muted sm:flex-row sm:items-center">
          <p>
            © {year} ONDE · onde.tn — {f.rights}
          </p>
          <BackToTop label={f.backToTop} />
        </div>
      </div>
    </footer>
  );
}
