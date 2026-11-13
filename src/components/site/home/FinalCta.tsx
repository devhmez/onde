// 11 · Final CTA over the living wave — order online, WhatsApp, or call.
import type { Locale } from "@/i18n/config";
import WaveBackground from "../WaveBackground";
import Reveal from "../Reveal";
import MagneticButton from "../MagneticButton";
import { Eyebrow } from "../Section";
import type { HomeDict } from "../types";

type Props = {
  locale: Locale;
  dict: HomeDict["final"];
  whatsappHref: string;
  phoneHref: string;
  phoneDisplay: string;
};

export default function FinalCta({ locale, dict, whatsappHref, phoneHref, phoneDisplay }: Props) {
  return (
    <section aria-labelledby="final-title" className="relative isolate overflow-hidden bg-ink">
      <WaveBackground className="absolute inset-0 -z-10" focus={[0.5, 0.62]} intensity={1.15} />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-40 bg-gradient-to-b from-ink to-transparent" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-ink-2 to-transparent" />
      <div className="container-site flex min-h-[86svh] flex-col items-center justify-center py-[clamp(6rem,14vw,11rem)] text-center">
        <Eyebrow>{dict.eyebrow}</Eyebrow>
        <Reveal as="h2" type="chars" id="final-title" className="text-display mt-7 max-w-5xl text-[clamp(2.7rem,8.4vw,8rem)] leading-[0.92]">
          {dict.title}
        </Reveal>
        <Reveal as="p" type="up" delay={0.2} className="mt-7 max-w-xl text-[1.05rem] leading-relaxed text-text/75 md:text-[1.15rem]">
          {dict.body}
        </Reveal>
        <Reveal type="up" delay={0.3} className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <MagneticButton
            href={`/${locale}/shop`}
            size="lg"
            icon={
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
                <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
          >
            {dict.order}
          </MagneticButton>
          <MagneticButton
            href={whatsappHref}
            size="lg"
            variant="whatsapp"
            iconPosition="start"
            icon={
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 2.9 2.9 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.6 11.6 0 0 0 4.4 3.9c1.6.7 2.3.8 3.1.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.4-.3Z" />
              </svg>
            }
          >
            {dict.whatsapp}
          </MagneticButton>
        </Reveal>
        <Reveal as="p" type="fade" delay={0.45} className="mt-8 text-sm text-muted">
          {dict.call}{" "}
          <a href={phoneHref} className="font-semibold text-text underline decoration-violet-2/60 underline-offset-4 transition-colors hover:text-violet-3">
            {phoneDisplay}
          </a>
        </Reveal>
      </div>
    </section>
  );
}
