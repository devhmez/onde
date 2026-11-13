// 10 · FAQ — accordion + FAQPage structured data (same questions and answers as the visible list).
import Section, { Eyebrow } from "../Section";
import Reveal from "../Reveal";
import MagneticButton from "../MagneticButton";
import FaqList from "./FaqList";
import type { HomeDict } from "../types";

type Props = { dict: HomeDict["faq"]; items: { q: string; a: string; link?: { href: string; label: string } }[]; whatsappHref: string };

export default function Faq({ dict, items, whatsappHref }: Props) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a },
    })),
  };

  return (
    <Section id="faq" aria-labelledby="faq-title" className="bg-ink">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Eyebrow>{dict.eyebrow}</Eyebrow>
          <Reveal as="h2" type="lines" id="faq-title" className="text-display mt-6 text-[clamp(2.2rem,5vw,4.4rem)] leading-[0.98]">
            {dict.title}
          </Reveal>
          <div className="mt-10 hidden rounded-[24px] border border-white/[0.07] bg-panel/60 p-6 lg:block">
            <p className="font-display text-lg font-semibold">{dict.more}</p>
            <div className="mt-5">
              <MagneticButton href={whatsappHref} variant="whatsapp" size="md">
                {dict.moreCta}
              </MagneticButton>
            </div>
          </div>
        </div>
        <Reveal type="stagger" y={24}>
          <FaqList items={items} />
          <div className="mt-10 flex flex-col items-start gap-4 lg:hidden">
            <p className="font-display text-lg font-semibold">{dict.more}</p>
            <MagneticButton href={whatsappHref} variant="whatsapp" size="md">
              {dict.moreCta}
            </MagneticButton>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
