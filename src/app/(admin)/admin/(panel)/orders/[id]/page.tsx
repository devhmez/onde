// Order detail: items (what to print / configure), customer, address, totals, status stepper, smart links,
// WhatsApp-the-customer, printable packing slip.
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { displayLink, fmtDateTime, fmtMoney, fmtPhone, initials } from "@/components/admin/format";
import { IconWhatsApp } from "@/components/admin/icons";
import { channelLabel, paymentLabel, PRODUCT_KIND_LABEL } from "@/components/admin/meta";
import { FadeUp } from "@/components/admin/motion";
import OrderStatusControl from "@/components/admin/orders/OrderStatusControl";
import OrderTags from "@/components/admin/orders/OrderTags";
import PrintButton from "@/components/admin/orders/PrintButton";
import type { Order, OrderItem, OrderStatus, ProductKind, StandCard } from "@/components/admin/types";
import { PageHeader, Pill } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDT } from "@/lib/business";
import { listProducts } from "@/server/catalog";
import { getOrder, IN_PERSON_PAYMENT, missingUnitsByKind, replaceableByKind } from "@/server/orders";
import { printDesignAvailable } from "@/server/qr-print";
import { getRules } from "@/server/settings";
import { productLabel as standProduct, standStats } from "@/server/stands";
import { countStockByKind } from "@/server/tags";
import { toTagRow } from "../../../_lib/data";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Order ${decodeURIComponent(id).toUpperCase().startsWith("OND-") ? decodeURIComponent(id).toUpperCase() : `#${id}`}` };
}

function whatsappMessage(o: Order, status: OrderStatus, pct: number) {
  const first = o.name.trim().split(/\s+/)[0] ?? "";
  const fr = o.locale !== "en";
  const total = formatDT(o.total, fr ? "fr" : "en");
  if (fr) {
    switch (status) {
      case "new":
      case "confirmed":
        return `Bonjour ${first}, ici ONDE. Merci pour votre commande ${o.number} (${total}, paiement à la livraison). Pouvez-vous nous confirmer l’adresse : ${o.address}, ${o.city} (${o.governorate}) ?`;
      case "preparing":
        return `Bonjour ${first}, votre commande ONDE ${o.number} est en préparation. On vous prévient dès qu’elle part !`;
      case "shipped":
        return `Bonjour ${first}, votre commande ONDE ${o.number} est en route ! Montant à régler à la livraison : ${total}.`;
      case "delivered":
        return `Bonjour ${first}, merci d’avoir choisi ONDE ! Votre prochaine commande bénéficie de −${pct} %. Une question sur vos produits ? Répondez simplement à ce message.`;
      case "cancelled":
        return `Bonjour ${first}, votre commande ONDE ${o.number} a été annulée. N’hésitez pas à nous écrire si besoin.`;
    }
  }
  switch (status) {
    case "new":
    case "confirmed":
      return `Hi ${first}, this is ONDE. Thanks for your order ${o.number} (${total}, cash on delivery). Can you confirm the delivery address: ${o.address}, ${o.city} (${o.governorate})?`;
    case "preparing":
      return `Hi ${first}, your ONDE order ${o.number} is being prepared. We’ll let you know as soon as it ships!`;
    case "shipped":
      return `Hi ${first}, your ONDE order ${o.number} is on its way! Amount due on delivery: ${total}.`;
    case "delivered":
      return `Hi ${first}, thank you for choosing ONDE! Your next order gets ${pct}% off. Any question about your products? Just reply here.`;
    case "cancelled":
      return `Hi ${first}, your ONDE order ${o.number} has been cancelled. Feel free to message us anytime.`;
  }
}

const SLIP = {
  fr: { title: "Bon de livraison", date: "Date", to: "Livrer à", product: "Produit", detail: "Personnalisation", qty: "Qté", amount: "Montant", subtotal: "Sous-total", discount: "Remise fidélité", delivery: "Livraison", free: "Offerte", collect: "À encaisser à la livraison", thanks: "Merci pour votre confiance — onde.tn" },
  en: { title: "Packing slip", date: "Date", to: "Deliver to", product: "Product", detail: "Personalisation", qty: "Qty", amount: "Amount", subtotal: "Subtotal", discount: "Returning discount", delivery: "Delivery", free: "Free", collect: "To collect on delivery", thanks: "Thank you for your trust — onde.tn" },
};

function PackingSlip({ o, items }: { o: Order; items: OrderItem[] }) {
  const L = o.locale === "en" ? SLIP.en : SLIP.fr;
  const loc = o.locale === "en" ? "en" : "fr";
  return (
    <div className="slip print-only" aria-hidden>
      <div className="slip-h">
        {/* eslint-disable-next-line @next/next/no-img-element -- print asset */}
        <img src="/brand/mark_black.png" alt="onde" />
        <div className="no">
          {L.title}
          <b>{o.number}</b>
          {L.date}: {fmtDateTime(o.createdAt)}
        </div>
      </div>
      <h4>{L.to}</h4>
      <div className="addr">
        <b>{o.name}</b>
        <br />
        {o.address}
        <br />
        {o.city}, {o.governorate}
        <br />
        +216 {fmtPhone(o.phone)}
      </div>
      {o.notes ? <p style={{ marginTop: 8 }}>“{o.notes}”</p> : null}
      <table>
        <thead>
          <tr>
            <th>{L.product}</th>
            <th>{L.detail}</th>
            <th className="num">{L.qty}</th>
            <th className="num">{L.amount}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td>{it.productName}</td>
              <td>{[it.businessName, it.destinationUrl ? displayLink(it.destinationUrl) : null].filter(Boolean).join(" · ") || "—"}</td>
              <td className="num">{it.qty}</td>
              <td className="num">{formatDT(it.lineTotal, loc)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table style={{ width: "50%", marginLeft: "auto" }}>
        <tbody>
          <tr>
            <td>{L.subtotal}</td>
            <td className="num">{formatDT(o.subtotal, loc)}</td>
          </tr>
          {o.discount > 0 ? (
            <tr>
              <td>{L.discount}</td>
              <td className="num">−{formatDT(o.discount, loc)}</td>
            </tr>
          ) : null}
          <tr>
            <td>{L.delivery}</td>
            <td className="num">{o.deliveryFee ? formatDT(o.deliveryFee, loc) : L.free}</td>
          </tr>
        </tbody>
      </table>
      <div className="cod">
        <span>{L.collect}</span>
        <span>{formatDT(o.total, loc)}</span>
      </div>
      <div className="foot">{L.thanks}</div>
    </div>
  );
}

export default async function OrderPage({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;
  const raw = decodeURIComponent(id);
  const data = await getOrder(/^\d+$/.test(raw) ? Number(raw) : raw);
  if (!data) notFound();
  const { order: o, items, customer, tags } = data;
  const [products, rules, missingByKind, replaceable] = await Promise.all([
    listProducts({ includeInactive: true }),
    getRules(),
    missingUnitsByKind(o.id),
    replaceableByKind(o.id),
  ]);
  const stockByKind = countStockByKind();
  const imageById = new Map(products.map((p) => [p.id, p.image]));
  const customerName = customer.businessName?.trim() || customer.name;
  const stats = standStats(tags);
  const tagRows: StandCard[] = tags.map((t) => ({
    ...toTagRow(t, customerName),
    taps30d: stats.get(t.id)?.taps30d ?? 0,
    printedAt: stats.get(t.id)?.printedAt ?? null,
    product: standProduct(t),
  }));
  const inPerson = o.paymentMethod === IN_PERSON_PAYMENT;
  const wa = `https://wa.me/216${o.phone}?text=${encodeURIComponent(whatsappMessage(o, o.status, rules.returningDiscountPct))}`;
  const units = items.reduce((s, i) => s + i.qty, 0);

  return (
    <>
      <div className="screen-only">
        <PageHeader
          back={{ href: "/admin/orders", label: "Orders" }}
          title={
            <>
              <span className="mono">{o.number}</span>
            </>
          }
          subtitle={`Placed ${fmtDateTime(o.createdAt)} · ${channelLabel(o)} · ${o.locale.toUpperCase()} · ${units} item${units > 1 ? "s" : ""}`}
          actions={
            <>
              <a className="btn wa" href={wa} target="_blank" rel="noreferrer">
                <IconWhatsApp /> WhatsApp {o.name.split(/\s+/)[0]}
              </a>
              <a className="btn" href={`tel:+216${o.phone}`}>
                Call
              </a>
              <PrintButton />
            </>
          }
        />

        <FadeUp className="card mt22" delay={0.04}>
          <OrderStatusControl id={o.id} status={o.status} number={o.number} />
        </FadeUp>

        <div className="grid">
          <div className="stack" style={{ minWidth: 0 }}>
            <FadeUp className="card" delay={0.1}>
              <h3>Items</h3>
              <div className="sub">What to prepare, print and configure.</div>
              <div style={{ marginTop: 6 }}>
                {items.map((it) => {
                  const img = (it.productId && imageById.get(it.productId)) || "/products/stand_white.webp";
                  const kindLabel = it.kind in PRODUCT_KIND_LABEL ? PRODUCT_KIND_LABEL[it.kind as ProductKind] : it.kind;
                  return (
                    <div className="lineitem" key={it.id}>
                      <div className="thumb">
                        <Image src={img} alt="" width={46} height={46} />
                      </div>
                      <div className="li-meta">
                        <b>{it.productName}</b>
                        <small>
                          {kindLabel}
                          {it.businessName ? <> · Print: <span style={{ color: "#fff" }}>{it.businessName}</span></> : null}
                        </small>
                        {it.destinationUrl ? (
                          <small>
                            Destination:{" "}
                            <a href={it.destinationUrl} target="_blank" rel="noreferrer">
                              {displayLink(it.destinationUrl)}
                            </a>
                          </small>
                        ) : (
                          <small>No destination given — ask the customer.</small>
                        )}
                      </div>
                      <div className="li-amt">
                        {fmtMoney(it.lineTotal)}
                        <small>
                          {it.qty} × {fmtMoney(it.unitPrice)}
                        </small>
                      </div>
                    </div>
                  );
                })}
              </div>
            </FadeUp>
            <FadeUp className="card" delay={0.16}>
              <OrderTags
                orderId={o.id}
                orderNumber={o.number}
                tags={tagRows}
                cancelled={o.status === "cancelled"}
                missingByKind={missingByKind}
                stockByKind={stockByKind}
                replaceableByKind={replaceable}
                blackDesign={printDesignAvailable("black")}
                inPersonSale={inPerson && o.status !== "cancelled" && tags.length === 1 ? { number: o.number, total: o.total } : null}
              />
            </FadeUp>
          </div>

          <div className="stack">
            <FadeUp className="card" delay={0.12}>
              <div className="row">
                <span className="avatar lg" aria-hidden>
                  {initials(customerName)}
                </span>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0 }}>{o.name}</h3>
                  <div className="sub">{customer.businessName || "Customer"}</div>
                </div>
              </div>
              <dl className="kv">
                <dt>Phone</dt>
                <dd>
                  <a className="vio3" href={`tel:+216${o.phone}`}>
                    +216 {fmtPhone(o.phone)}
                  </a>
                </dd>
                {o.email ? (
                  <>
                    <dt>Email</dt>
                    <dd>
                      <a className="vio3" href={`mailto:${o.email}`}>
                        {o.email}
                      </a>
                    </dd>
                  </>
                ) : null}
                <dt>Discount</dt>
                <dd>{customer.discountAvailable ? <Pill tone="on">−{rules.returningDiscountPct}% available</Pill> : <span className="muted">None pending</span>}</dd>
              </dl>
              <Link className="linkbtn" href={`/admin/customers/${customer.id}`} style={{ display: "inline-block", marginTop: 14 }}>
                Customer profile →
              </Link>
            </FadeUp>

            <FadeUp className="card" delay={0.18}>
              <h3>{inPerson ? "Handed over in person" : "Delivery"}</h3>
              {inPerson ? <p className="hint mt8">Sold at the client’s counter — no delivery.</p> : null}
              <dl className="kv">
                {!inPerson || o.governorate ? (
                  <>
                    <dt>Governorate</dt>
                    <dd>{o.governorate}</dd>
                    <dt>City</dt>
                    <dd>{o.city}</dd>
                    <dt>Address</dt>
                    <dd>{o.address}</dd>
                  </>
                ) : null}
                {o.notes ? (
                  <>
                    <dt>Notes</dt>
                    <dd>{o.notes}</dd>
                  </>
                ) : null}
              </dl>
            </FadeUp>

            <FadeUp className="card" delay={0.24}>
              <h3>Totals</h3>
              <div className="totals">
                <div>
                  <span>Subtotal</span>
                  <span>{fmtMoney(o.subtotal)}</span>
                </div>
                {o.discount > 0 ? (
                  <div className="ok">
                    <span>{o.discountReason ? "Returning customer" : "Discount"}</span>
                    <span>−{fmtMoney(o.discount)}</span>
                  </div>
                ) : null}
                <div>
                  <span>Delivery</span>
                  <span>{inPerson ? <span className="muted">None (in person)</span> : o.deliveryFee ? fmtMoney(o.deliveryFee) : <span className="ok">Free</span>}</span>
                </div>
                <div className="tot">
                  <span>Total</span>
                  <span>{fmtMoney(o.total)}</span>
                </div>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  <span>Payment</span>
                  <span>{paymentLabel(o.paymentMethod)}</span>
                </div>
              </div>
            </FadeUp>
            {tagRows.length ? (
              <p className="hint">
                {tagRows.length} smart link{tagRows.length > 1 ? "s" : ""} · {tagRows.map((t) => `${t.code} (${t.product})`).join(", ")}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <PackingSlip o={o} items={items} />
    </>
  );
}
