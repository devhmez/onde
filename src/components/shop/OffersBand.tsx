"use client";
// The three promises (free delivery ≥ threshold, −X % next order, cash on delivery) as big counting stats
// with a cursor spotlight on each tile.
import { animate, motion, useInView, useMotionTemplate, useMotionValue, useReducedMotion } from "motion/react";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { formatDT } from "@/lib/business";
import type { Locale } from "@/i18n/config";
import { fmt, getShopMessages } from "./messages";
import type { ShopSettings } from "./rules";
import SplitHeading from "./SplitHeading";
import { CashIcon, GiftIcon, TruckIcon } from "./Icons";

type Props = { locale: Locale; settings: ShopSettings };

function CountUp({ from, to, render }: { from: number; to: number; render: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -15% 0px" });
  const reduce = useReducedMotion();
  const draw = useEffectEvent((n: number) => {
    if (ref.current) ref.current.textContent = render(n);
  });
  // Before first paint on the client, show the start value (SSR shows the final one for no-JS and crawlers).
  useLayoutEffect(() => {
    if (!reduce) draw(from);
  }, [reduce, from]);
  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      draw(to);
      return;
    }
    const c = animate(from, to, {
      duration: 1.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => draw(Math.round(v)),
    });
    return () => c.stop();
  }, [inView, from, to, reduce]);
  return (
    <>
      <span ref={ref} aria-hidden="true">
        {render(to)}
      </span>
      <span className="sr-only">{render(to)}</span>
    </>
  );
}

function Tile({ icon, stat, title, body, index }: { icon: ReactNode; stat: ReactNode; title: string; body: string; index: number }) {
  const mx = useMotionValue(-200);
  const my = useMotionValue(-200);
  const spot = useMotionTemplate`radial-gradient(360px circle at ${mx}px ${my}px, rgba(123,92,255,0.18), transparent 65%)`;
  const ring = useMotionTemplate`radial-gradient(260px circle at ${mx}px ${my}px, rgba(140,123,255,0.65), transparent 60%)`;
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set(e.clientX - r.left);
    my.set(e.clientY - r.top);
  };
  return (
    <motion.div
      onPointerMove={onMove}
      onPointerLeave={() => {
        mx.set(-200);
        my.set(-200);
      }}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 0.9, delay: index * 0.1, ease: [0.16, 1, 0.3, 1] }}
      className="group/tile relative isolate overflow-hidden rounded-[28px] bg-panel/70 p-7 sm:p-8"
    >
      {/* border spotlight */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] p-px [mask:linear-gradient(#000_0_0)_content-box_exclude,linear-gradient(#000_0_0)]"
        style={{ background: ring }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] border border-white/[0.07]" />
      <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10" style={{ background: spot }} />
      <div className="grid size-12 place-items-center rounded-2xl bg-violet/15 text-violet-3 ring-1 ring-violet-2/25 transition-transform duration-500 ease-expo group-hover/tile:-rotate-6 group-hover/tile:scale-110">
        {icon}
      </div>
      <p className="mt-8 bg-gradient-to-br from-white via-white to-violet-3 bg-clip-text font-display text-5xl font-extrabold tracking-[-0.04em] text-transparent sm:text-6xl">
        {stat}
      </p>
      <h3 className="mt-3 font-display text-xl font-bold tracking-[-0.02em]">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
    </motion.div>
  );
}

export default function OffersBand({ locale, settings }: Props) {
  const t = getShopMessages(locale);
  const { deliveryFee, freeDeliveryThreshold, returningDiscountPct } = settings.rules;
  const money = (m: number) => formatDT(m, locale);
  const thresholdDT = Math.round(freeDeliveryThreshold / 1000);

  return (
    <section aria-labelledby="shop-offers-title" className="relative">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-violet-3">{t.offers.eyebrow}</p>
      <SplitHeading
        id="shop-offers-title"
        inView
        lines={[{ text: t.offers.title }]}
        className="mt-4 max-w-3xl font-display text-4xl font-extrabold leading-[0.98] tracking-[-0.035em] sm:text-6xl"
      />
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        <Tile
          index={0}
          icon={<TruckIcon size={24} />}
          stat={
            freeDeliveryThreshold % 1000 === 0 ? (
              <CountUp from={0} to={thresholdDT} render={(n) => fmt(t.offers.deliveryStat, { amount: money(n * 1000) })} />
            ) : (
              fmt(t.offers.deliveryStat, { amount: money(freeDeliveryThreshold) })
            )
          }
          title={t.offers.deliveryTitle}
          body={fmt(t.offers.deliveryBody, { amount: money(freeDeliveryThreshold), fee: money(deliveryFee) })}
        />
        {returningDiscountPct > 0 && (
          <Tile
            index={1}
            icon={<GiftIcon size={24} />}
            stat={<CountUp from={0} to={returningDiscountPct} render={(n) => fmt(t.offers.returningStat, { pct: n })} />}
            title={t.offers.returningTitle}
            body={t.offers.returningBody}
          />
        )}
        <Tile
          index={2}
          icon={<CashIcon size={24} />}
          stat={<CountUp from={59} to={0} render={(n) => (n === 0 ? t.offers.codStat : money(n * 1000))} />}
          title={t.offers.codTitle}
          body={t.offers.codBody}
        />
      </div>
    </section>
  );
}
