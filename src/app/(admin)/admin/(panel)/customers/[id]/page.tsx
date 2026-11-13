import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClickRow } from "@/components/admin/controls";
import CustomerEditor from "@/components/admin/customers/CustomerEditor";
import ClientPortalSection from "@/components/admin/portal/ClientPortalSection";
import CustomerStands from "@/components/admin/customers/CustomerStands";
import { contactPrefix, customerDisplay, fmtDate, fmtDateTime, fmtInt, fmtMoney, fmtPhone } from "@/components/admin/format";
import { IconDashboard, IconWhatsApp } from "@/components/admin/icons";
import { KpiCard } from "@/components/admin/Kpis";
import { channelLabel, productLabel } from "@/components/admin/meta";
import { FadeUp } from "@/components/admin/motion";
import type { CustomerOption, StandCard } from "@/components/admin/types";
import { EmptyState, OrderStatusPill, PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { getCustomer } from "@/server/customers";
import { printDesignAvailable } from "@/server/qr-print";
import { getRules } from "@/server/settings";
import { standStats } from "@/server/stands";
import { countStockByKind } from "@/server/tags";
import { toTagRow } from "../../../_lib/data";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const n = Number(id);
  const data = Number.isInteger(n) && n > 0 ? await getCustomer(n) : null;
  return { title: data ? customerDisplay(data.customer) : "Customer" };
}

export default async function CustomerPage({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  const [data, rules] = await Promise.all([getCustomer(n), getRules()]);
  if (!data) notFound();
  const { customer: c, orders, tags, totalSpent } = data;
  const activeOrders = orders.filter((o) => o.status !== "cancelled").length;
  const stats = standStats(tags);
  const name = c.businessName?.trim() || c.name;
  const stands: StandCard[] = tags.map((t) => ({
    ...toTagRow(t, name),
    taps30d: stats.get(t.id)?.taps30d ?? 0,
    printedAt: stats.get(t.id)?.printedAt ?? null,
    product: productLabel(t),
  }));
  const taps30 = stands.reduce((n, t) => n + t.taps30d, 0);
  const tapsAll = tags.reduce((n, t) => n + t.tapCount, 0);
  const option: CustomerOption = { id: c.id, name: c.name, businessName: c.businessName, phone: c.phone };
  const stockCount = Object.values(countStockByKind()).reduce((n, v) => n + (v ?? 0), 0);
  const blackDesign = printDesignAvailable("black");
  const lastOrder = orders[0];
  // Many products: the stand cards take the full width (3 per row at 1440) above the client page / orders / details
  // columns, so neither column ends in a big empty block. A few: they stay in the main column.
  const wideStands = stands.length > 4;
  const standsCard = (
    <FadeUp className="card" delay={0.1}>
      <CustomerStands stands={stands} customer={option} blackDesign={blackDesign} stockCount={stockCount} />
    </FadeUp>
  );

  return (
    <div className="cust-page">
      <PageHeader
        back={{ href: "/admin/customers", label: "Customers" }}
        title={customerDisplay(c)}
        subtitle={`${contactPrefix(c)}+216 ${fmtPhone(c.phone)} · customer since ${fmtDate(c.createdAt)}`}
        actions={
          <>
            {/* The client's dashboard, exactly as they see it (works with or without a client link). */}
            <a className="btn" href={`/admin/customers/${c.id}/dashboard`}>
              <IconDashboard /> View dashboard
            </a>
            <a className="btn wa" href={`https://wa.me/216${c.phone}`} target="_blank" rel="noreferrer">
              <IconWhatsApp /> WhatsApp
            </a>
            <a className="btn" href={`tel:+216${c.phone}`}>
              Call
            </a>
            <Link className="btn p" href="/admin/orders/new">
              + New order
            </Link>
          </>
        }
      />

      <section className="kpis three" aria-label="Customer figures">
        <KpiCard label="Orders" value={activeOrders} delta={lastOrder ? `last ${fmtDate(lastOrder.createdAt)}` : "no order yet"} tone="flat" />
        <KpiCard label="Total spent" value={totalSpent} format="money" delta="excluding cancelled orders" tone="flat" delay={0.05} />
        <KpiCard
          label="Stands & links"
          value={tags.length}
          delta={`${fmtInt(taps30)} tap${taps30 === 1 ? "" : "s"} · 30 d · ${fmtInt(tapsAll)} all-time`}
          tone={tags.some((t) => t.tapCount > 0) ? "up" : "flat"}
          delay={0.1}
        />
      </section>

      {/* Stands (location labels on each card), the client page (link / mode | requests & changes), orders — and the
          details on the right. Phones: one column in that order. */}
      {wideStands ? <div className="mt16">{standsCard}</div> : null}
      <div className="grid cust-grid">
        <div className="stack cust-main" style={{ minWidth: 0 }}>
          {wideStands ? null : standsCard}
          <ClientPortalSection customerId={c.id} />
          <FadeUp className="card" delay={0.16}>
            <h3>Orders</h3>
            <div className="sub">Newest first.</div>
            {orders.length === 0 ? (
              <EmptyState title="No orders">This customer was created without an order.</EmptyState>
            ) : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Date</th>
                      <th>Channel</th>
                      <th className="num">Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <ClickRow key={o.id} href={`/admin/orders/${o.id}`}>
                        <td className="code">
                          <Link className="rowlink" href={`/admin/orders/${o.id}`}>
                            {o.number}
                          </Link>
                        </td>
                        <td className="nowrap">{fmtDateTime(o.createdAt)}</td>
                        <td>{channelLabel(o)}</td>
                        <td className="num nowrap">
                          {fmtMoney(o.total)}
                          {o.discount > 0 ? <span className="cell2 ok">−{fmtMoney(o.discount)}</span> : null}
                        </td>
                        <td>
                          <OrderStatusPill status={o.status} />
                        </td>
                      </ClickRow>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </FadeUp>
        </div>

        <FadeUp className="card" delay={0.12}>
          <CustomerEditor customer={c} pct={rules.returningDiscountPct} />
        </FadeUp>
      </div>
    </div>
  );
}
