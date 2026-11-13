// "Pas sûr du bon format ?" — WhatsApp inquiry band (server component; the button is a client leaf).
import type { Locale } from "@/i18n/config";
import { displayPhone, fmt, type ShopMessages } from "./messages";
import type { ShopSettings } from "./rules";
import FadeIn from "./FadeIn";
import WhatsAppOrderButton from "./WhatsAppOrderButton";
import { NfcIcon, PhoneIcon } from "./Icons";

type Props = { locale: Locale; t: ShopMessages; settings: ShopSettings };

export default function HelpBand({ locale, t, settings }: Props) {
  const phone = displayPhone(settings.phone);
  return (
    <FadeIn inView as="section" className="relative isolate overflow-hidden rounded-[32px] border border-white/[0.08] bg-panel/60 px-6 py-12 sm:px-12 sm:py-16">
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 -z-10 size-96 rounded-full bg-violet/30 blur-[100px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-10 right-10 -z-10 text-violet-2/15 sm:right-24">
        <NfcIcon size={260} strokeWidth={0.8} />
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-violet-3">{t.help.eyebrow}</p>
      <h2 className="mt-4 max-w-2xl font-display text-3xl font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-5xl">
        {t.help.title}
      </h2>
      <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">{t.help.body}</p>
      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
        <WhatsAppOrderButton
          locale={locale}
          settings={settings}
          message={t.whatsapp.inquiry}
          label={t.help.cta}
          variant="solid"
          className="h-14 px-8 text-base"
        />
        <a
          href={`tel:+216${settings.phone}`}
          className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-2"
        >
          <PhoneIcon size={16} />
          {fmt(t.help.orCall, { phone })}
        </a>
      </div>
    </FadeIn>
  );
}
