// WhatsApp ordering — builds a clean, human-readable multi-line order message (pure; server + client).
import { formatDT, priceOrder, type Rules } from "@/lib/business";
import type { Locale } from "@/i18n/config";
import { displayPhone, fmt, type ShopMessages } from "./messages";

export type WaLine = {
  name: string;
  qty: number;
  unitPrice: number; // millimes
  businessName?: string;
  destinationUrl?: string;
};

export type WaCustomer = {
  name?: string;
  phone?: string;
  email?: string;
  businessName?: string;
  governorate?: string;
  city?: string;
  address?: string;
  notes?: string;
};

const clean = (v: string | undefined) => (v ?? "").replace(/\s+/g, " ").trim();

export function buildOrderMessage(opts: {
  lines: WaLine[];
  locale: Locale;
  rules: Rules;
  t: ShopMessages["whatsapp"];
  returningDiscount?: boolean;
  customer?: WaCustomer;
  /** Set when the order was also recorded on the site (OND-####). */
  orderNumber?: string;
}): string {
  const { lines, locale, rules, t, customer } = opts;
  const money = (m: number) => formatDT(m, locale);
  const priced = priceOrder(lines, { rules, returningDiscount: !!opts.returningDiscount });
  const out: string[] = [t.greeting, ""];
  if (opts.orderNumber) out.push(`*${fmt(t.orderRef, { number: opts.orderNumber })}*`, "");
  out.push(t.intro, "");

  for (const l of lines) {
    out.push(fmt(t.line, { qty: l.qty, name: clean(l.name), total: money(l.unitPrice * l.qty) }));
    if (clean(l.businessName)) out.push(fmt(t.lineBusiness, { value: clean(l.businessName) }));
    if (clean(l.destinationUrl)) out.push(fmt(t.lineLink, { value: clean(l.destinationUrl) }));
  }

  out.push("", fmt(t.subtotal, { value: money(priced.subtotal) }));
  if (priced.discount > 0) out.push(fmt(t.discount, { pct: rules.returningDiscountPct, value: money(priced.discount) }));
  out.push(fmt(t.delivery, { value: priced.deliveryFee === 0 ? t.free : money(priced.deliveryFee) }));
  out.push(fmt(t.total, { value: money(priced.total) }));
  out.push(t.payment);

  if (customer) {
    const c: string[] = [];
    if (clean(customer.name)) c.push(fmt(t.name, { value: clean(customer.name) }));
    if (clean(customer.phone)) c.push(fmt(t.phone, { value: displayPhone(clean(customer.phone)) }));
    if (clean(customer.email)) c.push(fmt(t.email, { value: clean(customer.email) }));
    if (clean(customer.businessName)) c.push(fmt(t.businessName, { value: clean(customer.businessName) }));
    const address = [customer.address, customer.city, customer.governorate].map(clean).filter(Boolean).join(", ");
    if (address) c.push(fmt(t.address, { value: address }));
    if (clean(customer.notes)) c.push(fmt(t.notes, { value: clean(customer.notes) }));
    if (c.length) out.push("", t.customerTitle, ...c);
  }
  return out.join("\n");
}

export function waHref(number: string, text: string): string {
  const digits = (number || "").replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
