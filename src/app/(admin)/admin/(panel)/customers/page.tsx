import type { Metadata } from "next";
import Link from "next/link";
import { ClickRow, SearchBox } from "@/components/admin/controls";
import { customerDisplay, fmtDate, fmtInt, fmtMoney, fmtPhone, initials } from "@/components/admin/format";
import { IconDashboard } from "@/components/admin/icons";
import { FadeUp } from "@/components/admin/motion";
import { EmptyState, PageHeader, Pager, Pill } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { listCustomers } from "@/server/customers";
import { getRules } from "@/server/settings";
import { int, str, type SearchParams } from "../../_lib/data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Customers" };

const PAGE_SIZE = 25;

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = str(sp.q).slice(0, 100);
  const page = int(sp.page, 1, 1, 10_000);
  const [list, all, rules] = await Promise.all([
    listCustomers({ q: q || undefined, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    listCustomers({ limit: 1 }),
    getRules(),
  ]);

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Everyone who ordered, recognised by phone number."
        actions={
          <>
            <a className="btn" href="/api/admin/export/customers" download>
              Export
            </a>
            <Link className="btn p" href="/admin/orders/new">
              + New order
            </Link>
          </>
        }
      />
      <FadeUp className="card mt22" delay={0.05}>
        <div className="card-h">
          <div>
            <h3>All customers</h3>
            <div className="sub">After a delivered order, a customer earns −{rules.returningDiscountPct}% on their next one — applied automatically.</div>
          </div>
          {all.total > 0 ? (
            <div className="toolbar">
              <SearchBox placeholder="Name, business, phone, city…" />
            </div>
          ) : null}
        </div>
        {all.total === 0 ? (
          <EmptyState
            title="No customers yet"
            actions={
              <Link className="btn" href="/admin/orders/new">
                Record an order
              </Link>
            }
          >
            Customers are created automatically from their first order — website, WhatsApp or phone.
          </EmptyState>
        ) : list.rows.length === 0 ? (
          <EmptyState
            title="No customer matches this search"
            actions={
              <Link className="btn" href="/admin/customers">
                Clear search
              </Link>
            }
          >
            Try a phone number (8 digits), a business name or a city.
          </EmptyState>
        ) : (
          <>
            <div className="tbl-wrap custs">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>City</th>
                    <th className="num">Orders</th>
                    <th className="num">Total spent</th>
                    <th className="num">Smart links</th>
                    <th>Discount</th>
                    <th className="num">Since</th>
                    <th>
                      <span className="sr-only">Client dashboard</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((c) => (
                    <ClickRow key={c.id} href={`/admin/customers/${c.id}`}>
                      <td>
                        <Link className="rowlink row" href={`/admin/customers/${c.id}`} style={{ gap: 10 }}>
                          <span className="avatar" aria-hidden>
                            {initials(customerDisplay(c))}
                          </span>
                          <span style={{ minWidth: 0 }}>
                            {c.name}
                            {c.businessName ? <span className="cell2">{c.businessName}</span> : null}
                          </span>
                        </Link>
                      </td>
                      <td className="nowrap">{fmtPhone(c.phone)}</td>
                      <td className="clip">{[c.city, c.governorate].filter(Boolean).join(", ") || <span className="muted">—</span>}</td>
                      <td className="num">{fmtInt(c.orderCount)}</td>
                      <td className="num nowrap">{fmtMoney(c.totalSpent)}</td>
                      <td className="num">{fmtInt(c.tagCount)}</td>
                      <td>{c.discountAvailable ? <Pill tone="on">−{rules.returningDiscountPct}% ready</Pill> : <span className="muted">—</span>}</td>
                      <td className="num nowrap muted">{fmtDate(c.createdAt)}</td>
                      <td className="right">
                        {/* The owner's view of this customer's client dashboard (with or without a client link). */}
                        <a className="btn xs" href={`/admin/customers/${c.id}/dashboard`} aria-label={`View ${customerDisplay(c)}’s dashboard`}>
                          <IconDashboard /> Dashboard
                        </a>
                      </td>
                    </ClickRow>
                  ))}
                </tbody>
              </table>
            </div>
            {/* iPhone: one card per customer — the row opens the customer, the button their dashboard (44 px targets). */}
            <ul className="clist" aria-label="Customers">
              {list.rows.map((c) => (
                <li key={c.id}>
                  <Link className="crow" href={`/admin/customers/${c.id}`}>
                    <span className="avatar" aria-hidden>
                      {initials(customerDisplay(c))}
                    </span>
                    <span className="crow-t">
                      <b>{c.businessName?.trim() || c.name}</b>
                      <small>
                        {c.businessName?.trim() ? `${c.name} · ` : ""}
                        {fmtPhone(c.phone)}
                        {c.city ? ` · ${c.city}` : ""}
                      </small>
                      <small>
                        {fmtInt(c.orderCount)} order{c.orderCount === 1 ? "" : "s"} · {fmtInt(c.tagCount)} link{c.tagCount === 1 ? "" : "s"} · {fmtMoney(c.totalSpent)}
                        {c.discountAvailable ? ` · −${rules.returningDiscountPct}% ready` : ""}
                      </small>
                    </span>
                  </Link>
                  <a className="btn crow-dash" href={`/admin/customers/${c.id}/dashboard`} aria-label={`View ${customerDisplay(c)}’s dashboard`}>
                    <IconDashboard />
                    <span>Dashboard</span>
                  </a>
                </li>
              ))}
            </ul>
            <Pager basePath="/admin/customers" params={{ q: q || undefined }} page={page} pageSize={PAGE_SIZE} total={list.total} />
          </>
        )}
      </FadeUp>
    </>
  );
}
