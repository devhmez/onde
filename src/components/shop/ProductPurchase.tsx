"use client";
// Product buy box: price, personalization (business name + link to configure, with Google-review-link helper),
// quantity, magnetic Add to cart, "Commander sur WhatsApp", delivery/payment promises, and a sticky buy bar that
// slides in once the main button has scrolled away.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";
import { formatDT, priceOrder } from "@/lib/business";
import type { Locale } from "@/i18n/config";
import { normalizeLink, savingsPct, type ShopProduct } from "./catalog";
import { fmt, getShopMessages } from "./messages";
import type { ShopSettings } from "./rules";
import { useShopSettings } from "./useShopSettings";
import SaleCountdown from "./SaleCountdown";
import AddToCartButton from "./AddToCartButton";
import AnimatedPrice from "./AnimatedPrice";
import ProductImage from "./ProductImage";
import QtyStepper from "./QtyStepper";
import SplitHeading from "./SplitHeading";
import WhatsAppOrderButton from "./WhatsAppOrderButton";
import { CashIcon, ChevronDownIcon, LinkIcon, PhoneIcon, TruckIcon } from "./Icons";

type Props = {
  product: ShopProduct;
  locale: Locale;
  settings: ShopSettings;
  /** What the product is, in search words ("Plaque avis Google NFC · 12 × 12 cm"): shown above the name, inside the H1. */
  kicker?: string;
  /** Localized link to the "find your Google review link" guide, offered in the link helper. */
  guideHref?: string;
};

const inputCls =
  "w-full rounded-2xl border bg-ink/60 px-4 py-3.5 text-[15px] text-text placeholder:text-muted/70 outline-none transition-[border-color,box-shadow] duration-300 " +
  "focus:border-violet-2 focus:shadow-[0_0_0_4px_rgba(123,92,255,0.18)]";

export default function ProductPurchase({ product, locale, settings: initialSettings, kicker, guideHref }: Props) {
  const t = getShopMessages(locale);
  const settings = useShopSettings(initialSettings);
  const reduce = useReducedMotion();
  const id = useId();
  const [qty, setQty] = useState(1);
  const [business, setBusiness] = useState("");
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState(false);
  const [howTo, setHowTo] = useState(false);
  const [sticky, setSticky] = useState(false);
  const [storyInView, setStoryInView] = useState(false);
  const linkRef = useRef<HTMLInputElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  const normalized = normalizeLink(link);
  const destinationUrl = normalized || undefined;
  const save = savingsPct(product.price, product.compareAt);
  const priced = priceOrder([{ unitPrice: product.price, qty }], { rules: settings.rules });
  const { deliveryFee, freeDeliveryThreshold } = settings.rules;

  const validate = () => {
    if (normalized === null) {
      setLinkError(true);
      linkRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      linkRef.current?.focus({ preventScroll: true });
      return false;
    }
    return true;
  };

  // Sticky buy bar once the main CTA has scrolled above the viewport — tucked away while the TapStory plays.
  useEffect(() => {
    const el = ctaRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setSticky(!e.isIntersecting && e.boundingClientRect.top < 0), {
      threshold: 0,
    });
    io.observe(el);
    const story = document.getElementById("tap-story");
    const io2 = new IntersectionObserver(([e]) => setStoryInView(e.isIntersecting), { rootMargin: "-20% 0px -20% 0px" });
    if (story) io2.observe(story);
    return () => {
      io.disconnect();
      io2.disconnect();
    };
  }, []);

  const waLine = [{ name: product.name, qty, unitPrice: product.price, businessName: business, destinationUrl: destinationUrl ?? "" }];

  const perks = [
    {
      icon: <TruckIcon size={18} />,
      text: priced.freeDelivery
        ? t.product.perkFree
        : fmt(t.product.perkDelivery, { fee: formatDT(deliveryFee, locale), threshold: formatDT(freeDeliveryThreshold, locale) }),
      ok: priced.freeDelivery,
    },
    { icon: <CashIcon size={18} />, text: t.product.perkCod, ok: false },
    { icon: <PhoneIcon size={18} />, text: t.product.perkCall, ok: false },
    { icon: <LinkIcon size={18} />, text: t.product.perkLink, ok: false },
  ];

  return (
    <div className="flex flex-col">
      <SplitHeading
        as="h1"
        delay={0.05}
        kicker={kicker || t.kinds[product.kind]}
        kickerClassName="mb-4 font-sans text-[0.72rem] font-semibold uppercase leading-tight tracking-[0.32em] text-violet-3"
        lines={[{ text: product.name }]}
        className="font-display text-[clamp(2.4rem,5vw,4.2rem)] font-extrabold leading-[0.98] tracking-[-0.04em]"
      />
      {product.tagline && (
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="mt-4 max-w-lg text-lg leading-relaxed text-text/75"
        >
          {product.tagline}
        </motion.p>
      )}

      {/* price */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="mt-7 flex flex-wrap items-end gap-x-4 gap-y-2"
      >
        <p className="font-display text-5xl font-bold tracking-[-0.035em]">
          <span className="sr-only">{t.product.unitPrice}: </span>
          {formatDT(product.price, locale)}
        </p>
        {product.compareAt && product.compareAt > product.price && (
          <p className="pb-1.5 text-lg text-muted line-through decoration-off/70">
            <span className="sr-only">{fmt(t.card.was, { price: formatDT(product.compareAt, locale) })}</span>
            <span aria-hidden="true">{formatDT(product.compareAt, locale)}</span>
          </p>
        )}
        {save && (
          <span className="mb-2 rounded-full bg-gold/15 px-3 py-1 text-xs font-bold text-gold ring-1 ring-gold/30">
            {fmt(t.card.save, { pct: save })}
          </span>
        )}
        {product.saleEndsAt ? (
          <SaleCountdown endsAt={product.saleEndsAt} label={t.card.promo} locale={locale} className="basis-full sm:basis-auto" />
        ) : null}
      </motion.div>

      {/* personalization */}
      <motion.fieldset
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="mt-9 rounded-[28px] border border-white/[0.08] bg-panel/50 p-5 sm:p-6"
      >
        <legend className="sr-only">{t.product.personalizeTitle}</legend>
        <div className="flex items-baseline justify-between gap-4">
          <p aria-hidden="true" className="font-display text-lg font-semibold">
            {t.product.personalizeTitle}
          </p>
        </div>
        <p className="mt-1 text-sm text-muted">{t.product.personalizeSubtitle}</p>

        <div className="mt-5 grid gap-4">
          <div>
            <label htmlFor={`${id}-biz`} className="mb-1.5 block text-sm font-medium">
              {t.product.business}
            </label>
            <input
              id={`${id}-biz`}
              value={business}
              onChange={(e) => setBusiness(e.target.value)}
              maxLength={120}
              autoComplete="organization"
              placeholder={t.product.businessPlaceholder}
              aria-describedby={`${id}-biz-help`}
              className={clsx(inputCls, "border-white/10")}
            />
            <p id={`${id}-biz-help`} className="mt-1.5 text-xs text-muted">
              {t.product.businessHelp}
            </p>
          </div>
          <div>
            <label htmlFor={`${id}-link`} className="mb-1.5 block text-sm font-medium">
              {t.product.link}
            </label>
            <div className="relative">
              <LinkIcon size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
              <input
                ref={linkRef}
                id={`${id}-link`}
                type="url"
                inputMode="url"
                value={link}
                onChange={(e) => {
                  setLink(e.target.value);
                  if (linkError && normalizeLink(e.target.value) !== null) setLinkError(false);
                }}
                onBlur={() => setLinkError(normalizeLink(link) === null)}
                maxLength={2000}
                autoComplete="url"
                spellCheck={false}
                placeholder={t.product.linkPlaceholder}
                aria-invalid={linkError || undefined}
                aria-describedby={`${id}-link-help${linkError ? ` ${id}-link-err` : ""}`}
                className={clsx(
                  inputCls,
                  "pl-11",
                  linkError ? "border-off focus:border-off focus:shadow-[0_0_0_4px_rgba(240,89,106,0.18)]" : "border-white/10",
                )}
              />
            </div>
            <AnimatePresence initial={false}>
              {linkError && (
                <motion.p
                  id={`${id}-link-err`}
                  role="alert"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-1.5 overflow-hidden text-xs font-medium text-off"
                >
                  {t.product.linkInvalid}
                </motion.p>
              )}
            </AnimatePresence>
            <p id={`${id}-link-help`} className="mt-1.5 text-xs text-muted">
              {t.product.linkHelp}
            </p>
            <button
              type="button"
              onClick={() => setHowTo((v) => !v)}
              aria-expanded={howTo}
              aria-controls={`${id}-howto`}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-violet-3 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-2"
            >
              {t.product.howTo}
              <ChevronDownIcon size={16} className={clsx("transition-transform duration-300", howTo && "rotate-180")} />
            </button>
            <AnimatePresence initial={false}>
              {howTo && (
                <motion.div
                  id={`${id}-howto`}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <ol className="mt-3 space-y-2.5 rounded-2xl border border-violet-2/20 bg-violet/[0.06] p-4 text-sm leading-relaxed text-text/85">
                    {t.product.howToSteps.map((s, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-violet text-xs font-bold text-white">
                          {i + 1}
                        </span>
                        <span>{s}</span>
                      </li>
                    ))}
                    <li className="pl-9 text-xs text-muted">{t.product.howToNote}</li>
                    {guideHref && (
                      <li className="pl-9">
                        <Link
                          href={guideHref}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-3 underline decoration-violet-3/40 underline-offset-4 transition-colors hover:text-white"
                        >
                          {t.product.howToGuide}
                        </Link>
                      </li>
                    )}
                  </ol>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.fieldset>

      {/* buy */}
      <motion.div
        ref={ctaRef}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.65, ease: [0.16, 1, 0.3, 1] }}
        className="mt-6"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <QtyStepper
            value={qty}
            onChange={setQty}
            labels={{ decrease: t.product.decrease, increase: t.product.increase, qty: t.product.qty }}
            className="self-start sm:self-auto"
          />
          <AddToCartButton
            product={product}
            locale={locale}
            label={t.add.label}
            qty={qty}
            businessName={business}
            destinationUrl={destinationUrl}
            beforeAdd={validate}
            flyFrom={() => document.getElementById("product-stage")}
            size="lg"
            className="w-full sm:flex-1"
          />
        </div>
        <AnimatePresence initial={false}>
          {qty > 1 && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden pt-3 text-sm text-muted"
            >
              {fmt(t.product.totalFor, { qty })}{" "}
              <AnimatedPrice value={product.price * qty} locale={locale} className="font-semibold text-text" />
            </motion.p>
          )}
        </AnimatePresence>
        <WhatsAppOrderButton
          locale={locale}
          settings={initialSettings}
          items={waLine}
          className="mt-3 h-14 w-full text-base"
        />
      </motion.div>

      {/* promises */}
      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {perks.map((p) => (
          <li key={p.text} className="flex items-start gap-3 text-sm leading-snug">
            <span
              className={clsx(
                "grid size-8 shrink-0 place-items-center rounded-full",
                p.ok ? "bg-ok/15 text-ok" : "bg-white/[0.05] text-violet-3",
              )}
            >
              {p.icon}
            </span>
            <span className={clsx("pt-1.5", p.ok ? "text-ok" : "text-text/85")}>{p.text}</span>
          </li>
        ))}
      </ul>

      {/* sticky buy bar */}
      <AnimatePresence>
        {sticky && !storyInView && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { y: 120, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto max-w-xl"
          >
            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-ink-2/85 p-2 pl-2.5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl">
              <div className="relative grid size-11 shrink-0 place-items-center rounded-full bg-white/[0.05]">
                <ProductImage src={product.image} alt="" width={40} height={40} className="size-9 object-contain" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{product.name}</p>
                <p className="text-xs text-muted">
                  {qty > 1 ? `${qty} × ${formatDT(product.price, locale)}` : formatDT(product.price, locale)}
                </p>
              </div>
              <AddToCartButton
                product={product}
                locale={locale}
                label={t.product.stickyAdd}
                qty={qty}
                businessName={business}
                destinationUrl={destinationUrl}
                beforeAdd={validate}
                size="md"
                className="shrink-0"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
