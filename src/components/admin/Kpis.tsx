"use client";
// The film's four KPI cards (Products sold · Active products · NFC taps · 30 days · Customers) with count-ups.
import type { ReactNode } from "react";
import { CountUp, FadeUp } from "./motion";

export type Kpis = {
  productsSold: number;
  productsSoldWeek: number;
  activeProducts: number;
  activePct: number;
  taps30d: number;
  tapsDeltaPct: number;
  customers: number;
  customersWeek: number;
  revenueMonth: number;
  ordersNew: number;
  /** Stock links (made in advance, not sold) — not part of "Products sold". */
  inStock: number;
};

export function KpiCard({
  label,
  value,
  format = "int",
  delta,
  tone = "up",
  delay = 0,
}: {
  label: string;
  value: number;
  format?: "int" | "money" | "pct";
  delta: ReactNode;
  tone?: "up" | "down" | "flat";
  delay?: number;
}) {
  return (
    <FadeUp className="k" delay={delay}>
      <span>{label}</span>
      <b>
        <CountUp value={value} format={format} />
      </b>
      <em className={tone === "down" ? "neg" : tone === "flat" ? "flat" : undefined}>{delta}</em>
    </FadeUp>
  );
}

const nf = new Intl.NumberFormat("en-US");
const signed = (n: number) => (n > 0 ? `+${nf.format(n)}` : nf.format(n));

export default function KpiGrid({ k }: { k: Kpis }) {
  // activePct is 0–100 (one decimal) from the stats layer.
  const pct = k.activePct;
  const pctText = `${pct.toFixed(1).replace(/\.0$/, "")}% live`;
  const tapsTone = k.tapsDeltaPct > 0 ? "up" : k.tapsDeltaPct < 0 ? "down" : "flat";
  const tapsDelta = `${k.tapsDeltaPct > 0 ? "+" : k.tapsDeltaPct < 0 ? "−" : "±"}${Math.abs(k.tapsDeltaPct).toFixed(Number.isInteger(k.tapsDeltaPct) ? 0 : 1)}% vs last month`;
  return (
    <section className="kpis" aria-label="Key figures">
      <KpiCard
        label="Products sold"
        value={k.productsSold}
        delta={`${signed(k.productsSoldWeek)} this week${k.inStock ? ` · ${nf.format(k.inStock)} in stock` : ""}`}
        tone={k.productsSoldWeek > 0 ? "up" : "flat"}
      />
      <KpiCard label="Active products" value={k.activeProducts} delta={pctText} tone={k.productsSold === 0 ? "flat" : "up"} delay={0.05} />
      <KpiCard label="NFC taps · 30 days" value={k.taps30d} delta={tapsDelta} tone={tapsTone} delay={0.1} />
      <KpiCard label="Customers" value={k.customers} delta={`${signed(k.customersWeek)} this week`} tone={k.customersWeek > 0 ? "up" : "flat"} delay={0.15} />
    </section>
  );
}
