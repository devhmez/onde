import type { Metadata } from "next";
import Link from "next/link";
import { ClickRow, SearchBox } from "@/components/admin/controls";
import { fmtDateTime, fmtMoney, fmtPhone } from "@/components/admin/format";
import { channelLabel, ORDER_STATUSES, ORDER_STATUS_META } from "@/components/admin/meta";
import { FadeUp } from "@/components/admin/motion";
import { EmptyState, OrderStatusPill, PageHeader, Pager } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { listOrders } from "@/server/orders";
import { int, oneOf, str, type SearchParams } from "../../_lib/data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Orders" };

const PAGE_SIZE = 25;

export default async function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const status = oneOf(sp.status, ORDER_STATUSES);
  const q = str(sp.q).slice(0, 100);
  const page = int(sp.page, 1, 1, 10_000);

  const [list, all, ...perStatus] = await Promise.all([
    listOrders({ status, q: q || undefined, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    listOrders({ limit: 1 }),
    ...ORDER_STATUSES.map((s) => listOrders({ status: s, limit: 1 })),
  ]);
  const counts = Object.fromEntries(ORDER_STATUSES.map((s, i) => [s, perStatus[i].total])) as Record<(typeof ORDER_STATUSES)[number], number>;

  const tabHref = (s?: string) => {
    const p = new URLSearchParams();
    if (s) p.set("status", s);
    if (q) p.set("q", q);
    const qs = p.toString();
    return qs ? `/admin/orders?${qs}` : "/admin/orders";
  };

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle="From the website, WhatsApp and the phone — confirm, ship, deliver."
        actions={
          <>
            <a className="btn" href="/api/admin/export/orders" download>
              Export
            </a>
            <Link className="btn p" href="/admin/orders/new">
              + New order
            </Link>
          </>
        }
      />

      <nav className="tabs" aria-label="Order status">
        <Link href={tabHref()} className={`tab${!status ? " on" : ""}`} aria-current={!status ? "page" : undefined}>
          All <span className="n">{all.total}</span>
        </Link>
        {ORDER_STATUSES.map((s) => (
          <Link key={s} href={tabHref(s)} className={`tab${status === s ? " on" : ""}`} aria-current={status === s ? "page" : undefined}>
            {ORDER_STATUS_META[s].label} <span className="n">{counts[s]}</span>
          </Link>
        ))}
      </nav>

      <FadeUp className="card mt16" delay={0.05}>
        <div className="card-h">
          <div>
            <h3>{status ? `${ORDER_STATUS_META[status].label} orders` : "All orders"}</h3>
            <div className="sub">Click an order to call, confirm, generate its smart links and print the packing slip.</div>
          </div>
          {all.total > 0 ? (
            <div className="toolbar">
              <SearchBox placeholder="Number, name, phone, city…" />
            </div>
          ) : null}
        </div>

        {all.total === 0 ? (
          <EmptyState
            title="No orders yet"
            actions={
              <Link className="btn p" href="/admin/orders/new">
                Record a WhatsApp order
              </Link>
            }
          >
            Website orders appear here the moment they’re placed. Orders taken on WhatsApp or by phone can be recorded by hand.
          </EmptyState>
        ) : list.rows.length === 0 ? (
          <EmptyState
            title={q ? "No orders match this search" : `No ${status ? ORDER_STATUS_META[status].label.toLowerCase() : ""} orders`}
            actions={
              <Link className="btn" href="/admin/orders">
                Show all orders
              </Link>
            }
          >
            {q ? "Try the order number (OND-1001), a phone number or a city." : "Nothing in this column right now."}
          </EmptyState>
        ) : (
          <>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>City</th>
                    <th className="num">Items</th>
                    <th className="num">Total</th>
                    <th>Channel</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((o) => (
                    <ClickRow key={o.id} href={`/admin/orders/${o.id}`}>
                      <td className="code">
                        <Link className="rowlink" href={`/admin/orders/${o.id}`}>
                          {o.number}
                        </Link>
                      </td>
                      <td className="nowrap">{fmtDateTime(o.createdAt)}</td>
                      <td className="clip">
                        {o.name}
                        {o.discountReason ? <span className="cell2">−{fmtMoney(o.discount)} returning</span> : null}
                      </td>
                      <td className="nowrap">
                        <a className="rowlink" href={`tel:+216${o.phone}`}>
                          {fmtPhone(o.phone)}
                        </a>
                      </td>
                      <td className="clip">
                        {o.city}
                        <span className="cell2">{o.governorate}</span>
                      </td>
                      <td className="num">{o.itemCount}</td>
                      <td className="num nowrap">{fmtMoney(o.total)}</td>
                      <td className="nowrap">{channelLabel(o)}</td>
                      <td>
                        <OrderStatusPill status={o.status} />
                      </td>
                    </ClickRow>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager basePath="/admin/orders" params={{ status, q: q || undefined }} page={page} pageSize={PAGE_SIZE} total={list.total} />
          </>
        )}
      </FadeUp>
    </>
  );
}
