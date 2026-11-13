// "What if it took one tap?" — Tap. Review. Grow. Each step has a tiny looping scene (CSS only, paused
// off-screen, final frame under reduced motion), then "Every phone. Every time." (NFC + QR).
import type { CSSProperties } from "react";
import Section, { Eyebrow } from "@/components/site/Section";
import Reveal from "@/components/site/Reveal";
import Logo from "@/components/site/Logo";
import { InViewPlay, RevealBlock, Tilt } from "../motion";
import { IconGoogle, IconNfc, IconQr, IconStar } from "../icons";
import type { AboutDict } from "../types";

export default function HowSection({ t }: { t: AboutDict["how"] }) {
  const illos = [
    <TapScene key="tap" banner={t.banner} bannerSub={t.bannerSub} label={t.illoTap} />,
    <ReviewScene key="review" post={t.post} label={t.illoReview} />,
    <GrowScene key="grow" label={t.illoGrow} />,
  ];
  return (
    <Section spacing="lg" aria-labelledby="how-title">
      <Eyebrow>{t.eyebrow}</Eyebrow>
      <h2 id="how-title" className="mt-5 text-display text-[clamp(2.6rem,7.5vw,7rem)]">
        <Reveal as="span" type="chars" className="block">
          {t.titleA}
        </Reveal>
        <Reveal as="span" type="chars" delay={0.15} className="block text-violet-3 text-glow">
          {t.titleB}
        </Reveal>
      </h2>

      <ol className="mt-[clamp(3rem,7vw,6rem)] grid gap-5 lg:grid-cols-3">
        {t.steps.map((s, i) => (
          <RevealBlock as="li" key={s.n} delay={i * 0.12} className="h-full">
            <Tilt className="h-full rounded-[28px]" max={5}>
              <article className="flex h-full flex-col overflow-hidden rounded-[28px] border border-white/[0.07] bg-panel/70 backdrop-blur-md">
                <InViewPlay className="relative aspect-[4/3] overflow-hidden border-b border-white/[0.06] bg-[radial-gradient(80%_70%_at_50%_100%,rgba(70,28,247,.32),transparent_70%)]">
                  {illos[i]}
                </InViewPlay>
                <div className="p-7 md:p-8">
                  <p className="font-sans text-5xl font-extralight tracking-tight text-violet-3">{s.n}</p>
                  <h3 className="mt-3 text-display text-4xl md:text-5xl">{s.title}</h3>
                  <p className="mt-4 text-base leading-relaxed text-muted">{s.body}</p>
                </div>
              </article>
            </Tilt>
          </RevealBlock>
        ))}
      </ol>

      <RevealBlock className="mt-5">
        <div className="relative grid items-center gap-8 overflow-hidden rounded-[28px] border border-white/[0.07] bg-gradient-to-br from-panel/80 via-ink-2/80 to-violet/20 p-7 md:grid-cols-[1.2fr_1fr] md:p-10">
          <div>
            <h3 className="text-display text-[clamp(1.8rem,3.4vw,3rem)]">{t.phonesTitle}</h3>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">{t.phonesBody}</p>
            <p className="mt-5 text-sm font-semibold text-violet-3">{t.noApp}</p>
          </div>
          <div className="flex items-center justify-center gap-6 sm:gap-10">
            <div className="flex flex-col items-center gap-3">
              <span className="relative grid h-24 w-24 place-items-center rounded-full border border-violet/40 bg-violet/10 text-violet-3">
                <span aria-hidden className="pulse-ring absolute inset-0 rounded-full border border-violet-2/60" />
                <span aria-hidden className="pulse-ring absolute inset-0 rounded-full border border-violet-2/40 [animation-delay:1.2s]" />
                <IconNfc size={38} />
              </span>
              <span className="text-sm font-semibold">{t.nfc}</span>
            </div>
            <span aria-hidden className="h-16 w-px bg-line" />
            <div className="flex flex-col items-center gap-3">
              <span className="grid h-24 w-24 place-items-center rounded-2xl bg-white text-ink shadow-[0_0_50px_-10px_rgba(255,255,255,.35)]">
                <IconQr size={46} />
              </span>
              <span className="text-sm font-semibold">{t.qr}</span>
            </div>
          </div>
        </div>
      </RevealBlock>
    </Section>
  );
}

/* ------------------------------------------------------------------ scenes */

function TapScene({ banner, bannerSub, label }: { banner: string; bannerSub: string; label: string }) {
  return (
    <div role="img" aria-label={label} className="absolute inset-0">
      {/* stand — the real 12 × 12 cm one: white print on a square clear acrylic panel, L base hidden behind it */}
      <div className="absolute left-[12%] top-[26%] h-[60%] w-[45%] rounded-[14px] border border-white/50 bg-white/[0.08] p-[2.5%] shadow-[0_30px_60px_-20px_rgba(0,0,0,.8)]">
        <div className="flex h-full flex-col items-center justify-start gap-[5%] rounded-[10px] bg-gradient-to-b from-white to-[#e7e6ee] pt-[9%] text-ink">
          <Logo className="w-[56%]" />
          <div className="flex gap-[3px] text-gold">
            {Array.from({ length: 5 }, (_, i) => (
              <IconStar key={i} size={10} />
            ))}
          </div>
          <div className="grid aspect-square w-[30%] grid-cols-4 grid-rows-4 gap-[2px] rounded-[4px] bg-white p-[3px]">
            {Array.from({ length: 16 }, (_, i) => (
              <span key={i} className={(i * 7) % 3 === 0 ? "rounded-[1px] bg-ink" : "rounded-[1px] bg-ink/15"} />
            ))}
          </div>
          <span className="grid aspect-square w-[13%] place-items-center rounded-full border border-ink/35 text-ink/70">
            <IconNfc size={10} />
          </span>
        </div>
        {/* the clear bend / base edge under the panel */}
        <span className="absolute -bottom-[4%] left-[2%] right-[2%] h-[5%] rounded-b-[12px] border-x border-b border-white/30 bg-gradient-to-b from-white/[0.03] to-white/20" />
      </div>
      {/* NFC rings at the contact point */}
      <div className="absolute left-[50%] top-[70%] h-0 w-0">
        {[0, 0.18, 0.36].map((d) => (
          <span
            key={d}
            className="op-loop absolute left-0 top-0 h-28 w-28 rounded-full border-2 border-violet-2 opacity-0 shadow-[0_0_24px_rgba(123,92,255,.6)]"
            style={{ animation: `op-tap-ring 4.2s cubic-bezier(.2,.6,.3,1) ${d}s infinite`, transform: "translate(-50%,-50%) scale(.15)" } as CSSProperties}
          />
        ))}
      </div>
      {/* phone */}
      <div className="op-loop absolute left-[48%] top-[12%] h-[80%] w-[30%] origin-bottom-left" style={{ animation: "op-tap-phone 4.2s cubic-bezier(.16,1,.3,1) infinite" }}>
        <div className="relative h-full w-full rounded-[20px] border-[3px] border-[#3a3946] bg-[#0f0e15] p-[5px] shadow-[0_30px_60px_-15px_rgba(0,0,0,.9)]">
          <span className="absolute left-1/2 top-[3%] h-[4%] w-[30%] -translate-x-1/2 rounded-full bg-black" />
          <div className="relative h-full w-full overflow-hidden rounded-[14px] bg-gradient-to-b from-[#1b1830] to-[#0b0a10]">
            <div className="op-loop absolute inset-x-[5%] top-[9%] flex items-center gap-1.5 rounded-[10px] bg-white/90 px-2 py-1.5 text-ink shadow-lg" style={{ animation: "op-tap-banner 4.2s cubic-bezier(.16,1,.3,1) infinite" }}>
              <span className="grid h-4 w-4 shrink-0 place-items-center rounded-[4px] bg-violet text-white">
                <IconNfc size={10} />
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[8px] font-semibold">{banner}</span>
                <span className="block text-[7px] text-ink/60">{bannerSub}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewScene({ post, label }: { post: string; label: string }) {
  return (
    <div role="img" aria-label={label} className="absolute inset-0 grid place-items-center">
      <div className="op-float relative h-[86%] w-[44%] rounded-[22px] border-[3px] border-[#3a3946] bg-[#0f0e15] p-[5px] shadow-[0_30px_60px_-15px_rgba(0,0,0,.9)]">
        <div className="flex h-full w-full flex-col items-center overflow-hidden rounded-[16px] bg-white px-[9%] pt-[12%] text-ink">
          <IconGoogle size={22} />
          <div className="mt-[10%] flex gap-[6%] self-stretch justify-center">
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} className="op-loop text-gold" style={{ animation: `op-star 5s cubic-bezier(.16,1,.3,1) ${i * 0.16}s infinite` }}>
                <IconStar size={17} />
              </span>
            ))}
          </div>
          <div className="mt-[12%] w-full space-y-[6px] rounded-lg border border-ink/10 p-2">
            <span className="op-loop block h-[5px] w-full origin-left rounded-full bg-ink/25" style={{ animation: "op-type 5s cubic-bezier(.16,1,.3,1) infinite" }} />
            <span className="op-loop block h-[5px] w-[70%] origin-left rounded-full bg-ink/25" style={{ animation: "op-type 5s cubic-bezier(.16,1,.3,1) .25s infinite" }} />
          </div>
          <span className="op-loop mt-auto mb-[10%] w-full rounded-full bg-google py-1.5 text-center text-[10px] font-semibold text-white" style={{ animation: "op-post 5s steps(1) infinite" }}>
            {post}
          </span>
        </div>
      </div>
    </div>
  );
}

function GrowScene({ label }: { label: string }) {
  const rows = [0.92, 0.78, 0.84, 0.7];
  return (
    <div role="img" aria-label={label} className="absolute inset-0 grid place-items-center">
      <div className="relative w-[74%] rounded-2xl border border-white/10 bg-ink-2/80 p-3 shadow-[0_30px_60px_-20px_rgba(0,0,0,.9)] backdrop-blur">
        <div className="mb-2 h-6 rounded-full bg-white/[0.06]" />
        <div className="relative">
          {rows.map((w, i) => (
            <div key={i} className="flex h-10 items-center gap-2 border-b border-white/[0.05] px-2 last:border-0">
              <span className="w-3 font-mono text-[10px] text-muted">{i + 1}</span>
              <span className="h-[6px] rounded-full bg-white/15" style={{ width: `${w * 45}%` }} />
              <span className="ml-auto flex gap-[2px] text-white/20">
                {Array.from({ length: 4 }, (_, k) => (
                  <IconStar key={k} size={8} />
                ))}
              </span>
            </div>
          ))}
          {/* the business climbing */}
          <div className="op-loop absolute inset-x-0 top-0 flex h-10 items-center gap-2 rounded-xl border border-violet-2 bg-violet/25 px-2 shadow-[0_0_30px_rgba(70,28,247,.6)]" style={{ animation: "op-climb 5.5s cubic-bezier(.16,1,.3,1) infinite" }}>
            <span className="w-3 font-mono text-[10px] text-white">★</span>
            <span className="h-[6px] w-[48%] rounded-full bg-white/80" />
            <span className="ml-auto flex gap-[2px] text-gold">
              {Array.from({ length: 5 }, (_, k) => (
                <IconStar key={k} size={8} />
              ))}
            </span>
            <span className="op-loop absolute -right-3 -top-3 grid h-7 w-7 place-items-center rounded-full bg-ok text-[10px] font-bold text-ink shadow-lg" style={{ animation: "op-rank 5.5s cubic-bezier(.16,1,.3,1) infinite" }}>
              #1
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
