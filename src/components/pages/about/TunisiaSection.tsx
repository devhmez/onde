// "Designed, made and supported in Tunisia": pillars + the 24 governorates lighting up in a wave.
import Section, { Eyebrow } from "@/components/site/Section";
import Reveal from "@/components/site/Reveal";
import GovernorateWave from "./GovernorateWave";
import { GOVERNORATES } from "@/lib/business";
import { fmt } from "../lib";
import { RevealBlock, Tilt } from "../motion";
import { IconCash, IconHeadset, IconLock, IconTruck } from "../icons";
import type { AboutDict } from "../types";

const PILLAR_ICONS = [IconHeadset, IconCash, IconTruck, IconLock];

export default function TunisiaSection({ t, threshold }: { t: AboutDict["tunisia"]; threshold: string }) {
  return (
    <Section spacing="lg" bleed className="overflow-hidden" aria-labelledby="tn-title">
      <div className="container-site">
        <div className="grid gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-20">
          <div>
            <Eyebrow>{t.eyebrow}</Eyebrow>
            <h2 id="tn-title" className="mt-5 text-display text-[clamp(2.2rem,5.4vw,5rem)]">
              <Reveal as="span" type="words" className="block">
                {t.titleA}
              </Reveal>
              <Reveal as="span" type="words" delay={0.12} className="block text-violet-3">
                {t.titleB}
              </Reveal>
            </h2>
            <Reveal as="p" type="lines" className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              {t.body}
            </Reveal>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {t.pillars.map((p, i) => {
              const Icon = PILLAR_ICONS[i] ?? IconHeadset;
              return (
                <RevealBlock as="li" key={p.title} delay={i * 0.08} className="h-full">
                  <Tilt className="h-full rounded-3xl" max={6}>
                    <div className="h-full rounded-3xl border border-white/[0.07] bg-panel/70 p-6 backdrop-blur">
                      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-violet/15 text-violet-3 ring-1 ring-violet/30">
                        <Icon size={22} />
                      </span>
                      <h3 className="mt-5 font-display text-xl font-bold tracking-tight">{p.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted">{fmt(p.body, { threshold })}</p>
                    </div>
                  </Tilt>
                </RevealBlock>
              );
            })}
          </ul>
        </div>
        <p className="mt-[clamp(3rem,7vw,6rem)] eyebrow">{t.marquee}</p>
      </div>
      <div className="mt-8">
        <GovernorateWave names={GOVERNORATES} label={t.marquee} />
      </div>
    </Section>
  );
}
