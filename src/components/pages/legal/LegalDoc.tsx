// Shared renderer for /legal/terms, /legal/privacy and /legal/notice: hero with doc switcher, reading time, scroll-spy
// TOC, numbered sections (placeholders filled from live business rules + contact/legal settings), contact box,
// print-friendly. A block or list line whose placeholders resolve to nothing (optional setting left empty) is skipped.
import type { CSSProperties } from "react";
import Link from "next/link";
import clsx from "clsx";
import type { Locale } from "@/i18n/config";
import { Eyebrow } from "@/components/site/Section";
import MagneticButton from "@/components/site/MagneticButton";
import { LightPool } from "../Ambient";
import { CharRise } from "../motion";
import { fmt, waLink } from "../lib";
import { IconCheck, IconWhatsApp } from "../icons";
import type { LegalBlock, LegalDict, LegalDocDict, LegalKind } from "../types";
import { LegalToc, PrintButton, ReadingProgress } from "./LegalChrome";

type Props = {
  locale: Locale;
  kind: LegalKind;
  doc: LegalDocDict;
  common: LegalDict["common"];
  vars: Record<string, string | number>;
  whatsapp: string;
};

const blockText = (b: LegalBlock) => (typeof b === "string" ? b : b.list.join(" "));

export default function LegalDoc({ locale, kind, doc, common, vars, whatsapp }: Props) {
  const f = (s: string) => fmt(s, vars);
  const sections = doc.sections.map((s) => ({
    ...s,
    blocks: s.blocks
      .map((b): LegalBlock => (typeof b === "string" ? f(b) : { list: b.list.map(f).filter((li) => li.trim()) }))
      .filter((b) => (typeof b === "string" ? b.trim() : b.list.length)),
  }));
  const words = sections.reduce((n, s) => n + s.title.split(/\s+/).length + s.blocks.reduce((m, b) => m + blockText(b).split(/\s+/).length, 0), doc.intro.split(/\s+/).length);
  const minutes = Math.max(1, Math.round(words / 200));
  const tabs = (["terms", "privacy", "notice"] as const).map((k) => ({ kind: k, href: `/${locale}/legal/${k}`, label: common.nav[k] }));

  return (
    <>
      <ReadingProgress />

      <header className="relative overflow-x-clip pb-12 pt-[clamp(7.5rem,13vw,10rem)]">
        <LightPool className="left-[-20vw] top-[-30%] h-[80vh] w-[80vw]" opacity={0.22} />
        <div className="container-site relative">
          <nav aria-label={common.nav.label} className="op-noprint op-fade-up flex flex-wrap gap-2" style={{ "--d": "60ms" } as CSSProperties}>
            {tabs.map((tab) => (
              <Link
                key={tab.kind}
                href={tab.href}
                aria-current={tab.kind === kind ? "page" : undefined}
                className={clsx(
                  "rounded-full px-4 py-2 text-sm font-medium ring-1 ring-inset transition duration-300",
                  tab.kind === kind ? "bg-violet text-white ring-violet" : "text-muted ring-line hover:text-white hover:ring-violet/50",
                )}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
          <p className="op-fade-up mt-10" style={{ "--d": "120ms" } as CSSProperties}>
            <Eyebrow as="span">{common.eyebrow}</Eyebrow>
          </p>
          <h1 className="mt-4 max-w-5xl text-display text-[clamp(2.6rem,7vw,6.2rem)]">
            <CharRise text={doc.title} delayMs={160} />
          </h1>
          <div className="op-fade-up mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted" style={{ "--d": "500ms" } as CSSProperties}>
            <span>{fmt(common.updated, { date: common.updatedDate })}</span>
            <span aria-hidden className="h-1 w-1 rounded-full bg-line" />
            <span>{fmt(common.readingTime, { min: minutes })}</span>
            <span className="ml-auto">
              <PrintButton label={common.print} />
            </span>
          </div>
          <p className="op-fade-up mt-8 max-w-3xl text-lg leading-relaxed text-text/85 md:text-xl" style={{ "--d": "620ms" } as CSSProperties}>
            {f(doc.intro)}
          </p>
          {doc.highlights?.length ? (
            <ul className="op-fade-up mt-8 flex flex-wrap gap-2" style={{ "--d": "720ms" } as CSSProperties}>
              {doc.highlights.map((h) => (
                <li key={h} className="inline-flex items-center gap-2 rounded-full border border-ok/30 bg-ok/10 px-3.5 py-1.5 text-sm font-medium text-ok">
                  <IconCheck size={14} /> {f(h)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </header>

      <div className="container-site pb-[clamp(4rem,10vw,8rem)]">
        <div className="grid gap-10 lg:grid-cols-[17rem_1fr] lg:gap-16">
          <aside>
            <LegalToc items={sections.map((s) => ({ id: s.id, title: f(s.title) }))} title={common.toc} />
          </aside>
          <article className="op-prose max-w-3xl">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} tabIndex={-1} aria-labelledby={`${s.id}-h`} className="scroll-mt-28 border-t border-line py-10 outline-none first:border-t-0 first:pt-0">
                <h2 id={`${s.id}-h`} className="flex items-baseline gap-4 font-display text-2xl font-bold tracking-tight text-white md:text-3xl">
                  <span className="font-mono text-sm font-normal text-violet-3">{String(i + 1).padStart(2, "0")}</span>
                  {f(s.title)}
                </h2>
                <div className="mt-5 space-y-4 text-base leading-[1.75] text-text/80 md:text-[1.05rem]">
                  {s.blocks.map((b, bi) =>
                    typeof b === "string" ? (
                      <p key={bi}>{b}</p>
                    ) : (
                      <ul key={bi} className="space-y-2.5 pl-1">
                        {b.list.map((li) => (
                          <li key={li} className="flex gap-3">
                            <span aria-hidden className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full bg-violet-2" />
                            <span>{li}</span>
                          </li>
                        ))}
                      </ul>
                    ),
                  )}
                </div>
              </section>
            ))}

            <aside className="op-noprint mt-6 flex flex-col items-start gap-6 rounded-[28px] border border-white/[0.07] bg-gradient-to-br from-panel to-violet/15 p-7 md:flex-row md:items-center md:justify-between md:p-8">
              <div>
                <p className="font-display text-xl font-bold tracking-tight text-white">{common.contactTitle}</p>
                <p className="mt-1 text-muted">{common.contactBody}</p>
              </div>
              <MagneticButton href={waLink(whatsapp, common.waMessage)} target="_blank" rel="noopener noreferrer" variant="whatsapp" icon={<IconWhatsApp size={18} />} iconPosition="start">
                {common.whatsapp}
              </MagneticButton>
            </aside>
          </article>
        </div>
      </div>
    </>
  );
}
