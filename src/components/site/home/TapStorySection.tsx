"use client";
// 4 · TapStory — the pinned, scroll-scrubbed 3D sequence from the three module, introduced by a site header with
// a product picker. The picker is mirrored by TapStory's own in-stage switcher (controlled via onProductChange),
// so the product can be changed before or during the story. The section is never blank and has its final height
// from the first paint: a server-rendered shell (product still, pinned height) holds the place until TapStory's
// light module arrives right after hydration; its WebGL stage (three.js) is then built off-screen as soon as the
// page settles, so it is ready before the reader gets there (three/TapStoryLazy.tsx, three/schedule.ts).
import Image from "next/image";
import { useState } from "react";
import clsx from "clsx";
import type { Locale } from "@/i18n/config";
import TapStory from "@/components/three/TapStoryLazy";
import { Eyebrow } from "../Section";
import Reveal from "../Reveal";
import { TAP_PRODUCTS, TAP_PRODUCT_IMAGES, type HomeDict, type TapProduct } from "../types";

type Props = {
  locale: Locale;
  labels: HomeDict["tapstory"];
  dict: unknown;
};

export default function TapStorySection({ locale, labels, dict }: Props) {
  const [product, setProduct] = useState<TapProduct>("stand-white");

  return (
    <section id="tap" aria-labelledby="tap-title" className="relative bg-ink">
      <div className="container-site pb-10 pt-[clamp(5rem,12vw,9rem)] md:pb-14">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Eyebrow>{labels.eyebrow}</Eyebrow>
            <Reveal as="h2" type="chars" id="tap-title" className="text-display mt-6 text-[clamp(2.4rem,6.4vw,5.6rem)] leading-[0.95]">
              {labels.title}
            </Reveal>
            <Reveal as="p" type="up" delay={0.1} className="mt-6 max-w-xl text-[1.05rem] leading-relaxed text-muted">
              {labels.sub}
            </Reveal>
          </div>
          <Reveal type="up" delay={0.2} className="min-w-0">
            <div
              role="group"
              aria-label={labels.pick}
              className="no-scrollbar flex w-fit max-w-full items-center gap-1.5 overflow-x-auto rounded-full border border-white/10 bg-panel/70 p-1.5 backdrop-blur-xl"
            >
              {TAP_PRODUCTS.map((p) => {
                const active = p === product;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProduct(p)}
                    aria-pressed={active}
                    className={clsx(
                      "group relative flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3.5 transition-all duration-500 ease-expo",
                      active
                        ? "bg-violet text-white shadow-[0_8px_30px_-8px_rgb(70_28_247/0.9)]"
                        : "text-text/70 hover:bg-white/[0.06] hover:text-text",
                    )}
                  >
                    <span className="relative h-8 w-8 overflow-hidden rounded-full bg-white/[0.06]">
                      <Image
                        src={TAP_PRODUCT_IMAGES[p]}
                        alt=""
                        fill
                        sizes="32px"
                        className="object-contain p-0.5 transition-transform duration-500 ease-expo group-hover:scale-110"
                      />
                    </span>
                    <span className="whitespace-nowrap text-[0.82rem] font-medium">{labels.products[p]}</span>
                  </button>
                );
              })}
            </div>
          </Reveal>
        </div>
      </div>

      <TapStory product={product} locale={locale} dict={dict} switcher onProductChange={setProduct} />
    </section>
  );
}
