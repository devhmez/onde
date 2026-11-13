"use client";
// Manual order (WhatsApp / phone) using the live catalog. Prices are previewed with priceOrder(); the server re-prices.
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { checkDiscountAction, createOrderAction } from "@/app/(admin)/admin/actions";
import { GOVERNORATES, normalizePhone, priceOrder, type Rules } from "@/lib/business";
import { fmtMoney } from "../format";
import { IconX } from "../icons";
import { useToast } from "../toast";
import type { Product } from "../types";

type Line = { key: number; productId: number; qty: number; businessName: string; destinationUrl: string };
type Fields = Record<string, string>;

export default function NewOrderForm({ products, rules }: { products: Product[]; rules: Rules }) {
  const router = useRouter();
  const toast = useToast();
  const uid = useId();
  const seq = useRef(1);
  const firstActive = products.find((p) => p.active) ?? products[0];
  const [lines, setLines] = useState<Line[]>(() => (firstActive ? [{ key: 0, productId: firstActive.id, qty: 1, businessName: "", destinationUrl: "" }] : []));
  const [channel, setChannel] = useState<"whatsapp" | "manual">("whatsapp");
  const [locale, setLocale] = useState<"fr" | "en">("fr");
  const [c, setC] = useState({ name: "", phone: "", email: "", businessName: "", governorate: "", city: "", address: "", notes: "" });
  const [discountState, setDiscountState] = useState<{ phone: string; eligible: boolean; pct: number } | null>(null);
  const [fields, setFields] = useState<Fields>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const phone8 = normalizePhone(c.phone);

  const discount = discountState && discountState.phone === phone8 ? discountState : null;

  useEffect(() => {
    if (!phone8) return;
    let alive = true;
    const t = window.setTimeout(async () => {
      const r = await checkDiscountAction(phone8);
      if (alive) setDiscountState({ phone: phone8, ...r });
    }, 350);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [phone8]);

  const priced = priceOrder(
    lines.map((l) => ({ unitPrice: byId.get(l.productId)?.price ?? 0, qty: l.qty })),
    { rules, returningDiscount: Boolean(discount?.eligible) },
  );

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const setField = (k: keyof typeof c, v: string) => {
    setC((s) => ({ ...s, [k]: v }));
    if (fields[`customer.${k}`]) setFields((f) => ({ ...f, [`customer.${k}`]: "" }));
  };
  const fe = (k: string) => fields[k] || "";

  async function submit() {
    setError(null);
    setFields({});
    const local: Fields = {};
    if (!lines.length) local.items = "Add at least one product.";
    if (!c.name.trim()) local["customer.name"] = "Required.";
    if (!phone8) local["customer.phone"] = "Enter a valid Tunisian number (8 digits).";
    if (!c.governorate) local["customer.governorate"] = "Choose a governorate.";
    if (!c.city.trim()) local["customer.city"] = "Required.";
    if (!c.address.trim()) local["customer.address"] = "Required.";
    if (Object.keys(local).length) {
      setFields(local);
      setError("Please complete the highlighted fields.");
      return;
    }
    setPending(true);
    const res = await createOrderAction({
      channel,
      locale,
      items: lines.map((l) => ({ productId: l.productId, qty: l.qty, businessName: l.businessName, destinationUrl: l.destinationUrl })),
      customer: { ...c, phone: phone8 ?? c.phone },
    });
    if (!res.ok) {
      setPending(false);
      setError(res.error);
      setFields(res.fields ?? {});
      return;
    }
    toast.ok(`Order ${res.data.number} created`, "Next: confirm it and generate its smart links.");
    router.push(`/admin/orders/${res.data.id}`);
  }

  if (!products.length) {
    return (
      <div className="card mt22">
        <p className="hint">The catalog is empty — add products in Catalog first.</p>
      </div>
    );
  }

  return (
    <form
      className="grid"
      style={{ marginTop: 22 }}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      noValidate
    >
      <div className="stack" style={{ minWidth: 0 }}>
        <section className="card" aria-labelledby={`${uid}-p`}>
          <div className="card-h">
            <div>
              <h3 id={`${uid}-p`}>Products</h3>
              <div className="sub">Business name = what to print on the product. Destination = where the chip should send people.</div>
            </div>
            <button
              type="button"
              className="btn sm"
              onClick={() => setLines((ls) => [...ls, { key: seq.current++, productId: firstActive?.id ?? products[0].id, qty: 1, businessName: "", destinationUrl: "" }])}
            >
              + Add line
            </button>
          </div>
          {fields.items ? <p className="err mt8">{fields.items}</p> : null}
          <div className="order-lines">
            <AnimatePresence initial={false} mode="popLayout">
              {lines.map((l, i) => {
                const p = byId.get(l.productId);
                return (
                  <motion.div
                    key={l.key}
                    className="order-line"
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.15 } }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className="field ol-wide">
                      <label htmlFor={`${uid}-prod-${l.key}`}>Product</label>
                      <select
                        id={`${uid}-prod-${l.key}`}
                        className={`select${fe(`items.${i}.productId`) ? " bad" : ""}`}
                        value={l.productId}
                        onChange={(e) => setLine(l.key, { productId: Number(e.target.value) })}
                      >
                        {products.map((pr) => (
                          <option key={pr.id} value={pr.id}>
                            {pr.nameEn} — {fmtMoney(pr.price)}
                            {pr.active ? "" : " (hidden from shop)"}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <span className="flabel">Qty</span>
                      <div className="qty">
                        <button type="button" aria-label="Decrease quantity" onClick={() => setLine(l.key, { qty: Math.max(1, l.qty - 1) })}>
                          −
                        </button>
                        <input
                          aria-label="Quantity"
                          inputMode="numeric"
                          value={l.qty}
                          onChange={(e) => setLine(l.key, { qty: Math.min(99, Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1)) })}
                        />
                        <button type="button" aria-label="Increase quantity" onClick={() => setLine(l.key, { qty: Math.min(99, l.qty + 1) })}>
                          +
                        </button>
                      </div>
                    </div>
                    <div className="field ol-wide">
                      <label htmlFor={`${uid}-biz-${l.key}`}>Business name</label>
                      <input id={`${uid}-biz-${l.key}`} className="input" value={l.businessName} maxLength={120} onChange={(e) => setLine(l.key, { businessName: e.target.value })} placeholder="Café Lumière" />
                    </div>
                    <div className="field ol-wide">
                      <label htmlFor={`${uid}-dest-${l.key}`}>Destination link</label>
                      <input
                        id={`${uid}-dest-${l.key}`}
                        className={`input${fe(`items.${i}.destinationUrl`) ? " bad" : ""}`}
                        value={l.destinationUrl}
                        onChange={(e) => setLine(l.key, { destinationUrl: e.target.value })}
                        placeholder="https://g.page/r/…/review"
                        inputMode="url"
                        spellCheck={false}
                      />
                      {fe(`items.${i}.destinationUrl`) ? <span className="err">{fe(`items.${i}.destinationUrl`)}</span> : null}
                    </div>
                    <button type="button" className="x" style={{ marginBottom: 5 }} aria-label={`Remove ${p?.nameEn ?? "line"}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                      <IconX />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </section>

        <section className="card" aria-labelledby={`${uid}-c`}>
          <h3 id={`${uid}-c`}>Customer</h3>
          <div className="sub">Matched to an existing customer by phone number.</div>
          <div className="form-grid mt16">
            <Field id={`${uid}-name`} label="Full name" error={fe("customer.name")}>
              <input id={`${uid}-name`} className={`input${fe("customer.name") ? " bad" : ""}`} value={c.name} onChange={(e) => setField("name", e.target.value)} autoComplete="off" />
            </Field>
            <Field id={`${uid}-phone`} label="Phone" error={fe("customer.phone")}>
              <div className="affix pre">
                <span>+216</span>
                <input id={`${uid}-phone`} className={`input${fe("customer.phone") ? " bad" : ""}`} value={c.phone} onChange={(e) => setField("phone", e.target.value)} inputMode="tel" placeholder="25 875 529" autoComplete="off" />
              </div>
            </Field>
            <Field id={`${uid}-biz`} label="Business (optional)">
              <input id={`${uid}-biz`} className="input" value={c.businessName} onChange={(e) => setField("businessName", e.target.value)} />
            </Field>
            <Field id={`${uid}-email`} label="Email (optional)" error={fe("customer.email")}>
              <input id={`${uid}-email`} className={`input${fe("customer.email") ? " bad" : ""}`} value={c.email} onChange={(e) => setField("email", e.target.value)} inputMode="email" />
            </Field>
            <Field id={`${uid}-gov`} label="Governorate" error={fe("customer.governorate")}>
              <select id={`${uid}-gov`} className={`select${fe("customer.governorate") ? " bad" : ""}`} value={c.governorate} onChange={(e) => setField("governorate", e.target.value)}>
                <option value="">Choose…</option>
                {GOVERNORATES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </Field>
            <Field id={`${uid}-city`} label="City" error={fe("customer.city")}>
              <input id={`${uid}-city`} className={`input${fe("customer.city") ? " bad" : ""}`} value={c.city} onChange={(e) => setField("city", e.target.value)} />
            </Field>
            <div className="full">
              <Field id={`${uid}-addr`} label="Address" error={fe("customer.address")}>
                <input id={`${uid}-addr`} className={`input${fe("customer.address") ? " bad" : ""}`} value={c.address} onChange={(e) => setField("address", e.target.value)} placeholder="Street, building, landmark" />
              </Field>
            </div>
            <div className="full">
              <Field id={`${uid}-notes`} label="Notes (optional)">
                <textarea id={`${uid}-notes`} className="textarea" value={c.notes} onChange={(e) => setField("notes", e.target.value)} placeholder="Delivery time, colours, anything the customer said…" />
              </Field>
            </div>
          </div>
        </section>
      </div>

      <aside className="card" style={{ position: "sticky", top: 20 }} aria-label="Summary">
        <h3>Summary</h3>
        <div className="field mt16">
          <span className="flabel">Channel</span>
          <div className="seg" role="group" aria-label="Channel">
            <button type="button" className={channel === "whatsapp" ? "on" : undefined} aria-pressed={channel === "whatsapp"} onClick={() => setChannel("whatsapp")}>
              WhatsApp
            </button>
            <button type="button" className={channel === "manual" ? "on" : undefined} aria-pressed={channel === "manual"} onClick={() => setChannel("manual")}>
              Manual / phone
            </button>
          </div>
        </div>
        <div className="field mt12">
          <span className="flabel">Customer language</span>
          <div className="seg" role="group" aria-label="Customer language">
            <button type="button" className={locale === "fr" ? "on" : undefined} aria-pressed={locale === "fr"} onClick={() => setLocale("fr")}>
              Français
            </button>
            <button type="button" className={locale === "en" ? "on" : undefined} aria-pressed={locale === "en"} onClick={() => setLocale("en")}>
              English
            </button>
          </div>
        </div>

        <AnimatePresence>
          {discount?.eligible ? (
            <motion.div className="notice ok mt16" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <span aria-hidden>✓</span>
              <span>
                <b>Returning customer</b> — −{discount.pct}% applied automatically.
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="totals">
          <div>
            <span>Subtotal</span>
            <span>{fmtMoney(priced.subtotal)}</span>
          </div>
          {priced.discount > 0 ? (
            <div className="ok">
              <span>Returning −{discount?.pct}%</span>
              <span>−{fmtMoney(priced.discount)}</span>
            </div>
          ) : null}
          <div>
            <span>Delivery</span>
            <span>{priced.deliveryFee ? fmtMoney(priced.deliveryFee) : priced.subtotal ? <span className="ok">Free</span> : "—"}</span>
          </div>
          {priced.subtotal > 0 && !priced.freeDelivery ? <span className="hint">{fmtMoney(priced.remainingForFree)} more for free delivery.</span> : null}
          <div className="tot">
            <span>Total</span>
            <span>{fmtMoney(priced.total)}</span>
          </div>
        </div>
        {error ? (
          <p className="err mt12" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className={`save${pending ? " busy" : ""}`} disabled={pending || !lines.length}>
          {pending ? "Creating order…" : "Create order"}
        </button>
        <p className="hint mt12">Cash on delivery. The server re-prices everything from the catalog.</p>
      </aside>
    </form>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <span className="err">{error}</span> : null}
    </div>
  );
}
