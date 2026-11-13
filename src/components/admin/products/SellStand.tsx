"use client";
// "Sell this stand" — the walk-in sale at a client's counter, one screen on an iPhone: the stock stand (or the code
// printed under its QR) → an existing client or a new one (business, contact, phone) → their Google review link →
// record the sale (paid in person / the client's open order / no record) → Sell. One server action, one transaction.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { sellOptionsAction, sellStandAction, type SellStandResult } from "@/app/(admin)/admin/actions";
import { normalizePhone } from "@/lib/business";
import { guessDestinationType, reconcileDestinationType } from "@/lib/destination-type";
import { normalizeDestination } from "../destinations";
import { customerDisplay, displayLink, fmtPhone } from "../format";
import { DEST_META, kindNoun, ORDER_STATUS_META, standHref } from "../meta";
import { useToast } from "../toast";
import type { CustomerOption, DestinationType, FindResponse, OrderStatus, StandHit, TagKind } from "../types";
import CustomerPicker from "./CustomerPicker";

type Stand = { id: number; code: string; product: string; kind: TagKind };
type Options = {
  price: number | null;
  /** `replace`: the order's unprinted code this stand replaces when handed over for it. */
  openOrders: { id: number; number: string; status: string; missing: number; replace: string | null }[];
  knownUrl: string | null;
};

/** 59000 → "59", 12500 → "12.5". */
const dtText = (millimes: number) => String(Math.round(millimes) / 1000);

export default function SellStand({
  stand: fixedStand,
  customers,
  fixedCustomer,
  defaultUrl = "",
  onSold,
  title,
}: {
  /** The stock stand being sold; null = type its code (customer page). */
  stand: Stand | null;
  customers: CustomerOption[];
  /** Selling to this client (customer page): no client step. */
  fixedCustomer?: CustomerOption;
  /** Pre-filled destination (e.g. the client's other stand). */
  defaultUrl?: string;
  onSold?: (r: SellStandResult) => void;
  title?: string;
}) {
  const toast = useToast();
  const uid = useId();
  // Stand found by its code (customer page)
  const [code, setCode] = useState("");
  /** `q`: the input the result belongs to — a result for an earlier input is never sold. */
  const [found, setFound] = useState<{ q: string; stand: Stand | null; note: string | null; suggestions: StandHit[] }>({ q: "", stand: null, note: null, suggestions: [] });
  const stand = fixedStand ?? found.stand;
  // Client
  const [who, setWho] = useState<"existing" | "new">(fixedCustomer || customers.length ? "existing" : "new");
  const [customerId, setCustomerId] = useState<number | null>(fixedCustomer?.id ?? null);
  const [pickerText, setPickerText] = useState("");
  const [biz, setBiz] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  // Destination
  const [url, setUrl] = useState(defaultUrl);
  /** The link was typed / pasted by hand (never replaced by the client's known link). */
  const [urlTouched, setUrlTouched] = useState(false);
  /** The link shown was pre-filled from what we know about the client. */
  const [urlKnown, setUrlKnown] = useState(false);
  // Sale
  const [options, setOptions] = useState<Options | null>(null);
  /** Which stand + client `options` belong to ("<standId>:<customerId>"); Sell waits until it matches. */
  const [optsKey, setOptsKey] = useState<string | null>(null);
  /** "<standId>:<customerId>#<try>" whose options failed to load (Retry bumps the try). */
  const [optsFailedKey, setOptsFailedKey] = useState<string | null>(null);
  const [optsTry, setOptsTry] = useState(0);
  const [sale, setSale] = useState<string>("new");
  const [price, setPrice] = useState("");
  const [priceTouched, setPriceTouched] = useState(false);
  // Submit
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const codeReq = useRef(0);

  const cid = fixedCustomer?.id ?? (who === "existing" ? customerId : null);
  const buyer = fixedCustomer ?? (cid ? customers.find((c) => c.id === cid) : undefined);

  // Default price + the client's open orders waiting for this product.
  const standId = stand?.id ?? null;
  const wantKey = `${standId}:${cid}`;
  // Sell waits for the options of this stand + client: a quick tap must never record a new sale while the client's
  // waiting order is still loading.
  const optsReady = optsKey === wantKey;
  const optsFailed = optsFailedKey === `${wantKey}#${optsTry}`;
  useEffect(() => {
    if (!standId) return;
    let live = true;
    const key = `${standId}:${cid}`;
    const failKey = `${key}#${optsTry}`;
    sellOptionsAction({ tagId: standId, customerId: cid })
      .then((res) => {
        if (!live) return;
        if (!res.ok) {
          setOptsFailedKey(failKey);
          return;
        }
        setOptions(res.data);
        setSale(res.data.openOrders.length ? `order:${res.data.openOrders[0].id}` : "new");
        if (!priceTouched && res.data.price != null) setPrice(dtText(res.data.price));
        // The client's known review link (their other stand / their order) — unless the owner typed one.
        if (!urlTouched && !defaultUrl) {
          setUrl(res.data.knownUrl ?? "");
          setUrlKnown(Boolean(res.data.knownUrl));
        }
        setOptsKey(key);
      })
      .catch(() => {
        if (live) setOptsFailedKey(failKey);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when the stand or the client changes (or Retry)
  }, [standId, cid, optsTry]);

  // Customer page: find the stock stand from the typed code.
  async function lookup(raw: string) {
    const v = raw.trim();
    const id = ++codeReq.current;
    // Forget the previous code's stand at once: Sell stays off until this input is checked.
    setFound({ q: raw, stand: null, note: null, suggestions: [] });
    if (v.replace(/[^A-Za-z0-9]/g, "").length < 6) return;
    try {
      const r = await fetch(`/api/admin/find?q=${encodeURIComponent(v)}`, { cache: "no-store" });
      const data = (await r.json()) as FindResponse;
      if (id !== codeReq.current) return;
      const x = data.exact;
      if (x && x.stock) {
        const notes = [
          data.readAs && data.readAs !== data.code ? `Read as ${x.code}.` : null,
          data.lookalikes.length ? `Check the print: ${data.lookalikes.map((s) => s.code).join(", ")} look${data.lookalikes.length === 1 ? "s" : ""} almost the same.` : null,
        ].filter(Boolean);
        setFound({ q: raw, stand: { id: x.id, code: x.code, product: x.product, kind: x.kind }, note: notes.length ? notes.join(" ") : null, suggestions: [] });
      } else if (x) {
        setFound({ q: raw, stand: null, note: `${x.code} is not in stock — it belongs to ${x.customerName ?? "another link"}.`, suggestions: [] });
      } else {
        setFound({
          q: raw,
          stand: null,
          note: `No stand has the code ${data.code}. Check the print, or tap the stand: the page shows its code.`,
          suggestions: data.suggestions.filter((s) => s.stock),
        });
      }
    } catch {
      if (id === codeReq.current) setFound({ q: raw, stand: null, note: "Couldn’t check the code — try again.", suggestions: [] });
    }
  }

  // Destination preview: the type follows the pasted link (Google review link by default).
  const dest = useMemo(() => {
    const v = url.trim();
    if (!v) return null;
    const guessed = guessDestinationType(/^[a-z]+:/i.test(v) ? v : `https://${v}`) as DestinationType;
    const picked: DestinationType = guessed === "website" || guessed === "custom" ? "google_review" : guessed;
    const n = normalizeDestination(picked, v);
    if (!n.ok) return { ok: false as const, error: n.error };
    return { ok: true as const, url: n.url, type: reconcileDestinationType(picked, n.url) as DestinationType };
  }, [url]);

  const newPhoneOk = Boolean(normalizePhone(phone));
  // A "new" client whose phone is already a customer: offer that customer (their open orders and review link come with it).
  const phoneMatch = useMemo(() => {
    const p = normalizePhone(phone);
    return p ? (customers.find((c) => c.phone === p) ?? null) : null;
  }, [phone, customers]);

  async function submit() {
    setError(null);
    setFields({});
    if (!stand) return setError(fixedStand ? "This stand is no longer available." : "Type the code printed under the QR first.");
    if (!fixedStand && found.q !== code) return setError("Checking the code…");
    if (!optsReady) return setError(optsFailed ? "Couldn’t load the sale options — tap Retry." : "Loading the client’s orders…");
    if (!fixedCustomer && who === "existing" && !customerId) {
      return setError(pickerText.trim() ? `“${pickerText.trim()}” isn’t a client yet — pick one from the list, or switch to New client.` : "Pick the client, or switch to New client.");
    }
    if (!fixedCustomer && who === "new") {
      const f: Record<string, string> = {};
      if (!biz.trim() && !name.trim()) f.biz = "Enter the business or contact name.";
      if (!newPhoneOk) f.phone = "Enter a valid Tunisian number (8 digits).";
      if (Object.keys(f).length) {
        setFields(f);
        return setError(Object.values(f)[0]);
      }
    }
    if (dest && !dest.ok) return setError(dest.error);
    const forOrder = sale.startsWith("order:") ? options?.openOrders.find((o) => o.id === Number(sale.slice(6))) : undefined;
    const saleInput =
      sale === "none"
        ? { mode: "none" as const }
        : forOrder
          ? { mode: "order" as const, orderId: forOrder.id, replace: forOrder.replace ?? undefined }
          : sale.startsWith("order:")
            ? { mode: "order" as const, orderId: Number(sale.slice(6)) }
            : { mode: "new" as const, price };
    setPending(true);
    const res = await sellStandAction({
      tagId: stand.id,
      customerId: cid ?? undefined,
      newCustomer: !cid ? { businessName: biz.trim() || undefined, name: name.trim() || undefined, phone } : undefined,
      destinationUrl: dest?.ok ? dest.url : undefined,
      destinationType: dest?.ok ? dest.type : undefined,
      sale: saleInput,
    });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      setFields(res.fields ?? {});
      return;
    }
    const d = res.data;
    const who2 = customerDisplay(d.customer);
    toast.ok(
      `${d.tag.code} sold to ${who2}`,
      [
        d.matchedByPhone ? `Phone already known — linked to the existing client ${who2}.` : d.createdCustomer ? "New client created." : null,
        d.order
          ? saleInput.mode === "order"
            ? `Handed over for order ${d.order.number}${forOrder?.replace ? ` (replaces ${forOrder.replace})` : ""} — no new sale.`
            : `Sale ${d.order.number} recorded.`
          : null,
        d.tag.destinationUrl ? "Tap the stand with your phone to check it opens their page." : "Add their Google review link to make it live.",
      ]
        .filter(Boolean)
        .join(" "),
    );
    setCode("");
    setFound({ q: "", stand: null, note: null, suggestions: [] });
    setUrl(defaultUrl);
    setUrlTouched(false);
    setUrlKnown(false);
    setBiz("");
    setName("");
    setPhone("");
    onSold?.(d);
  }

  const kind = stand?.kind ?? "stand";
  return (
    <form
      className="sell"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      noValidate
    >
      <h4>{title ?? (stand ? `Sell ${stand.code}` : "Sell a stock stand")}</h4>

      {!fixedStand ? (
        <div className="field">
          <label htmlFor={`${uid}-code`}>Code under the QR</label>
          <input
            id={`${uid}-code`}
            className={`input mono${found.note && !found.stand ? " bad" : ""}`}
            style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
            value={code}
            maxLength={20}
            placeholder="GJUHPR"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => {
              setCode(e.target.value);
              void lookup(e.target.value);
            }}
          />
          {found.stand ? (
            <div className="found">
              <b>{found.stand.code}</b>
              <span className="grow">
                {found.stand.product} · in stock{found.note ? ` · ${found.note}` : ""}
              </span>
              <a className="linkbtn" href={standHref(found.stand.code)}>
                Open
              </a>
            </div>
          ) : found.note ? (
            <span className="err" role="alert">
              {found.note}
              {found.suggestions.length ? (
                <>
                  {" "}
                  In stock:{" "}
                  {found.suggestions.map((s, i) => (
                    <span key={s.id}>
                      {i ? ", " : ""}
                      <button type="button" className="linkbtn" onClick={() => (setCode(s.code), void lookup(s.code))}>
                        {s.code}
                      </button>
                    </span>
                  ))}
                  ?
                </>
              ) : null}
            </span>
          ) : (
            <span className="hint">Or tap the stand with your phone: the page that opens shows its code.</span>
          )}
        </div>
      ) : null}

      {!fixedCustomer ? (
        <>
          <div className="seg full" style={{ gridTemplateColumns: "1fr 1fr" }} role="tablist" aria-label="Client">
            <button type="button" role="tab" aria-selected={who === "existing"} className={who === "existing" ? "on" : undefined} onClick={() => setWho("existing")}>
              Existing client
            </button>
            <button type="button" role="tab" aria-selected={who === "new"} className={who === "new" ? "on" : undefined} onClick={() => setWho("new")}>
              + New client
            </button>
          </div>
          {who === "existing" ? (
            <div className="field">
              <label htmlFor={`${uid}-cust`}>Client</label>
              <CustomerPicker
                id={`${uid}-cust`}
                customers={customers}
                value={customerId}
                onChange={(v) => {
                  setCustomerId(v);
                  setError(null);
                }}
                onPendingText={setPickerText}
                onCreate={(text) => {
                  setWho("new");
                  setBiz(text);
                }}
              />
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor={`${uid}-biz`}>Business name</label>
                <input
                  id={`${uid}-biz`}
                  className={`input${fields.biz ? " bad" : ""}`}
                  value={biz}
                  maxLength={120}
                  placeholder="Café Lumière"
                  autoComplete="organization"
                  onChange={(e) => setBiz(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor={`${uid}-name`}>Contact name</label>
                <input id={`${uid}-name`} className="input" value={name} maxLength={120} placeholder="Optional — e.g. Sami" autoComplete="name" onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor={`${uid}-phone`}>Phone</label>
                <div className="affix pre">
                  <span>+216</span>
                  <input
                    id={`${uid}-phone`}
                    className={`input${fields.phone || fields["newCustomer.phone"] ? " bad" : ""}`}
                    value={phone}
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="25 875 529"
                    maxLength={20}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                {phoneMatch ? (
                  <span className="notice mt8" role="note">
                    <span>
                      <b>{customerDisplay(phoneMatch)}</b> already has this number.{" "}
                      <button
                        type="button"
                        className="linkbtn"
                        onClick={() => {
                          setWho("existing");
                          setCustomerId(phoneMatch.id);
                          setPickerText("");
                          setFields({});
                          setError(null);
                        }}
                      >
                        Sell to {customerDisplay(phoneMatch)} →
                      </button>
                    </span>
                  </span>
                ) : (
                  <span className="hint">A phone already in Customers links to that client instead of creating a second one.</span>
                )}
              </div>
            </>
          )}
        </>
      ) : null}

      <div className="field">
        <label htmlFor={`${uid}-url`}>Google review link</label>
        <input
          id={`${uid}-url`}
          className={`input${dest && !dest.ok ? " bad" : ""}`}
          value={url}
          placeholder={DEST_META.google_review.placeholder}
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => {
            setUrl(e.target.value);
            setUrlTouched(true);
            setUrlKnown(false);
          }}
        />
        <span className={dest && !dest.ok ? "err" : "hint"}>
          {dest && !dest.ok ? (
            dest.error
          ) : dest?.ok ? (
            <>
              Taps will open <span className="mono vio3">{displayLink(dest.url)}</span> · {DEST_META[dest.type].label}
              {urlKnown ? " — the link we already have for this client" : ""}
            </>
          ) : (
            <>Optional now. Client’s Google Business Profile → Ask for reviews → Copy link. Until it is set, taps show “not activated yet”.</>
          )}
        </span>
      </div>

      {stand ? (
        <div className="field">
          <span className="flabel">Sale</span>
          <div className="radio-list" role="radiogroup" aria-label="Sale">
            {!optsReady && !optsFailed ? <span className="hint">Checking this client’s orders…</span> : null}
            {(optsReady ? (options?.openOrders ?? []) : []).map((o) => (
              <label className="radio" key={o.id}>
                <input type="radio" name={`${uid}-sale`} checked={sale === `order:${o.id}`} onChange={() => setSale(`order:${o.id}`)} />
                <span>
                  Hand over for order <b>{o.number}</b>
                  {o.replace ? (
                    <>
                      {" "}
                      — replaces unprinted code <b className="mono">{o.replace}</b>
                    </>
                  ) : null}
                  <small>
                    {ORDER_STATUS_META[o.status as OrderStatus]?.label ?? o.status} · waiting for {o.missing} {kindNoun(kind)}
                    {o.missing === 1 ? "" : "s"} — no new sale recorded
                    {o.replace ? ` · ${o.replace} was never printed, tapped or written: it is deleted, this stand takes its place` : ""}
                  </small>
                </span>
              </label>
            ))}
            <label className="radio">
              <input type="radio" name={`${uid}-sale`} checked={sale === "new"} onChange={() => setSale("new")} />
              <span>
                Paid in person now
                <small>Records a delivered sale (no delivery fee) in Orders and revenue.</small>
                {sale === "new" ? (
                  <span className="price affix">
                    <input
                      className={`input${fields.price ? " bad" : ""}`}
                      inputMode="decimal"
                      value={price}
                      aria-label="Price paid in DT"
                      onChange={(e) => {
                        setPrice(e.target.value);
                        setPriceTouched(true);
                      }}
                    />
                    <span>DT</span>
                  </span>
                ) : null}
              </span>
            </label>
            <label className="radio">
              <input type="radio" name={`${uid}-sale`} checked={sale === "none"} onChange={() => setSale("none")} />
              <span>
                Don’t record a sale
                <small>Gift, trial, or already paid elsewhere.</small>
              </span>
            </label>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="err mt12" role="alert">
          {error}
        </p>
      ) : null}
      {stand && optsFailed && !optsReady ? (
        <p className="err mt12" role="alert">
          Couldn’t load this client’s orders and price.{" "}
          <button type="button" className="linkbtn" onClick={() => setOptsTry((n) => n + 1)}>
            Retry
          </button>
        </p>
      ) : null}
      <button type="submit" className={`save${pending ? " busy" : ""}`} disabled={pending || (!fixedStand && (!found.stand || found.q !== code)) || (Boolean(stand) && !optsReady)}>
        {pending
          ? "Selling…"
          : stand && !optsReady
            ? optsFailed
              ? "Sell"
              : "Loading…"
            : stand
            ? `Sell ${stand.code}${buyer ? ` to ${customerDisplay(buyer)}` : who === "new" && (biz.trim() || name.trim()) ? ` to ${biz.trim() || name.trim()}` : ""}`
            : "Sell"}
      </button>
      {buyer && !fixedCustomer ? (
        <p className="hint" style={{ marginTop: 8, textAlign: "center" }}>
          {customerDisplay(buyer)} · +216 {fmtPhone(buyer.phone)}
        </p>
      ) : null}
    </form>
  );
}
