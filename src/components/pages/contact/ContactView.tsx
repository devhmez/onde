// Contact page body: WhatsApp-first bento (live chat preview), phone with copy, email/socials only when set,
// business/bulk orders block, availability, FAQ and a final order band. Map-free on purpose.
import type { CSSProperties } from "react";
import type { Locale } from "@/i18n/config";
import { formatDT, type Rules } from "@/lib/business";
import Section, { Eyebrow } from "@/components/site/Section";
import Reveal from "@/components/site/Reveal";
import MagneticButton from "@/components/site/MagneticButton";
import { LightPool, Ripples } from "../Ambient";
import { CharRise, RevealBlock, Tilt } from "../motion";
import { fmt, formatPhone, socialHandle, socialUrl, telHref, waLink, type SocialNetwork } from "../lib";
import type { ContactInfo } from "../data";
import type { ContactDict } from "../types";
import ChatPreview from "./ChatPreview";
import CopyButton from "./CopyButton";
import {
  IconArrowRight,
  IconBuilding,
  IconCheck,
  IconClock,
  IconFacebook,
  IconInstagram,
  IconMail,
  IconPhone,
  IconPin,
  IconPlus,
  IconTikTok,
  IconWhatsApp,
} from "../icons";

const SOCIAL_ICONS: Record<SocialNetwork, typeof IconInstagram> = { instagram: IconInstagram, facebook: IconFacebook, tiktok: IconTikTok };

export default function ContactView({ t, locale, contact, rules }: { t: ContactDict; locale: Locale; contact: ContactInfo; rules: Rules }) {
  const phoneDisplay = formatPhone(contact.phone);
  const socials = (["instagram", "facebook", "tiktok"] as const)
    .map((n) => ({ network: n, url: socialUrl(n, contact[n]) }))
    .filter((s): s is { network: SocialNetwork; url: string } => !!s.url);
  const vars = {
    deliveryFee: formatDT(rules.deliveryFee, locale),
    threshold: formatDT(rules.freeDeliveryThreshold, locale),
    pct: rules.returningDiscountPct,
  };

  return (
    <>
      {/* ---------------------------------------------------------------- hero */}
      <section className="relative overflow-x-clip pb-[clamp(2rem,5vw,4rem)] pt-[clamp(7.5rem,14vw,11rem)]" aria-labelledby="contact-title">
        <div className="pointer-events-none absolute -right-[20vw] top-0 h-[90vh] w-[90vw] md:-right-[10vw] md:w-[70vw]">
          <Ripples count={5} duration={8} size="min(110vmin,1000px)" className="opacity-60 [mask-image:radial-gradient(closest-side,#000,transparent)]" />
        </div>
        <LightPool className="-right-[10vw] top-[-10%] h-[80vh] w-[80vw]" opacity={0.28} />
        <div className="container-site relative">
          <h1 id="contact-title" className="text-display text-[clamp(3.4rem,11vw,9.5rem)]">
            <span className="op-fade-up mb-5 flex" style={{ "--d": "100ms" } as CSSProperties}>
              <Eyebrow as="span">{t.hero.eyebrow}</Eyebrow>
              <span className="sr-only"> — </span>
            </span>
            <CharRise text={t.hero.titleA} delayMs={180} />
          </h1>
          <p className="op-fade-up mt-6 max-w-2xl text-lg leading-relaxed text-muted md:text-xl" style={{ "--d": "600ms" } as CSSProperties}>
            {t.hero.lead}
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- bento */}
      <Section spacing="sm" aria-label={t.hero.eyebrow}>
        <div className="grid gap-4 lg:grid-cols-12">
          {/* WhatsApp — the hero channel */}
          <RevealBlock className="lg:col-span-7 lg:row-span-2">
            <Tilt className="h-full rounded-[32px]" max={4}>
              <article className="relative flex h-full flex-col overflow-hidden rounded-[32px] border border-whatsapp/20 bg-gradient-to-br from-[#0e2a1d] via-panel to-ink-2 p-7 md:p-10">
                <span aria-hidden className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-whatsapp/20 blur-3xl" />
                <div className="relative flex items-center gap-3">
                  <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-whatsapp text-white shadow-[0_0_40px_-6px_rgba(37,211,102,.7)]">
                    <span aria-hidden className="pulse-ring absolute inset-0 rounded-2xl border border-whatsapp/70" />
                    <IconWhatsApp size={26} />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-whatsapp">{t.whatsapp.kicker}</p>
                    <h2 className="font-display text-2xl font-bold tracking-tight">{t.whatsapp.title}</h2>
                  </div>
                </div>
                <p className="relative mt-5 max-w-lg text-base leading-relaxed text-muted md:text-lg">{t.whatsapp.body}</p>
                <div className="relative mt-7">
                  <ChatPreview me={t.whatsapp.bubbleMe} them={t.whatsapp.bubbleThem} typing={t.whatsapp.typing} />
                </div>
                <div className="relative mt-7 flex flex-wrap items-center gap-3 md:mt-auto md:pt-8">
                  <MagneticButton href={waLink(contact.whatsapp, t.whatsapp.message)} target="_blank" rel="noopener noreferrer" variant="whatsapp" size="lg" icon={<IconWhatsApp size={20} />} iconPosition="start">
                    {t.whatsapp.cta}
                  </MagneticButton>
                  <span className="font-mono text-sm text-muted">{phoneDisplay}</span>
                </div>
              </article>
            </Tilt>
          </RevealBlock>

          {/* Phone */}
          <RevealBlock delay={0.08} className="lg:col-span-5">
            <article className="relative h-full overflow-hidden rounded-[32px] border border-white/[0.07] bg-panel/70 p-7 backdrop-blur md:p-8">
              <div className="flex items-center gap-3 text-violet-3">
                <IconPhone size={20} />
                <p className="text-xs font-semibold uppercase tracking-[0.24em]">{t.phone.kicker}</p>
              </div>
              <h2 className="sr-only">{t.phone.title}</h2>
              <a href={telHref(contact.phone)} className="mt-4 block font-display text-[clamp(1.9rem,3.6vw,2.8rem)] font-bold tracking-tight text-white transition hover:text-violet-3">
                {phoneDisplay}
              </a>
              <div className="mt-6 flex flex-wrap gap-2">
                <MagneticButton href={telHref(contact.phone)} variant="primary" size="md" icon={<IconPhone size={18} />} iconPosition="start">
                  {t.phone.cta}
                </MagneticButton>
                <CopyButton value={phoneDisplay} label={t.phone.copy} copiedLabel={t.phone.copied} />
              </div>
            </article>
          </RevealBlock>

          {/* Email when configured, otherwise availability takes the slot */}
          {contact.email ? (
            <RevealBlock delay={0.14} className="lg:col-span-5">
              <article className="relative h-full overflow-hidden rounded-[32px] border border-white/[0.07] bg-panel/70 p-7 backdrop-blur md:p-8">
                <div className="flex items-center gap-3 text-violet-3">
                  <IconMail size={20} />
                  <p className="text-xs font-semibold uppercase tracking-[0.24em]">{t.email.kicker}</p>
                </div>
                <h2 className="sr-only">{t.email.title}</h2>
                <a href={`mailto:${contact.email}`} className="mt-4 block break-all font-display text-[clamp(1.4rem,2.6vw,2rem)] font-bold tracking-tight text-white transition hover:text-violet-3">
                  {contact.email}
                </a>
                <div className="mt-6 flex flex-wrap gap-2">
                  <MagneticButton href={`mailto:${contact.email}`} variant="ghost" size="md" icon={<IconMail size={18} />} iconPosition="start">
                    {t.email.cta}
                  </MagneticButton>
                  <CopyButton value={contact.email} label={t.email.copy} copiedLabel={t.email.copied} />
                </div>
              </article>
            </RevealBlock>
          ) : (
            <RevealBlock delay={0.14} className="lg:col-span-5">
              <Availability t={t.hours} />
            </RevealBlock>
          )}

          {contact.email ? (
            <RevealBlock delay={0.1} className={socials.length ? "lg:col-span-6" : "lg:col-span-12"}>
              <Availability t={t.hours} />
            </RevealBlock>
          ) : null}

          {socials.length ? (
            <RevealBlock delay={0.16} className={contact.email ? "lg:col-span-6" : "lg:col-span-12"}>
              <article className="h-full rounded-[32px] border border-white/[0.07] bg-panel/70 p-7 backdrop-blur md:p-8">
                <h2 className="eyebrow">{t.socials.title}</h2>
                <ul className="mt-5 flex flex-wrap gap-3">
                  {socials.map(({ network, url }) => {
                    const Icon = SOCIAL_ICONS[network];
                    const name = t.socials[network];
                    return (
                      <li key={network}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={fmt(t.socials.open, { network: name })}
                          className="group inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] py-2 pl-2 pr-5 transition duration-300 hover:-translate-y-0.5 hover:border-violet/50 hover:bg-violet/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-2"
                        >
                          <span className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06] text-white transition group-hover:bg-violet">
                            <Icon size={20} />
                          </span>
                          <span className="text-sm">
                            <span className="block font-semibold text-white">{name}</span>
                            <span className="block text-xs text-muted">{socialHandle(url)}</span>
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </article>
            </RevealBlock>
          ) : null}
        </div>
      </Section>

      {/* ---------------------------------------------------------------- business / bulk */}
      <Section spacing="md" aria-labelledby="pro-title">
        <RevealBlock>
          <article className="relative overflow-hidden rounded-[36px] border border-violet/30 bg-gradient-to-br from-violet/25 via-panel to-ink-2 p-7 md:p-12">
            <div className="pointer-events-none absolute -bottom-1/2 -right-1/4 h-[140%] w-[80%]">
              <Ripples count={4} duration={7} size="min(90vmin,900px)" className="opacity-70" />
            </div>
            <div className="relative grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-end">
              <div>
                <p className="eyebrow inline-flex items-center gap-2">
                  <IconBuilding size={16} /> {t.pro.eyebrow}
                </p>
                <h2 id="pro-title" className="mt-4 text-display text-[clamp(2.2rem,5vw,4.4rem)]">
                  {t.pro.title}
                </h2>
                <p className="mt-5 max-w-xl text-lg leading-relaxed text-text/80">{t.pro.body}</p>
              </div>
              <div>
                <ul className="space-y-3">
                  {t.pro.points.map((p) => (
                    <li key={p} className="flex items-start gap-3 text-base text-text/90">
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-violet text-white">
                        <IconCheck size={14} />
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <MagneticButton href={waLink(contact.whatsapp, t.pro.message)} target="_blank" rel="noopener noreferrer" variant="light" size="lg" icon={<IconWhatsApp size={20} />} iconPosition="start">
                    {t.pro.cta}
                  </MagneticButton>
                </div>
              </div>
            </div>
          </article>
        </RevealBlock>
      </Section>

      {/* ---------------------------------------------------------------- FAQ */}
      <Section spacing="md" aria-labelledby="faq-title">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <Reveal as="h2" type="words" id="faq-title" className="text-display text-[clamp(2rem,4.4vw,3.6rem)]">
            {t.faq.title}
          </Reveal>
          <div className="divide-y divide-line border-y border-line">
            {t.faq.items.map((item) => (
              <details key={item.q} className="op-details group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-left font-display text-lg font-semibold tracking-tight text-white transition hover:text-violet-3 md:text-xl">
                  {item.q}
                  <span className="op-details-icon grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-violet-3 transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] group-open:border-violet/50">
                    <IconPlus size={18} />
                  </span>
                </summary>
                <p className="-mt-1 max-w-2xl pb-6 pr-12 text-base leading-relaxed text-muted">{fmt(item.a, vars)}</p>
              </details>
            ))}
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- order band */}
      <Section spacing="md">
        <RevealBlock>
          <div className="flex flex-col items-start justify-between gap-8 rounded-[32px] border border-white/[0.07] bg-panel/60 p-7 md:flex-row md:items-center md:p-10">
            <div>
              <h2 className="text-display text-[clamp(1.8rem,3.6vw,3rem)]">{t.order.title}</h2>
              <p className="mt-2 text-muted">{t.order.body}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <MagneticButton href={`/${locale}/shop`} size="lg" icon={<IconArrowRight size={20} />}>
                {t.order.shop}
              </MagneticButton>
              <MagneticButton href={waLink(contact.whatsapp, t.whatsapp.message)} target="_blank" rel="noopener noreferrer" variant="whatsapp" size="lg" icon={<IconWhatsApp size={20} />} iconPosition="start">
                {t.whatsapp.cta}
              </MagneticButton>
            </div>
          </div>
        </RevealBlock>
      </Section>
    </>
  );
}

function Availability({ t }: { t: ContactDict["hours"] }) {
  return (
    <article className="relative h-full overflow-hidden rounded-[32px] border border-white/[0.07] bg-panel/70 p-7 backdrop-blur md:p-8">
      <div className="flex items-center gap-3 text-violet-3">
        <IconClock size={20} />
        <h2 className="text-xs font-semibold uppercase tracking-[0.24em]">{t.title}</h2>
      </div>
      <p className="mt-4 flex items-center gap-3 font-display text-[clamp(1.6rem,3vw,2.3rem)] font-bold tracking-tight text-white">
        <span className="relative flex h-3 w-3">
          <span aria-hidden className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-ok" />
        </span>
        {t.value}
      </p>
      <p className="mt-2 text-muted">{t.body}</p>
      <p className="mt-6 flex items-center gap-2 text-sm text-text/70">
        <IconPin size={16} className="text-violet-3" /> {t.basedIn}
      </p>
    </article>
  );
}
