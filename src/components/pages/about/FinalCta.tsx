// Closing shot of the film: "Small tap. Big impact." over the living violet waves, with the two ways to order.
import WaveBackground from "@/components/site/WaveBackground";
import MagneticButton from "@/components/site/MagneticButton";
import Logo from "@/components/site/Logo";
import Reveal from "@/components/site/Reveal";
import { fmt, waLink } from "../lib";
import { IconArrowRight, IconWhatsApp } from "../icons";
import { RevealBlock } from "../motion";
import type { AboutDict } from "../types";

export default function FinalCta({ t, shopHref, whatsapp, threshold }: { t: AboutDict["cta"]; shopHref: string; whatsapp: string; threshold: string }) {
  return (
    <section className="relative isolate flex min-h-[92svh] items-center overflow-hidden py-24" aria-labelledby="cta-title">
      <WaveBackground intensity={0.9} focus={[0.5, 0.42]} className="absolute inset-0 -z-10" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_60%_at_50%_45%,transparent,rgba(5,4,7,.85))]" />
      <div className="container-site text-center">
        <RevealBlock scale={0.92} y={16}>
          <Logo className="mx-auto w-[clamp(8rem,18vw,13rem)] text-white drop-shadow-[0_0_40px_rgba(70,28,247,.6)]" title="ONDE" />
          <p className="eyebrow mt-5 tracking-[0.5em]">{t.eyebrow}</p>
        </RevealBlock>
        <h2 id="cta-title" className="mt-10 text-display text-[clamp(3rem,10vw,9.5rem)]">
          <Reveal as="span" type="chars" className="block">
            {t.titleA}
          </Reveal>
          <Reveal as="span" type="chars" delay={0.18} className="block text-violet-3 text-glow">
            {t.titleB}
          </Reveal>
        </h2>
        <RevealBlock as="p" delay={0.2} className="mx-auto mt-8 max-w-xl text-lg text-muted md:text-xl">
          {fmt(t.body, { threshold })}
        </RevealBlock>
        <RevealBlock delay={0.3} className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <MagneticButton href={shopHref} size="lg" icon={<IconArrowRight size={20} />}>
            {t.shop}
          </MagneticButton>
          <MagneticButton href={waLink(whatsapp, t.waMessage)} target="_blank" rel="noopener noreferrer" variant="whatsapp" size="lg" icon={<IconWhatsApp size={20} />} iconPosition="start">
            {t.whatsapp}
          </MagneticButton>
        </RevealBlock>
      </div>
    </section>
  );
}
