// Compact product links for guide pages (server component: no cart logic, no client JS). Live names and prices.
import Image from "next/image";
import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { formatDT } from "@/lib/business";
import type { ShopProduct } from "@/components/shop/catalog";
import { getShopMessages } from "@/components/shop/messages";
import { IconArrowRight } from "../icons";

export default function ProductTiles({ products, locale, label }: { products: ShopProduct[]; locale: Locale; label: string }) {
  if (!products.length) return null;
  const kinds = getShopMessages(locale).kinds;
  return (
    <ul aria-label={label} className="grid gap-3 pt-2 sm:grid-cols-3">
      {products.map((p) => (
        <li key={p.slug}>
          <Link
            href={`/${locale}/shop/${p.slug}`}
            className="group flex h-full flex-col rounded-[24px] border border-white/[0.08] bg-gradient-to-b from-panel-2 to-ink-2 p-4 transition-[border-color,box-shadow] duration-500 hover:border-violet-2/35 hover:shadow-[0_30px_80px_-40px_rgba(70,28,247,0.6)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-2"
          >
            <span className="relative mx-auto block aspect-square w-full max-w-[180px]">
              <span aria-hidden="true" className="absolute inset-x-[14%] bottom-[8%] h-[20%] rounded-[50%] bg-violet/40 opacity-70 blur-2xl" />
              <Image
                src={p.image}
                alt={p.name}
                fill
                sizes="(min-width: 640px) 180px, 60vw"
                unoptimized={/^https?:\/\//i.test(p.image)}
                className="object-contain drop-shadow-[0_18px_24px_rgba(0,0,0,0.5)] transition-transform duration-700 ease-expo group-hover:-translate-y-1"
              />
            </span>
            <span className="mt-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-3">{kinds[p.kind]}</span>
            <span className="mt-1 font-display text-lg font-bold leading-tight tracking-[-0.02em] text-text">{p.name}</span>
            <span className="mt-auto flex items-end justify-between gap-3 pt-3">
              <span className="flex flex-col">
                {p.compareAt && p.compareAt > p.price ? (
                  <span className="text-xs text-muted line-through decoration-off/70">{formatDT(p.compareAt, locale)}</span>
                ) : null}
                <span className="font-display text-xl font-bold tracking-[-0.02em] text-text">{formatDT(p.price, locale)}</span>
              </span>
              <span aria-hidden="true" className="grid size-9 place-items-center rounded-full border border-white/15 text-text/80 transition-colors group-hover:border-violet-2 group-hover:bg-violet group-hover:text-white">
                <IconArrowRight size={16} />
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
