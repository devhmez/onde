"use client";
// Catalog card: 3D tilt + moving glare on hover (mouse only), floating still with violet pool of light,
// price + compare-at strike, quick add (fly-to-cart from the product image).
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import Link from "next/link";
import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import clsx from "clsx";
import { formatDT } from "@/lib/business";
import type { Locale } from "@/i18n/config";
import { savingsPct, type ShopProduct } from "./catalog";
import { fmt, getShopMessages } from "./messages";
import SaleCountdown from "./SaleCountdown";
import AddToCartButton from "./AddToCartButton";
import ProductImage from "./ProductImage";

type Props = { product: ShopProduct; locale: Locale; priority?: boolean; className?: string };

export default function ProductCard({ product, locale, priority, className }: Props) {
  const t = getShopMessages(locale);
  const reduce = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLDivElement>(null);

  const rx = useSpring(0, { stiffness: 180, damping: 18, mass: 0.5 });
  const ry = useSpring(0, { stiffness: 180, damping: 18, mass: 0.5 });
  const gx = useMotionValue(50);
  const gy = useMotionValue(30);
  const glareOpacity = useSpring(0, { stiffness: 160, damping: 22 });
  const glare = useMotionTemplate`radial-gradient(520px circle at ${gx}% ${gy}%, rgba(255,255,255,0.16), rgba(140,123,255,0.10) 28%, transparent 58%)`;
  const lift = useSpring(0, { stiffness: 200, damping: 20 });
  const imgY = useTransform(lift, (v) => v * -14);
  const imgScale = useTransform(lift, (v) => 1 + v * 0.05);
  const shadowScale = useTransform(lift, (v) => 1 - v * 0.18);

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType !== "mouse" || !cardRef.current) return;
    const r = cardRef.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    ry.set((px - 0.5) * 14);
    rx.set((0.5 - py) * 11);
    gx.set(px * 100);
    gy.set(py * 100);
    glareOpacity.set(1);
    lift.set(1);
  };
  const onLeave = () => {
    rx.set(0);
    ry.set(0);
    glareOpacity.set(0);
    lift.set(0);
  };

  const save = savingsPct(product.price, product.compareAt);
  const href = `/${locale}/shop/${product.slug}`;

  return (
    <div className={clsx("[perspective:1100px]", className)}>
      <motion.div
        ref={cardRef}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}
        className={clsx(
          "group/card relative flex h-full flex-col rounded-[28px] border border-white/[0.08] bg-gradient-to-b from-panel-2 to-ink-2 p-5 sm:p-6",
          "shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] transition-[border-color,box-shadow] duration-500",
          "hover:border-violet-2/35 hover:shadow-[0_40px_100px_-40px_rgba(70,28,247,0.55)]",
          "has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-4 has-[a:focus-visible]:outline-violet-2",
        )}
      >
        {/* glare */}
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] mix-blend-screen"
          style={{ background: glare, opacity: glareOpacity }}
        />
        {/* top meta */}
        <div className="relative z-10 flex items-center justify-between gap-2" style={{ transform: "translateZ(30px)" }}>
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-3">{t.kinds[product.kind]}</span>
          {save && (
            <span className="rounded-full bg-gold/15 px-2.5 py-1 text-[11px] font-bold text-gold ring-1 ring-gold/30">
              {fmt(t.card.save, { pct: save })}
            </span>
          )}
        </div>

        {/* stage (duplicate link hidden from assistive tech: the title link below is the accessible one). The image keeps
            the product name as alt text for image search and as anchor text for crawlers. */}
        <Link
          href={href}
          tabIndex={-1}
          aria-hidden="true"
          className="relative mx-auto my-4 block aspect-square w-full max-w-[320px]"
          style={{ transform: "translateZ(60px)" }}
        >
          <div
            className="absolute inset-x-[12%] bottom-[6%] h-[22%] rounded-[50%] bg-violet/45 opacity-70 blur-2xl transition-opacity duration-500 group-hover/card:opacity-100"
          />
          <motion.div
            className="absolute inset-x-[22%] bottom-[7%] h-[6%] rounded-[50%] bg-black/70 blur-md"
            style={{ scaleX: shadowScale }}
          />
          <motion.div ref={imgRef} className="absolute inset-0" style={{ y: imgY, scale: imgScale }}>
            <ProductImage
              src={product.image}
              alt={product.name}
              fill
              sizes="(min-width: 1024px) 320px, (min-width: 640px) 45vw, 80vw"
              className="object-contain drop-shadow-[0_24px_30px_rgba(0,0,0,0.55)]"
              preload={priority}
            />
          </motion.div>
        </Link>

        {/* copy */}
        <div className="relative z-10 mt-auto" style={{ transform: "translateZ(40px)" }}>
          <h3 className="font-display text-xl font-bold leading-tight tracking-[-0.02em] sm:text-[22px]">
            <Link href={href} className="outline-none transition-colors hover:text-white">
              {product.name}
            </Link>
          </h3>
          {product.tagline && <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">{product.tagline}</p>}
          <div className="mt-5 flex items-end justify-between gap-3">
            <div className="flex flex-col">
              {product.compareAt && product.compareAt > product.price && (
                <span className="text-sm text-muted line-through decoration-off/70">
                  <span className="sr-only">{fmt(t.card.was, { price: formatDT(product.compareAt, locale) })}</span>
                  <span aria-hidden="true">{formatDT(product.compareAt, locale)}</span>
                </span>
              )}
              <span className="font-display text-2xl font-bold tracking-[-0.02em]">{formatDT(product.price, locale)}</span>
              {product.saleEndsAt ? (
                <SaleCountdown endsAt={product.saleEndsAt} label={t.card.promo} locale={locale} compact className="mt-2 w-fit" />
              ) : null}
            </div>
            <div className="relative z-10">
              <AddToCartButton
                product={product}
                locale={locale}
                label={t.card.add}
                ariaLabel={fmt(t.card.addAria, { name: product.name })}
                size="sm"
                icon="plus"
                flyFrom={() => imgRef.current}
              />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
