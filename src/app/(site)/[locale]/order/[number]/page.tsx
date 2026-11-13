import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { formatDT } from "@/lib/business";
import { getOrder } from "@/server/orders";
import { getCustomer } from "@/server/customers";
import { getPublicSettings } from "@/server/settings";
import { fmt, getShopMessages, type ShopMessages } from "@/components/shop/messages";
import { normalizeShopSettings } from "@/components/shop/rules";
import { BTN_GHOST, CONTAINER, EYEBROW } from "@/components/shop/ui";
import FadeIn from "@/components/shop/FadeIn";
import OrderCelebration from "@/components/shop/OrderCelebration";
import SplitHeading from "@/components/shop/SplitHeading";
import WhatsAppOrderButton from "@/components/shop/WhatsAppOrderButton";
import { ArrowRightIcon, CheckIcon, GiftIcon, PhoneIcon } from "@/components/shop/Icons";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string; number: string }> };

const STEPS = ["new", "confirmed", "preparing", "shipped", "delivered"] as const;

function parseNumber(raw: string): string | null {
  let v = raw;
  try {
    v = decodeURIComponent(raw);
  } catch {
    return null;
  }
  v = v.trim().toUpperCase();
  return /^OND-\d{1,9}$/.test(v) ? v : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, number } = await params;
  if (!isLocale(locale)) return {};
  const t = getShopMessages(locale);
  const num = parseNumber(number) ?? "";
  return { title: { absolute: fmt(t.meta.orderTitle, { number: num }) }, robots: { index: false, follow: false } };
}

export default async function OrderPage({ params }: Props) {
  const { locale, number } = await params;
  if (!isLocale(locale)) notFound();
  const num = parseNumber(number);
  if (!num) notFound();

  // Existence check first: nothing has streamed yet, so an unknown order answers a real HTTP 404 (+ noindex).
  const data = await getOrder(num);
  if (!data) notFound();
  const [dict, rawSettings] = await Promise.all([getDictionary(locale), getPublicSettings()]);
  const { order, items, customer } = data;

  const t = (dict.shop ?? getShopMessages(locale)) as ShopMessages;
  const settings = normalizeShopSettings(rawSettings);
  const money = (m: number) => formatDT(m, locale);
  const cancelled = order.status === "cancelled";
  const stepIndex = cancelled ? -1 : STEPS.indexOf(order.status as (typeof STEPS)[number]);
  const discountPct = order.discount > 0 && order.subtotal > 0 ? Math.round((order.discount / order.subtotal) * 100) : 0;

  // "Next order −X %" teaser only when this customer can still earn the one-time returning discount.
  let showBonus = false;
  if (!cancelled && order.discount === 0 && settings.rules.returningDiscountPct > 0 && !customer.discountAvailable) {
    const history = await getCustomer(customer.id);
    showBonus = !!history && !history.orders.some((o) => o.discount > 0 && o.status !== "cancelled");
  }

  const followUp = fmt(t.whatsapp.followUp, { number: order.number, total: money(order.total) });

  return (
    <main className="relative isolate overflow-hidden pb-32 pt-28 md:pt-36">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[80vh] bg-[radial-gradient(45%_55%_at_50%_15%,rgba(70,28,247,0.3),transparent_70%)]"
      />
      <div className={CONTAINER}>
        {/* hero */}
        <section className="mx-auto max-w-3xl text-center">
          <OrderCelebration
            number={order.number}
            labels={{ number: t.order.number, copy: t.order.copy, copied: t.order.copied }}
          />
          <FadeIn delay={0.5}>
            <p className={clsx(EYEBROW, "mt-10")}>{t.order.eyebrow}</p>
          </FadeIn>
          <SplitHeading
            as="h1"
            delay={0.55}
            lines={[{ text: t.order.title }]}
            className="mt-4 font-display text-[clamp(2.6rem,7vw,5.5rem)] font-extrabold leading-[0.95] tracking-[-0.045em]"
          />
        </section>

        {/* we call you */}
        <FadeIn delay={0.8} className="mx-auto mt-12 max-w-3xl">
          <div className="relative overflow-hidden rounded-[28px] border border-violet-2/30 bg-gradient-to-br from-violet/20 via-panel/70 to-panel/60 p-6 sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <span className="relative grid size-14 shrink-0 place-items-center rounded-full bg-violet text-white shadow-[0_0_40px_rgba(70,28,247,0.7)]">
                <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-violet/40 motion-reduce:hidden" />
                <PhoneIcon size={24} className="relative" />
              </span>
              <div>
                <h2 className="font-display text-xl font-bold tracking-[-0.02em] sm:text-2xl">{t.order.callTitle}</h2>
                <p className="mt-2 text-sm leading-relaxed text-text/75 sm:text-base">{t.order.callBody}</p>
              </div>
            </div>
          </div>
        </FadeIn>

        <div className="mx-auto mt-8 grid max-w-3xl gap-6">
          {/* status */}
          <FadeIn inView as="section" className="rounded-[28px] border border-white/[0.08] bg-panel/50 p-6 sm:p-8">
            <h2 className="font-display text-lg font-bold">{t.order.statusTitle}</h2>
            {cancelled ? (
              <div className="mt-5 rounded-2xl border border-off/30 bg-off/10 px-5 py-4 text-sm">
                <p className="font-semibold text-[#ff9aa6]">{t.order.status.cancelled}</p>
                <p className="mt-1 text-text/75">{t.order.cancelledNote}</p>
              </div>
            ) : (
              <ol className="mt-6 grid grid-cols-5 gap-1.5" aria-label={t.order.statusTitle}>
                {STEPS.map((s, i) => {
                  const done = i <= stepIndex;
                  const current = i === stepIndex;
                  return (
                    <li key={s} aria-current={current ? "step" : undefined} className="flex flex-col gap-3">
                      <span
                        className={clsx(
                          "h-1.5 rounded-full transition-colors",
                          done ? "bg-gradient-to-r from-violet to-violet-2" : "bg-white/[0.08]",
                          current && "shadow-[0_0_16px_rgba(123,92,255,0.8)]",
                        )}
                      />
                      <span className="flex items-center gap-1.5 text-[11px] font-medium leading-tight sm:text-xs">
                        {done && (
                          <span className="hidden size-4 shrink-0 place-items-center rounded-full bg-violet text-white sm:grid">
                            <CheckIcon size={10} strokeWidth={3} />
                          </span>
                        )}
                        <span className={done ? "text-text" : "text-muted"}>{t.order.status[s]}</span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </FadeIn>

          {/* summary */}
          <FadeIn inView as="section" className="rounded-[28px] border border-white/[0.08] bg-panel/50 p-6 sm:p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg font-bold">{t.order.summaryTitle}</h2>
              <p className="text-sm text-muted">{fmt(t.order.deliveryTo, { city: order.city })}</p>
            </div>
            <ul className="mt-5 divide-y divide-white/[0.07]">
              {items.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-4 py-3.5 text-sm">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid h-7 min-w-7 place-items-center rounded-full bg-white/[0.06] px-2 text-xs font-bold tabular-nums">
                      {it.qty}×
                    </span>
                    <span className="truncate font-medium">{it.productName}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">{money(it.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-2 border-t border-white/[0.07] pt-4 text-sm">
              <div className="flex justify-between text-muted">
                <dt>{t.summary.subtotal}</dt>
                <dd className="text-text">{money(order.subtotal)}</dd>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between font-medium text-violet-3">
                  <dt>{fmt(t.summary.discount, { pct: discountPct })}</dt>
                  <dd>−{money(order.discount)}</dd>
                </div>
              )}
              <div className="flex justify-between text-muted">
                <dt>{t.summary.delivery}</dt>
                <dd className={order.deliveryFee === 0 ? "font-medium text-ok" : "text-text"}>
                  {order.deliveryFee === 0 ? t.summary.free : money(order.deliveryFee)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-white/[0.07] pt-3">
                <dt className="font-display text-lg font-semibold">{t.summary.total}</dt>
                <dd className="font-display text-3xl font-bold tracking-[-0.03em]">{money(order.total)}</dd>
              </div>
              <p className="text-right text-xs text-muted">{t.order.payment}</p>
            </dl>
          </FadeIn>

          {showBonus && (
            <FadeIn inView className="flex items-center gap-4 rounded-[28px] border border-gold/25 bg-gold/[0.07] p-5 text-sm sm:p-6">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gold/15 text-gold">
                <GiftIcon size={22} />
              </span>
              <p className="text-text/85">{fmt(t.order.nextDiscount, { pct: settings.rules.returningDiscountPct })}</p>
            </FadeIn>
          )}

          {/* actions */}
          <FadeIn inView className="mt-2 grid gap-3 sm:grid-cols-2">
            <WhatsAppOrderButton
              locale={locale}
              settings={settings}
              message={followUp}
              label={t.order.whatsapp}
              variant="solid"
              className="h-14 text-base"
            />
            <Link href={`/${locale}/shop`} className={clsx(BTN_GHOST, "group/cont h-14 px-6 text-base")}>
              {t.order.continue}
              <ArrowRightIcon size={18} className="transition-transform duration-300 group-hover/cont:translate-x-1" />
            </Link>
          </FadeIn>
        </div>
      </div>
    </main>
  );
}
