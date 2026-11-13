// One stand (any smart link) on its own page — what "Find a stand", the customer page, the order page and the QR codes
// page open: who has it, where it points, chip state, taps, print files, and the edit panel (sell it when it is stock,
// change its destination, return it to stock). On a phone the panel comes first.
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AreaChart } from "@/components/admin/charts";
import { CopyButton } from "@/components/admin/controls";
import { contactPrefix, customerDisplay, displayLink, fmtDate, fmtDateTime, fmtInt, fmtPhone, fmtSeriesDate, timeAgo } from "@/components/admin/format";
import { IconWhatsApp } from "@/components/admin/icons";
import { CHIP_META, isStock, ORDER_STATUS_META, productLabel, standHref } from "@/components/admin/meta";
import { FadeUp } from "@/components/admin/motion";
import StandPanel from "@/components/admin/products/StandPanel";
import { PrintFileButtons } from "@/components/admin/products/StandControls";
import type { CustomerOption, OrderStatus } from "@/components/admin/types";
import { ChipPill, EmptyState, PageHeader, Pill, TagStatusPill } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { listCustomers } from "@/server/customers";
import { printDesignAvailable } from "@/server/qr-print";
import { findStands } from "@/server/stands";
import { getTagTapSeries } from "@/server/stats";
import { getTag } from "@/server/tags";
import { toTagDetail } from "../../../_lib/data";

export const dynamic = "force-dynamic";

type Params = Promise<{ code: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { code } = await params;
  return { title: `Stand ${decodeURIComponent(code).toUpperCase().slice(0, 12)}` };
}

export default async function StandPage({ params }: { params: Params }) {
  await requireAdmin();
  const { code: rawParam } = await params;
  const raw = decodeURIComponent(rawParam).trim();
  const t = /^\d+$/.test(raw) ? await getTag(Number(raw)) : await getTag(raw);

  if (!t) {
    // Not a code (yet): read look-alikes / spacing like the search box does, else suggest close codes.
    const found = findStands(raw);
    if (found.exact) redirect(standHref(found.exact.code));
    return (
      <>
        <PageHeader back={{ href: "/admin/products", label: "Products" }} title={<span className="mono">{found.code || raw}</span>} subtitle="No stand has this code." />
        <div className="card mt22">
          <EmptyState title={`No stand with the code ${found.code || raw}`}>
            Check the code printed under the QR — or tap the stand with a phone: the page that opens shows its code.
          </EmptyState>
          {found.suggestions.length ? (
            <>
              <div className="lbl">Close codes</div>
              <div className="row wrap">
                {found.suggestions.map((s) => (
                  <Link key={s.id} className="btn sm mono" href={standHref(s.code)}>
                    {s.code} · {s.stock ? "in stock" : (s.customerName ?? "no customer")}
                  </Link>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </>
    );
  }
  if (t.code !== raw) redirect(standHref(t.code));

  const [customers, series] = await Promise.all([listCustomers({ limit: 1000 }), getTagTapSeries(t.id, 30)]);
  const detail = toTagDetail(t);
  const row = detail.row;
  const stock = isStock(row);
  const product = productLabel(row);
  const customerOptions: CustomerOption[] = customers.rows.map((c) => ({ id: c.id, name: c.name, businessName: c.businessName, phone: c.phone }));
  const blackDesign = printDesignAvailable("black");
  const owner = t.customer ? customerDisplay(t.customer) : null;
  const chip = CHIP_META[t.chipStatus];

  return (
    <>
      <PageHeader
        back={owner && t.customer ? { href: `/admin/customers/${t.customer.id}`, label: owner } : { href: stock ? "/admin/products?stock=1" : "/admin/products", label: stock ? "Stock" : "Products" }}
        title={
          <span className="row wrap" style={{ gap: 10 }}>
            <span className="mono" style={{ letterSpacing: "0.06em" }}>
              {t.code}
            </span>
            <TagStatusPill status={t.status} stock={stock} url={t.destinationUrl} />
            <ChipPill status={t.chipStatus} />
          </span>
        }
        subtitle={`${product} · ${owner ?? (stock ? "in stock, not sold" : "no customer")} · created ${fmtDate(t.createdAt)} · ${t.printedAt ? `printed ${fmtDate(t.printedAt)}` : "not printed yet"}`}
        actions={<PrintFileButtons tag={row} printedAt={t.printedAt} blackDesign={blackDesign} size="sm" />}
      />

      <div className="grid stand-grid">
        <div className="stack" style={{ minWidth: 0 }}>
          <FadeUp className="card" delay={0.08}>
            <div className="card-h">
              <div>
                <h3>Where it points</h3>
                <div className="sub">The chip and the printed QR open this — change it anytime from the panel.</div>
              </div>
            </div>
            <div className="scard-top mt16">
              <a className="q" href={`/api/admin/tags/${t.id}/qr?format=svg`} target="_blank" rel="noreferrer" aria-label={`Open the QR code of ${t.code}`} style={{ width: 96, height: 96, borderRadius: 12, background: "#fff", padding: 7, flex: "none" }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- authenticated dynamic SVG */}
                <img src={`/api/admin/tags/${t.id}/qr?format=svg`} alt={`QR code of ${t.code}`} width={82} height={82} />
              </a>
              <div className="scard-id">
                {t.destinationUrl ? (
                  <>
                    <b style={{ color: "#fff", fontSize: 15 }}>{t.status === "active" ? "Opens" : "Would open (disabled)"}</b>
                    <a className="vio3" href={t.destinationUrl} target="_blank" rel="noreferrer" style={{ overflowWrap: "anywhere" }}>
                      {displayLink(t.destinationUrl)}
                    </a>
                  </>
                ) : (
                  <>
                    <b style={{ color: "#fff", fontSize: 15 }}>No destination yet</b>
                    <small style={{ whiteSpace: "normal" }}>Taps show the ONDE “not activated yet” page with this code.</small>
                  </>
                )}
                <span className="copy hint" style={{ marginTop: 4 }}>
                  Chip link <b className="mono" style={{ color: "#fff" }}>{displayLink(row.link)}</b>
                  <CopyButton text={row.link} label="Copy chip link" />
                </span>
              </div>
            </div>
            <div className="statline">
              <span>
                <b>{fmtInt(detail.taps30d)}</b> tap{detail.taps30d === 1 ? "" : "s"} · 30 days
              </span>
              <span>
                <b>{fmtInt(t.tapCount)}</b> total
              </span>
              <span>last tap {timeAgo(t.lastTapAt)}</span>
            </div>
            <AreaChart
              labels={series.map((p) => fmtSeriesDate(p.date))}
              series={[{ key: "taps", label: "taps", color: "#8C74FF", values: series.map((p) => p.taps) }]}
              ariaLabel={`Taps per day on ${t.code}, last 30 days`}
              emptyText={stock ? "Stock stand: taps here are your chip tests." : "No taps in the last 30 days."}
              marginTop={12}
            />
          </FadeUp>

          <FadeUp className="card" delay={0.14}>
            <h3>{stock ? "In stock" : "Client"}</h3>
            {t.customer ? (
              <>
                <div className="row mt12">
                  <span className="avatar lg" aria-hidden>
                    {customerDisplay(t.customer).slice(0, 1).toUpperCase()}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <b style={{ color: "#fff" }}>{customerDisplay(t.customer)}</b>
                    <div className="sub">
                      {contactPrefix(t.customer)}+216 {fmtPhone(t.customer.phone)}
                    </div>
                  </div>
                </div>
                <div className="row wrap mt12">
                  <Link className="btn sm" href={`/admin/customers/${t.customer.id}`}>
                    Client profile →
                  </Link>
                  <a className="btn sm wa" href={`https://wa.me/216${t.customer.phone}`} target="_blank" rel="noreferrer">
                    <IconWhatsApp /> WhatsApp
                  </a>
                  <a className="btn sm" href={`tel:+216${t.customer.phone}`}>
                    Call
                  </a>
                </div>
              </>
            ) : (
              <p className="hint mt8">
                {stock
                  ? "Not sold yet. Sell it from the panel: pick or create the client, paste their Google review link, done — the chip and the print don’t change."
                  : "This link has a destination but no client."}
              </p>
            )}
            {t.order ? (
              <p className="mt12" style={{ fontSize: 13.5 }}>
                Order{" "}
                <Link className="vio3 mono" href={`/admin/orders/${t.order.id}`}>
                  {t.order.number}
                </Link>{" "}
                <Pill tone={ORDER_STATUS_META[t.order.status as OrderStatus]?.tone ?? "gray"}>{ORDER_STATUS_META[t.order.status as OrderStatus]?.label ?? t.order.status}</Pill>
              </p>
            ) : null}
            <dl className="kv">
              <dt>Product</dt>
              <dd>{product}</dd>
              <dt>Chip</dt>
              <dd>
                {chip.label}
                {t.chipAt ? <span className="muted"> · {fmtDateTime(t.chipAt)}</span> : null}
              </dd>
              <dt>Print</dt>
              <dd>{t.printedAt ? `Downloaded ${fmtDateTime(t.printedAt)}` : "Not printed yet"}</dd>
              <dt>Created</dt>
              <dd>{fmtDateTime(t.createdAt)}</dd>
              {t.notes ? (
                <>
                  <dt>Notes</dt>
                  <dd>{t.notes}</dd>
                </>
              ) : null}
            </dl>
          </FadeUp>
        </div>

        <div className="edit-first" style={{ minWidth: 0 }}>
          <StandPanel detail={detail} customers={customerOptions} blackDesign={blackDesign} />
        </div>
      </div>
    </>
  );
}
