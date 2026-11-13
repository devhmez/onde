// Analytics: one range filter (30 / 90 days) above everything; taps, NFC vs QR, devices, traffic, revenue, conversion.
import type { Metadata } from "next";
import Link from "next/link";
import { AreaChart, BarChart, Donut, SplitBar } from "@/components/admin/charts";
import { ClickRow } from "@/components/admin/controls";
import { fmtInt, fmtMoney, fmtSeriesDate } from "@/components/admin/format";
import { KpiCard } from "@/components/admin/Kpis";
import { KIND_LABEL, standHref } from "@/components/admin/meta";
import { FadeUp } from "@/components/admin/motion";
import { Dest, EmptyState, PageHeader, SrTable } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { getDeviceSplit, getRevenueSeries, getSourceSplit, getTapSeries, getTopTags, getTraffic } from "@/server/stats";
import { oneOf, type SearchParams } from "../../_lib/data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Analytics" };

const RANGES = ["30", "90"] as const;

export default async function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const range = oneOf(sp.range, RANGES) ?? "30";
  const days = Number(range);

  const [taps, source, devices, top, traffic, revenue] = await Promise.all([
    getTapSeries(days),
    getSourceSplit(days),
    getDeviceSplit(days),
    getTopTags(10),
    getTraffic(days),
    getRevenueSeries(days),
  ]);

  const labels = taps.map((p) => fmtSeriesDate(p.date));
  const tapsTotal = taps.reduce((s, p) => s + p.taps, 0);
  const views = traffic.reduce((s, p) => s + p.views, 0);
  const visitors = traffic.reduce((s, p) => s + p.visitors, 0);
  const orders = revenue.reduce((s, p) => s + p.orders, 0);
  const revenueTotal = revenue.reduce((s, p) => s + p.revenue, 0);
  const conversion = visitors > 0 ? (orders / visitors) * 100 : 0;
  const deviceTotal = devices.ios + devices.android + devices.desktop + devices.other;

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Taps on every chip, visits on the site, and what turns into orders."
        actions={
          <nav className="seg" aria-label="Date range">
            {RANGES.map((r) => (
              <Link key={r} href={r === "30" ? "/admin/analytics" : `/admin/analytics?range=${r}`} className={range === r ? "on" : undefined} aria-current={range === r ? "true" : undefined}>
                Last {r} days
              </Link>
            ))}
          </nav>
        }
      />

      <section className="kpis" aria-label={`Totals, last ${days} days`}>
        <KpiCard label={`Taps · ${days} days`} value={tapsTotal} delta={`${fmtInt(source.qr)} via QR`} tone="flat" />
        <KpiCard label="Site visits" value={visitors} delta={`${fmtInt(views)} page views`} tone="flat" delay={0.05} />
        <KpiCard label={`Orders · ${days} days`} value={orders} delta={`${fmtMoney(revenueTotal)} revenue`} tone={orders > 0 ? "up" : "flat"} delay={0.1} />
        <KpiCard label="Conversion" value={conversion} format="pct" delta="orders ÷ site visits" tone="flat" delay={0.15} />
      </section>

      <div className="grid stretch">
        <FadeUp className="card" delay={0.1}>
          <h3>Taps per day</h3>
          <div className="sub">NFC + QR, last {days} days.</div>
          <AreaChart
            labels={labels}
            series={[{ key: "taps", label: "taps", color: "#8C74FF", values: taps.map((p) => p.taps) }]}
            ariaLabel={`Taps per day, last ${days} days`}
            emptyText="No taps in this period yet."
            height={220}
            showAxis
          />
          <SrTable caption="Taps per day" head={["Date", "Taps"]} rows={taps.map((p) => [p.date, p.taps])} />
        </FadeUp>
        <div className="stack">
          <FadeUp className="card" delay={0.16}>
            <h3>NFC vs QR</h3>
            <div className="sub">How people open the smart links.</div>
            <SplitBar
              ariaLabel="Taps by source"
              items={[
                { label: "NFC tap", value: source.nfc, color: "var(--s1)" },
                { label: "QR scan", value: source.qr, color: "var(--s2)" },
              ]}
            />
          </FadeUp>
          <FadeUp className="card" delay={0.22}>
            <h3>Devices</h3>
            <div className="sub">{deviceTotal ? "Phones that tapped, by platform." : "Appears with the first taps."}</div>
            <Donut
              unit="taps"
              ariaLabel="Taps by device"
              items={[
                { label: "iPhone", value: devices.ios, color: "var(--s1)" },
                { label: "Android", value: devices.android, color: "var(--s2)" },
                { label: "Desktop", value: devices.desktop, color: "var(--s3)" },
                { label: "Other", value: devices.other, color: "var(--s4)" },
              ]}
            />
          </FadeUp>
        </div>
      </div>

      <div className="grid2">
        <FadeUp className="card" delay={0.12}>
          <div className="card-h">
            <div>
              <h3>Site traffic</h3>
              <div className="sub">Page views and daily unique visitors (no cookies, no personal data).</div>
            </div>
            <div className="legend" aria-hidden>
              <span>
                <i style={{ background: "var(--s1)" }} />
                Page views
              </span>
              <span>
                <i className="line" style={{ background: "var(--s2)" }} />
                Visitors
              </span>
            </div>
          </div>
          <AreaChart
            labels={traffic.map((p) => fmtSeriesDate(p.date))}
            series={[
              { key: "views", label: "page views", color: "#8C74FF", values: traffic.map((p) => p.views) },
              { key: "visitors", label: "visitors", color: "#1A98BC", values: traffic.map((p) => p.visitors), area: false },
            ]}
            ariaLabel={`Page views and visitors per day, last ${days} days`}
            emptyText="No visits recorded yet."
            showAxis
          />
          <SrTable caption="Site traffic" head={["Date", "Page views", "Visitors"]} rows={traffic.map((p) => [p.date, p.views, p.visitors])} />
        </FadeUp>
        <FadeUp className="card" delay={0.18}>
          <div className="card-h">
            <div>
              <h3>Revenue per day</h3>
              <div className="sub">Non-cancelled orders by order date.</div>
            </div>
            <div className="bigstat" style={{ marginTop: 0, fontSize: 22 }}>
              {fmtMoney(revenueTotal)}
            </div>
          </div>
          <BarChart
            labels={revenue.map((p) => fmtSeriesDate(p.date))}
            values={revenue.map((p) => p.revenue)}
            format="money"
            ariaLabel={`Revenue per day, last ${days} days`}
            seriesLabel="revenue"
            emptyText="No sales in this period yet."
          />
          <SrTable caption="Revenue per day" head={["Date", "Revenue (millimes)", "Orders"]} rows={revenue.map((p) => [p.date, p.revenue, p.orders])} />
        </FadeUp>
      </div>

      <FadeUp className="card mt16" delay={0.2}>
        <h3>Top smart links</h3>
        <div className="sub">Most tapped over the last 30 days.</div>
        {top.every((t) => t.taps30d === 0) ? (
          <EmptyState title="No taps yet">As soon as customers tap their chips, the busiest links show up here.</EmptyState>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Code</th>
                  <th>Customer</th>
                  <th>Product</th>
                  <th>Destination</th>
                  <th className="num">30 days</th>
                  <th className="num">All-time</th>
                </tr>
              </thead>
              <tbody>
                {top
                  .filter((t) => t.taps30d > 0)
                  .map((t, i) => (
                    <ClickRow key={t.id} href={standHref(t.code)}>
                      <td className="muted">{i + 1}</td>
                      <td className="code">
                        <Link className="rowlink" href={standHref(t.code)}>
                          {t.code}
                        </Link>
                      </td>
                      <td className="clip">{t.customerName ?? <span className="muted">Unassigned</span>}</td>
                      <td>{KIND_LABEL[t.kind]}</td>
                      <td>
                        <Dest type={t.destinationType} url={t.destinationUrl} />
                      </td>
                      <td className="num">{fmtInt(t.taps30d)}</td>
                      <td className="num muted">{fmtInt(t.tapCount)}</td>
                    </ClickRow>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </FadeUp>
    </>
  );
}
