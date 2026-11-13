// Overview: the film's KPI row + taps curve, revenue vs the monthly goal, new orders, recent orders, top smart links.
import type { Metadata } from "next";
import Link from "next/link";
import { AreaChart, BarChart } from "@/components/admin/charts";
import { ClickRow } from "@/components/admin/controls";
import { displayLink, fmtInt, fmtMoney, fmtSeriesDate, timeAgo } from "@/components/admin/format";
import KpiGrid from "@/components/admin/Kpis";
import { KIND_LABEL, standHref } from "@/components/admin/meta";
import { CountUp, FadeUp } from "@/components/admin/motion";
import PendingRequestsNotice from "@/components/admin/portal/PendingRequestsNotice";
import { EmptyState, OrderStatusPill, PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { listOrders } from "@/server/orders";
import { getKpis, getRevenueSeries, getTapSeries, getTopTags } from "@/server/stats";
import { smartLink } from "@/server/tags";
import { siteUrl } from "../_lib/data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Overview" };

/** The business target: ~4,000 DT of sales per month (millimes). */
const MONTHLY_GOAL = 4_000_000;

export default async function OverviewPage() {
  await requireAdmin();
  const [kpis, taps, revenue, recent, top] = await Promise.all([
    getKpis(),
    getTapSeries(30),
    getRevenueSeries(30),
    listOrders({ limit: 6 }),
    getTopTags(5),
  ]);
  const tapsTotal = taps.reduce((s, p) => s + p.taps, 0);
  const goalPct = Math.min(100, Math.round((kpis.revenueMonth / MONTHLY_GOAL) * 100));
  const topMax = Math.max(1, ...top.map((t) => t.taps30d));

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="Sales, taps and smart links — live."
        actions={
          <>
            <a className="btn" href={siteUrl()} target="_blank" rel="noreferrer">
              View site ↗
            </a>
            <Link className="btn" href="/admin/orders/new">
              New order
            </Link>
            <Link className="btn p" href="/admin/products?stock=1">
              Stock &amp; sell
            </Link>
          </>
        }
      />
      <PendingRequestsNotice />
      <KpiGrid k={kpis} />

      <div className="grid stretch">
        <FadeUp className="card" delay={0.12}>
          <div className="card-h">
            <div>
              <h3>NFC taps</h3>
              <div className="sub">Every tap on every chip (NFC + QR), last 30 days.</div>
            </div>
            <div className="bigstat" style={{ marginTop: 0 }}>
              <CountUp value={tapsTotal} />
              <small>taps</small>
            </div>
          </div>
          <AreaChart
            labels={taps.map((p) => fmtSeriesDate(p.date))}
            series={[{ key: "taps", label: "taps", color: "#8C74FF", values: taps.map((p) => p.taps) }]}
            ariaLabel="Taps per day, last 30 days"
            emptyText="No taps yet — this curve starts with the first tap on a chip."
            height={210}
            showAxis
          />
        </FadeUp>

        <div className="stack">
          <FadeUp className="card" delay={0.18}>
            <h3>Revenue this month</h3>
            <div className="sub">Non-cancelled orders, cash on delivery.</div>
            <div className="bigstat">
              <CountUp value={kpis.revenueMonth} format="money" />
            </div>
            <div className="row between mt12" style={{ fontSize: 12.5 }}>
              <span className="muted">Monthly goal · {fmtMoney(MONTHLY_GOAL)}</span>
              <b style={{ color: goalPct >= 100 ? "var(--ok)" : "#fff" }}>{goalPct}%</b>
            </div>
            <div className="meter" role="progressbar" aria-valuenow={goalPct} aria-valuemin={0} aria-valuemax={100} aria-label="Monthly goal progress">
              <i style={{ width: `${Math.max(goalPct, 1)}%` }} />
            </div>
            <BarChart
              labels={revenue.map((p) => fmtSeriesDate(p.date))}
              values={revenue.map((p) => p.revenue)}
              format="money"
              height={64}
              ariaLabel="Revenue per day, last 30 days"
              seriesLabel="revenue"
              emptyText="No sales in the last 30 days yet."
            />
          </FadeUp>
          <FadeUp className="card" delay={0.24}>
            <div className="card-h">
              <div>
                <h3>New orders</h3>
                <div className="sub">Waiting for your confirmation call.</div>
              </div>
              {kpis.ordersNew > 0 ? (
                <span className="pill vio live">
                  <i />
                  Action needed
                </span>
              ) : null}
            </div>
            <div className="bigstat">
              <CountUp value={kpis.ordersNew} />
            </div>
            <Link className="linkbtn" href={kpis.ordersNew > 0 ? "/admin/orders?status=new" : "/admin/orders"}>
              {kpis.ordersNew > 0 ? "Review new orders →" : "All orders →"}
            </Link>
          </FadeUp>
        </div>
      </div>

      <div className="grid">
        <FadeUp className="card" delay={0.28}>
          <div className="card-h">
            <div>
              <h3>Recent orders</h3>
              <div className="sub">Website, WhatsApp and manual orders.</div>
            </div>
            <Link className="linkbtn" href="/admin/orders">
              All orders →
            </Link>
          </div>
          {recent.rows.length === 0 ? (
            <EmptyState
              title="No orders yet"
              actions={
                <Link className="btn" href="/admin/orders/new">
                  Record a WhatsApp order
                </Link>
              }
            >
              Orders from the website land here instantly — and on your phone once notifications are on (Settings).
            </EmptyState>
          ) : (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>City</th>
                    <th className="num">Total</th>
                    <th>Status</th>
                    <th className="num">When</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.rows.map((o) => (
                    <ClickRow key={o.id} href={`/admin/orders/${o.id}`}>
                      <td className="code">
                        <Link className="rowlink" href={`/admin/orders/${o.id}`}>
                          {o.number}
                        </Link>
                      </td>
                      <td className="clip">{o.name}</td>
                      <td className="clip">{o.city}</td>
                      <td className="num nowrap">{fmtMoney(o.total)}</td>
                      <td>
                        <OrderStatusPill status={o.status} />
                      </td>
                      <td className="num nowrap muted">{timeAgo(o.createdAt)}</td>
                    </ClickRow>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </FadeUp>

        <FadeUp className="card" delay={0.34}>
          <div className="card-h">
            <div>
              <h3>Top smart links</h3>
              <div className="sub">Most tapped · last 30 days.</div>
            </div>
            <Link className="linkbtn" href="/admin/analytics">
              Analytics →
            </Link>
          </div>
          {top.length === 0 || top.every((t) => t.taps30d === 0 && t.tapCount === 0) ? (
            <EmptyState title="No taps yet">Once chips are in the wild, the most-tapped ones rise to the top here.</EmptyState>
          ) : (
            <ul className="toplist">
              {top.map((t, i) => (
                <li key={t.id}>
                  <span className="rank">{i + 1}</span>
                  <div className="meta">
                    <Link href={standHref(t.code)}>
                      <b>
                        <span className="mono">{t.code}</span> · {t.customerName ?? KIND_LABEL[t.kind]}
                      </b>
                    </Link>
                    <small>{displayLink(smartLink(t.code))}</small>
                    <div className="meter">
                      <i style={{ width: `${Math.max(2, (t.taps30d / topMax) * 100)}%` }} />
                    </div>
                  </div>
                  <div className="val">
                    {fmtInt(t.taps30d)}
                    <small>{fmtInt(t.tapCount)} total</small>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </FadeUp>
      </div>
    </>
  );
}
