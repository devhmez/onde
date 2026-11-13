// 7 · The range — horizontal drag/scroll gallery of the live catalog (server-rendered cards, client rail/tilt).
import Image from "next/image";
import Link from "next/link";
import AddToCartButton from "@/components/shop/AddToCartButton";
import SaleCountdown from "@/components/shop/SaleCountdown";
import { formatDT } from "@/lib/business";
import type { Locale } from "@/i18n/config";
import type { loadProducts } from "../server-data";
import { Eyebrow } from "../Section";
import Reveal from "../Reveal";
import MagneticButton from "../MagneticButton";
import ProductRail from "./ProductRail";
import TiltCard from "./TiltCard";
import { fill, nbsp, productImage, type HomeDict } from "../types";

type Product = Awaited<ReturnType<typeof loadProducts>>[number];

type Props = {
  locale: Locale;
  dict: HomeDict["products"];
  products: Product[];
  whatsappHref: string;
};

export default function Products({ locale, dict, products, whatsappHref }: Props) {
  const fr = locale === "fr";

  return (
    <section id="range" aria-labelledby="range-title" className="relative overflow-hidden bg-ink py-[clamp(5rem,12vw,9rem)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-[20%] top-0 h-[80%] w-[70%]"
        style={{ background: "radial-gradient(closest-side, rgb(70 28 247 / 0.14), transparent)" }}
      />
      <div className="container-site relative flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <Eyebrow>{dict.eyebrow}</Eyebrow>
          <Reveal as="h2" type="chars" id="range-title" className="text-display mt-6 text-[clamp(2.4rem,6.6vw,5.8rem)] leading-[0.95]">
            {dict.title}
          </Reveal>
          <Reveal as="p" type="up" delay={0.1} className="mt-6 max-w-xl text-[1.05rem] leading-relaxed text-muted">
            {dict.sub}
          </Reveal>
        </div>
        <Reveal type="up" delay={0.2} className="shrink-0">
          <MagneticButton
            href={`/${locale}/shop`}
            variant="outline"
            icon={
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
                <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
          >
            {dict.seeAll}
          </MagneticButton>
        </Reveal>
      </div>

      {products.length === 0 ? (
        <div className="container-site relative mt-12">
          <div className="flex flex-col items-start gap-6 rounded-[28px] border border-white/[0.07] bg-panel/60 p-8 md:flex-row md:items-center md:justify-between md:p-10">
            <p className="max-w-xl text-[1.05rem] leading-relaxed text-text/85">{dict.empty}</p>
            <MagneticButton href={whatsappHref} variant="whatsapp">
              {dict.emptyCta}
            </MagneticButton>
          </div>
        </div>
      ) : (
        <div className="relative mt-12 md:mt-16">
          <ProductRail label={dict.title} prevLabel={dict.prev} nextLabel={dict.next} dragLabel={dict.drag}>
            {products.map((p) => {
              const name = fr ? p.nameFr : p.nameEn;
              const tagline = fr ? p.taglineFr : p.taglineEn;
              const image = productImage(p.image, p.slug);
              const saving = p.compareAt && p.compareAt > p.price ? p.compareAt - p.price : 0;
              const kind = dict.kinds[p.kind as keyof typeof dict.kinds] ?? p.kind;
              return (
                <li
                  key={p.id}
                  className="w-[78vw] max-w-[380px] shrink-0 snap-start sm:w-[46vw] lg:w-[29vw] xl:w-[24vw]"
                >
                  <TiltCard className="rounded-[28px]">
                    <article className="group relative flex h-full flex-col overflow-hidden rounded-[28px] border border-white/[0.07] bg-gradient-to-b from-panel-2 to-ink-2 transition-colors duration-500 hover:border-violet-2/40">
                      <div className="relative aspect-[1/1]">
                        <div
                          aria-hidden="true"
                          className="absolute inset-0 opacity-70 transition-opacity duration-700 group-hover:opacity-100"
                          style={{ background: "radial-gradient(60% 55% at 50% 58%, rgb(70 28 247 / 0.32), transparent 72%)" }}
                        />
                        <div
                          aria-hidden="true"
                          className="absolute bottom-[10%] left-1/2 h-[8%] w-[55%] -translate-x-1/2 rounded-[50%] bg-black/60 blur-xl"
                        />
                        <Image
                          src={image}
                          alt={name}
                          fill
                          sizes="(min-width: 1280px) 24vw, (min-width: 1024px) 29vw, (min-width: 640px) 46vw, 78vw"
                          className="object-contain p-[12%] transition-transform duration-700 ease-expo group-hover:-translate-y-2 group-hover:scale-[1.05]"
                          draggable={false}
                        />
                        <span className="absolute left-4 top-4 rounded-full border border-white/10 bg-ink/50 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-text/80 backdrop-blur">
                          {kind}
                        </span>
                        {saving > 0 && (
                          <span className="absolute right-4 top-4 rounded-full bg-ok/15 px-3 py-1 text-[0.72rem] font-bold text-ok">
                            {nbsp(fill(dict.save, { amount: formatDT(saving, locale) }))}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col p-6 pt-2">
                        <h3 className="font-display text-[1.25rem] font-semibold leading-tight tracking-[-0.01em]">
                          <Link
                            href={`/${locale}/shop/${p.slug}`}
                            className="outline-none after:absolute after:inset-0 after:rounded-[28px] after:content-[''] focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-violet-2"
                            draggable={false}
                          >
                            {name}
                          </Link>
                        </h3>
                        {tagline && <p className="mt-2 line-clamp-2 text-[0.92rem] leading-relaxed text-muted">{tagline}</p>}
                        <div className="mt-auto pt-6">
                          {/* launch-promo countdown on its own line, above the price row, so it never squeezes the button;
                              on narrow cards the button wraps under the price instead of breaking its label */}
                          {p.saleEndsAt ? (
                            <SaleCountdown
                              endsAt={p.saleEndsAt}
                              label={dict.promo}
                              locale={locale}
                              compact
                              className="mb-3 w-fit [&>span:last-child]:whitespace-nowrap [&>span:nth-child(2)]:text-balance"
                            />
                          ) : null}
                          <div className="flex flex-wrap items-end justify-between gap-3">
                            <p className="flex flex-col">
                              {saving > 0 && p.compareAt && (
                                <span className="text-[0.82rem] text-muted line-through decoration-off/70">{nbsp(formatDT(p.compareAt, locale))}</span>
                              )}
                              <span className="font-display text-[1.6rem] font-bold leading-none tracking-[-0.02em]">{nbsp(formatDT(p.price, locale))}</span>
                            </p>
                            <div className="relative z-10 shrink-0">
                              <AddToCartButton product={{ ...p, image }} locale={locale} label={dict.add} className="whitespace-nowrap" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </article>
                  </TiltCard>
                </li>
              );
            })}
          </ProductRail>
        </div>
      )}
    </section>
  );
}
