"use client";
// Slide-over cart (mounted once in the site layout; opens on cart.open()). Backdrop blur, animated line items with
// qty steppers, remove via × or swipe-left, free-delivery progress with burst, totals, Checkout + WhatsApp, empty state.
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { cart, cartCount, useCart, type CartItem } from "@/lib/cart";
import { formatDT, priceOrder } from "@/lib/business";
import { fmt, resolveShopMessages, shopLocale, type ShopMessages } from "./messages";
import { useShopSettings } from "./useShopSettings";
import AnimatedPrice from "./AnimatedPrice";
import FreeDeliveryBar from "./FreeDeliveryBar";
import QtyStepper from "./QtyStepper";
import WhatsAppOrderButton from "./WhatsAppOrderButton";
import ProductImage from "./ProductImage";
import { ArrowRightIcon, BagIcon, CloseIcon } from "./Icons";
import type { Locale } from "@/i18n/config";

type Props = { locale: Locale | string; dict?: unknown };

const lineKey = (i: CartItem) => `${i.productId}|${i.businessName ?? ""}|${i.destinationUrl ?? ""}`;

function hostOf(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function CartDrawer({ locale: rawLocale, dict }: Props) {
  const locale = shopLocale(rawLocale);
  const t = resolveShopMessages(dict, locale);
  const { items, open } = useCart();
  const settings = useShopSettings();
  const reduce = useReducedMotion();
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const count = cartCount({ items, open });
  const priced = priceOrder(items, { rules: settings.rules });

  // Page scroll is locked by the site's <SmoothScroll/> while cart.open is true (Lenis + html.scroll-locked).

  // Close when navigating to another page.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    if (cart.get().open) cart.open(false);
  }, [pathname]);

  // Focus management: focus the close button on open, trap Tab, Escape closes, restore focus on close.
  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const raf = requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cart.open(false);
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      const el = returnFocus.current;
      if (el && document.contains(el)) el.focus({ preventScroll: true });
    };
  }, [open]);

  const close = () => cart.open(false);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90]" key="cart-drawer">
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 bg-ink/55 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            onClick={close}
          />
          <motion.div
            ref={panelRef}
            id="onde-cart-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="onde-cart-title"
            data-lenis-prevent
            className="absolute inset-y-0 right-0 flex w-full max-w-[460px] flex-col overflow-hidden border-l border-white/[0.08] bg-ink-2/95 shadow-[-40px_0_120px_-20px_rgba(0,0,0,0.9)] backdrop-blur-2xl sm:rounded-l-[28px]"
            initial={reduce ? { opacity: 0 } : { x: "100%" }}
            animate={reduce ? { opacity: 1 } : { x: 0 }}
            exit={reduce ? { opacity: 0 } : { x: "100%" }}
            transition={reduce ? { duration: 0.2 } : { type: "spring", stiffness: 300, damping: 34, mass: 0.9 }}
          >
            {/* ambient light */}
            <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-32 size-80 rounded-full bg-violet/25 blur-[90px]" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -left-20 size-72 rounded-full bg-violet-2/10 blur-[90px]" />

            <header className="relative flex items-center justify-between gap-4 px-6 pb-4 pt-6">
              <div className="flex items-baseline gap-3">
                <h2 id="onde-cart-title" className="font-display text-2xl font-bold tracking-[-0.03em]">
                  {t.drawer.title}
                </h2>
                {count > 0 && (
                  <span className="text-sm text-muted">
                    {count === 1 ? t.summary.itemsOne : fmt(t.summary.items, { count })}
                  </span>
                )}
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                aria-label={t.drawer.close}
                className="grid size-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-text transition-[background-color,transform] duration-300 hover:rotate-90 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-violet-2"
              >
                <CloseIcon size={18} />
              </button>
            </header>

            {items.length === 0 ? (
              <EmptyState t={t} locale={locale} onNavigate={close} />
            ) : (
              <>
                <div className="relative px-6 pb-4">
                  <FreeDeliveryBar
                    subtotal={priced.subtotal}
                    threshold={settings.rules.freeDeliveryThreshold}
                    locale={locale}
                    t={t.freeDelivery}
                  />
                </div>
                <p className="sr-only">{t.drawer.swipeHint}</p>
                <ul
                  data-lenis-prevent
                  className="relative flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-4 pb-4 [scrollbar-width:thin]"
                >
                  <AnimatePresence initial={false}>
                    {items.map((item, index) => (
                      <Line key={lineKey(item)} item={item} index={index} t={t} locale={locale} reduce={!!reduce} />
                    ))}
                  </AnimatePresence>
                </ul>
                <footer className="relative border-t border-white/[0.07] bg-ink/40 px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between text-muted">
                      <dt>{t.summary.subtotal}</dt>
                      <dd className="text-text">
                        <AnimatedPrice value={priced.subtotal} locale={locale} />
                      </dd>
                    </div>
                    <div className="flex justify-between text-muted">
                      <dt>{t.summary.delivery}</dt>
                      <dd className={priced.deliveryFee === 0 ? "font-medium text-ok" : "text-text"}>
                        {priced.deliveryFee === 0 ? t.summary.free : formatDT(priced.deliveryFee, locale)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between pt-2">
                      <dt className="font-display text-lg font-semibold">{t.summary.total}</dt>
                      <dd className="font-display text-2xl font-bold tracking-[-0.02em]">
                        <AnimatedPrice value={priced.total} locale={locale} />
                      </dd>
                    </div>
                  </dl>
                  {settings.rules.returningDiscountPct > 0 && (
                    <p className="mt-2 text-xs leading-relaxed text-violet-3">
                      {fmt(t.drawer.returningHint, { pct: settings.rules.returningDiscountPct })}
                    </p>
                  )}
                  <div className="mt-4 grid gap-2.5">
                    <Link
                      href={`/${locale}/checkout`}
                      onClick={close}
                      className="group/co relative inline-flex h-14 items-center justify-center gap-2 overflow-hidden rounded-full bg-violet font-semibold text-white shadow-[0_14px_44px_-14px_rgba(70,28,247,0.95),inset_0_1px_0_rgba(255,255,255,0.22)] transition-colors hover:bg-[#5530ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-2"
                    >
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-expo group-hover/co:translate-x-[420%]"
                      />
                      {t.drawer.checkout}
                      <ArrowRightIcon size={18} className="transition-transform duration-300 group-hover/co:translate-x-1" />
                    </Link>
                    <WhatsAppOrderButton locale={locale} items={items} className="h-12" />
                  </div>
                  <p className="mt-3 text-center text-xs text-muted">{t.drawer.reassurance}</p>
                </footer>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function Line({
  item,
  index,
  t,
  locale,
  reduce,
}: {
  item: CartItem;
  index: number;
  t: ShopMessages;
  locale: Locale;
  reduce: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const onDragEnd = (_: unknown, info: PanInfo) => {
    setDragging(false);
    if (info.offset.x < -110 || info.velocity.x < -650) cart.remove(index);
  };
  const remove = fmt(t.drawer.remove, { name: item.name });

  return (
    <motion.li
      layout={!reduce}
      initial={reduce ? { opacity: 0 } : { opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: -80, height: 0, marginTop: 0, transition: { duration: 0.3 } }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
      className="relative overflow-hidden rounded-2xl"
    >
      {/* swipe-to-remove backdrop */}
      <div
        aria-hidden="true"
        className={clsx(
          "absolute inset-0 flex items-center justify-end rounded-2xl bg-off/90 pr-6 text-sm font-semibold text-white transition-opacity",
          dragging ? "opacity-100" : "opacity-0",
        )}
      >
        {t.drawer.removeLabel}
      </div>
      <motion.div
        drag={reduce ? false : "x"}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.55, right: 0.04 }}
        onDragStart={() => setDragging(true)}
        onDragEnd={onDragEnd}
        style={{ touchAction: "pan-y" }}
        className="relative flex gap-3 rounded-2xl border border-white/[0.07] bg-panel/95 p-3"
      >
        <div className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-[radial-gradient(circle_at_50%_70%,rgba(123,92,255,0.28),transparent_70%)]">
          <ProductImage src={item.image} alt="" width={80} height={80} className="size-[72px] object-contain" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate pr-1 text-[15px] font-semibold leading-tight">{item.name}</p>
            <button
              type="button"
              onClick={() => cart.remove(index)}
              aria-label={remove}
              className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-white/10 hover:text-text focus-visible:outline-2 focus-visible:outline-violet-2"
            >
              <CloseIcon size={15} />
            </button>
          </div>
          <p className="mt-0.5 text-xs text-muted">{fmt(t.summary.each, { price: formatDT(item.unitPrice, locale) })}</p>
          {item.businessName && (
            <p className="mt-1 truncate text-xs text-violet-3">{fmt(t.drawer.business, { value: item.businessName })}</p>
          )}
          {item.destinationUrl && (
            <p className="truncate text-xs text-violet-3/80">{fmt(t.drawer.link, { value: hostOf(item.destinationUrl) })}</p>
          )}
          <div className="mt-auto flex items-end justify-between gap-2 pt-2">
            <QtyStepper
              size="sm"
              value={item.qty}
              onChange={(q) => cart.setQty(index, q)}
              labels={{ decrease: t.product.decrease, increase: t.product.increase, qty: t.product.qty }}
            />
            <span className="font-display text-base font-semibold tabular-nums">
              <AnimatedPrice value={item.unitPrice * item.qty} locale={locale} />
            </span>
          </div>
        </div>
      </motion.div>
    </motion.li>
  );
}

function EmptyState({ t, locale, onNavigate }: { t: ShopMessages; locale: Locale; onNavigate: () => void }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center px-8 pb-16 text-center">
      <div className="relative mb-8 grid size-36 place-items-center">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            aria-hidden="true"
            className="absolute inset-0 rounded-full border border-violet-2/40"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={reduce ? { scale: 0.6 + i * 0.2, opacity: 0.4 } : { scale: [0.5, 1.25], opacity: [0.7, 0] }}
            transition={reduce ? { duration: 0 } : { duration: 2.6, repeat: Infinity, delay: i * 0.85, ease: "easeOut" }}
          />
        ))}
        <div className="relative grid size-20 place-items-center rounded-full bg-violet/20 text-violet-3 shadow-[0_0_60px_rgba(70,28,247,0.45)]">
          <BagIcon size={34} />
        </div>
      </div>
      <h3 className="font-display text-2xl font-bold tracking-[-0.03em]">{t.drawer.emptyTitle}</h3>
      <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">{t.drawer.emptyBody}</p>
      <Link
        href={`/${locale}/shop`}
        onClick={onNavigate}
        className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-violet px-7 font-semibold text-white shadow-[0_14px_44px_-14px_rgba(70,28,247,0.95)] transition-colors hover:bg-[#5530ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-2"
      >
        {t.drawer.emptyCta}
        <ArrowRightIcon size={18} />
      </Link>
    </div>
  );
}
