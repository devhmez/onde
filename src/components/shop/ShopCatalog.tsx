"use client";
// Category pills (shared-layout highlight) + product grid with animated layout transitions; ?cat= kept in the URL.
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import clsx from "clsx";
import type { Locale } from "@/i18n/config";
import { PRODUCT_KIND_ORDER, type ProductKind, type ShopProduct } from "./catalog";
import { fmt, getShopMessages } from "./messages";
import ProductCard from "./ProductCard";

type Category = "all" | ProductKind;
type Props = { products: ShopProduct[]; locale: Locale; initialCategory?: string };

export default function ShopCatalog({ products, locale, initialCategory }: Props) {
  const t = getShopMessages(locale);
  const reduce = useReducedMotion();
  const kinds = PRODUCT_KIND_ORDER.filter((k) => products.some((p) => p.kind === k));
  const categories: Category[] = ["all", ...kinds];
  const initial = categories.find((c) => c === initialCategory) ?? "all";
  const [category, setCategory] = useState<Category>(initial);
  const visible = category === "all" ? products : products.filter((p) => p.kind === category);

  const select = (c: Category) => {
    setCategory(c);
    try {
      const url = new URL(window.location.href);
      if (c === "all") url.searchParams.delete("cat");
      else url.searchParams.set("cat", c);
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {
      /* URL sync is a convenience only */
    }
  };

  const countOf = (c: Category) => (c === "all" ? products.length : products.filter((p) => p.kind === c).length);

  return (
    <div>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <LayoutGroup id="shop-filters">
          <div
            role="group"
            aria-label={t.filters.label}
            className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"
          >
            {categories.map((c) => {
              const active = c === category;
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={active}
                  onClick={() => select(c)}
                  className={clsx(
                    "relative isolate inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors duration-300",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-2",
                    active ? "text-white" : "text-muted hover:text-text",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="shop-pill"
                      aria-hidden="true"
                      className="absolute inset-0 -z-10 rounded-full bg-violet shadow-[0_10px_30px_-10px_rgba(70,28,247,0.9),inset_0_1px_0_rgba(255,255,255,0.2)]"
                      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
                    />
                  )}
                  {!active && (
                    <span aria-hidden="true" className="absolute inset-0 -z-10 rounded-full border border-white/[0.09] bg-white/[0.03]" />
                  )}
                  {t.filters[c]}
                  <span
                    className={clsx(
                      "grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] tabular-nums",
                      active ? "bg-white/20 text-white" : "bg-white/[0.06] text-muted",
                    )}
                  >
                    {countOf(c)}
                  </span>
                </button>
              );
            })}
          </div>
        </LayoutGroup>
        <p className="shrink-0 text-sm text-muted" aria-live="polite">
          {visible.length === 1 ? t.filters.countOne : fmt(t.filters.count, { count: visible.length })}
        </p>
      </div>

      <motion.ul layout={!reduce} className="relative mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
        <AnimatePresence mode="popLayout" initial={false}>
          {visible.map((p, i) => (
            <motion.li
              key={p.id}
              layout={!reduce}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 48, scale: 0.96 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, margin: "0px 0px -8% 0px" }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, filter: "blur(6px)", transition: { duration: 0.25 } }}
              transition={{ duration: 0.8, delay: (i % 3) * 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="h-full"
            >
              <ProductCard product={p} locale={locale} priority={i < 3} />
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>

      {visible.length === 0 && <p className="mt-12 text-center text-muted">{t.filters.empty}</p>}
    </div>
  );
}
