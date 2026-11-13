"use client";
// Checkout: delivery form (+216 phone with live validation, governorate select, honeypot) and a live order summary.
// Recognized returning customers (GET /api/discount) get "Bon retour ! −10 % appliqués" with a price-strike animation.
// Submit → POST /api/orders → /order/[number]. "Commander sur WhatsApp" sends the same order as a message
// (and records it first, channel "whatsapp", when the form is complete). Both buttons sit under the terms/privacy
// acceptance line, which links the two legal documents.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import clsx from "clsx";
import { cart, useCart } from "@/lib/cart";
import { formatDT, GOVERNORATES, normalizePhone, priceOrder } from "@/lib/business";
import type { Locale } from "@/i18n/config";
import { fmt, getShopMessages } from "./messages";
import type { ShopSettings } from "./rules";
import { useShopSettings } from "./useShopSettings";
import { buildOrderMessage, waHref } from "./whatsapp";
import AnimatedPrice from "./AnimatedPrice";
import FreeDeliveryBar from "./FreeDeliveryBar";
import ProductImage from "./ProductImage";
import WhatsAppOrderButton from "./WhatsAppOrderButton";
import { ArrowRightIcon, BagIcon, CheckIcon, ChevronDownIcon, ShieldIcon, SparkleIcon } from "./Icons";
import { BTN_PRIMARY } from "./ui";

export type CheckoutCatalogEntry = { id: number; name: string; price: number; image: string };
type Props = { locale: Locale; settings: ShopSettings; catalog: CheckoutCatalogEntry[] };

const FIELDS = ["name", "phone", "email", "businessName", "governorate", "city", "address", "notes"] as const;
type Field = (typeof FIELDS)[number];
type Form = Record<Field, string> & { website: string };
type Errors = Partial<Record<Field, string>>;

const EMPTY: Form = { name: "", phone: "", email: "", businessName: "", governorate: "", city: "", address: "", notes: "", website: "" };
const DRAFT_KEY = "onde-checkout-draft-v1";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX: Record<Field, number> = { name: 120, phone: 20, email: 200, businessName: 120, governorate: 40, city: 80, address: 300, notes: 1000 };
const noopSubscribe = () => () => {};

function readDraft(): Form {
  if (typeof window === "undefined") return EMPTY;
  let draft: Partial<Form> = {};
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (raw) draft = JSON.parse(raw) as Partial<Form>;
  } catch {
    /* storage unavailable */
  }
  const form: Form = { ...EMPTY };
  for (const f of FIELDS) if (typeof draft[f] === "string") form[f] = draft[f] as string;
  if (!form.businessName) form.businessName = cart.get().items.find((i) => i.businessName)?.businessName ?? "";
  return form;
}

const formatPhone = (p: string) => `${p.slice(0, 2)} ${p.slice(2, 5)} ${p.slice(5)}`;

export default function CheckoutClient({ locale, settings: initialSettings, catalog }: Props) {
  const t = getShopMessages(locale);
  const tc = t.checkout;
  const router = useRouter();
  const reduce = useReducedMotion();
  const uid = useId();
  const settings = useShopSettings(initialSettings);
  const { items } = useCart();
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const [form, setForm] = useState<Form>(readDraft);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "wa-saving" | "placed">("idle");
  const [discount, setDiscount] = useState<{ phone: string; state: "checking" | "eligible" | "none"; pct: number } | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  // ---- lines, priced with fresh catalog prices (server re-prices anyway) ----------------------------------------
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const lines = items.map((i) => {
    const fresh = byId.get(i.productId);
    return {
      ...i,
      name: fresh?.name ?? i.name,
      image: fresh?.image ?? i.image,
      unitPrice: fresh?.price ?? i.unitPrice,
      unavailable: catalog.length > 0 && !fresh,
    };
  });
  const orderable = lines.filter((l) => !l.unavailable);
  const hasUnavailable = orderable.length !== lines.length;

  const phone = normalizePhone(form.phone);
  const eligible = !!phone && discount?.phone === phone && discount.state === "eligible";
  const pct = eligible && discount ? discount.pct : settings.rules.returningDiscountPct;
  const rules = { ...settings.rules, returningDiscountPct: pct };
  const priced = priceOrder(orderable, { rules, returningDiscount: eligible });

  // ---- draft persistence (session only; never the honeypot) ------------------------------------------------------
  useEffect(() => {
    if (status === "placed") return;
    try {
      const { website: _hp, ...rest } = form;
      void _hp;
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(rest));
    } catch {
      /* storage unavailable */
    }
  }, [form, status]);

  // ---- returning-customer check -----------------------------------------------------------------------------------
  useEffect(() => {
    if (!phone || settings.rules.returningDiscountPct <= 0) return;
    if (discount?.phone === phone && discount.state !== "checking") return;
    const ctrl = new AbortController();
    const timer = window.setTimeout(async () => {
      setDiscount({ phone, state: "checking", pct: 0 });
      try {
        const r = await fetch(`/api/discount?phone=${encodeURIComponent(phone)}`, { signal: ctrl.signal, cache: "no-store" });
        const j: unknown = r.ok ? await r.json() : null;
        const d = (j && typeof j === "object" ? j : {}) as { eligible?: unknown; pct?: unknown };
        const p = Number(d.pct);
        setDiscount({
          phone,
          state: d.eligible === true ? "eligible" : "none",
          pct: Number.isFinite(p) && p > 0 ? p : settings.rules.returningDiscountPct,
        });
      } catch {
        if (!ctrl.signal.aborted) setDiscount({ phone, state: "none", pct: 0 });
      }
    }, 450);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-check only when the normalized phone changes
  }, [phone]);

  // ---- validation -------------------------------------------------------------------------------------------------
  const validate = (f: Form): Errors => {
    const e: Errors = {};
    if (f.name.trim().length < 2) e.name = tc.errors.name;
    if (!normalizePhone(f.phone)) e.phone = tc.errors.phone;
    if (f.email.trim() && !EMAIL_RE.test(f.email.trim())) e.email = tc.errors.email;
    if (!(GOVERNORATES as readonly string[]).includes(f.governorate)) e.governorate = tc.errors.governorate;
    if (f.city.trim().length < 2) e.city = tc.errors.city;
    if (f.address.trim().length < 5) e.address = tc.errors.address;
    for (const k of FIELDS) if (!e[k] && f[k].trim().length > MAX[k]) e[k] = tc.errors.tooLong;
    return e;
  };
  const clientErrors = validate(form);
  const errorFor = (f: Field): string | undefined =>
    serverErrors[f] ?? (touched[f] || submitted ? clientErrors[f] : undefined);
  const complete = Object.keys(clientErrors).length === 0;

  const set = (f: Field | "website", v: string) => {
    setForm((prev) => ({ ...prev, [f]: v }));
    if (f !== "website" && serverErrors[f]) setServerErrors((s) => ({ ...s, [f]: undefined }));
  };
  const blur = (f: Field) => {
    setTouched((s) => ({ ...s, [f]: true }));
    if (f === "phone" && phone) set("phone", formatPhone(phone));
  };
  const focusField = (f: Field) => {
    const el = document.getElementById(`${uid}-${f}`);
    el?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    (el as HTMLElement | null)?.focus({ preventScroll: true });
  };

  // ---- ordering ---------------------------------------------------------------------------------------------------
  const body = (channel: "web" | "whatsapp") => ({
    items: orderable.map((l) => ({
      productId: l.productId,
      qty: l.qty,
      ...(l.businessName ? { businessName: l.businessName } : {}),
      ...(l.destinationUrl ? { destinationUrl: l.destinationUrl } : {}),
    })),
    customer: {
      name: form.name.trim(),
      phone: phone ?? form.phone,
      email: form.email.trim() || undefined,
      businessName: form.businessName.trim() || undefined,
      governorate: form.governorate,
      city: form.city.trim(),
      address: form.address.trim(),
      notes: form.notes.trim() || undefined,
    },
    locale,
    channel,
    website: form.website,
  });

  const showError = (msg: string) => {
    setFormError(msg);
    requestAnimationFrame(() => errorRef.current?.focus({ preventScroll: false }));
  };

  const handleFailure = (httpStatus: number, j: unknown) => {
    const data = (j && typeof j === "object" ? j : {}) as { error?: unknown; fields?: unknown };
    if (httpStatus === 429) return showError(tc.errors.rate);
    if (data.error === "empty") return showError(tc.errors.empty);
    if (data.error === "closed") return showError(tc.errors.closed);
    if (data.error === "validation" && data.fields && typeof data.fields === "object") {
      const fe: Errors = {};
      let itemIssue = false;
      for (const [path, code] of Object.entries(data.fields as Record<string, unknown>)) {
        const parts = path.split(".");
        if (parts[0] === "items") {
          itemIssue = true;
          continue;
        }
        const key = parts[parts.length - 1] as Field;
        if (!(FIELDS as readonly string[]).includes(key)) continue;
        if (code === "too_long") fe[key] = tc.errors.tooLong;
        else if (key === "phone" || key === "email" || key === "name" || key === "governorate" || key === "city" || key === "address")
          fe[key] = tc.errors[key];
        else fe[key] = tc.errors.generic;
      }
      setServerErrors(fe);
      const first = FIELDS.find((f) => fe[f]);
      if (first) {
        setFormError(itemIssue ? tc.errors.items : tc.errors.summary);
        focusField(first);
      } else showError(itemIssue ? tc.errors.items : tc.errors.server);
      return;
    }
    showError(tc.errors.server);
  };

  const placeOrder = async (channel: "web" | "whatsapp"): Promise<{ number: string } | null> => {
    setStatus(channel === "web" ? "submitting" : "wa-saving");
    setFormError(null);
    try {
      const r = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body(channel)),
      });
      const j: unknown = await r.json().catch(() => null);
      const num = j && typeof j === "object" ? (j as { number?: unknown }).number : undefined;
      if (r.status === 201 && typeof num === "string") return { number: num };
      handleFailure(r.status, j);
    } catch {
      showError(tc.errors.network);
    }
    setStatus("idle");
    return null;
  };

  const finish = (number: string) => {
    setStatus("placed");
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* storage unavailable */
    }
    router.push(`/${locale}/order/${encodeURIComponent(number)}`);
    cart.clear();
  };

  const preflight = (): boolean => {
    setSubmitted(true);
    const errs = validate(form);
    const first = FIELDS.find((f) => errs[f]);
    if (first) {
      setFormError(tc.errors.summary);
      focusField(first);
      return false;
    }
    const blocker = hasUnavailable
      ? tc.errors.items
      : !settings.storeOpen
        ? tc.errors.closed
        : !orderable.length
          ? tc.errors.empty
          : null;
    if (blocker) {
      showError(blocker);
      return false;
    }
    return true;
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (status !== "idle" || !preflight()) return;
    const res = await placeOrder("web");
    if (res) finish(res.number);
  };

  const customer = {
    name: form.name,
    phone: phone ?? form.phone,
    email: form.email,
    businessName: form.businessName,
    governorate: form.governorate,
    city: form.city,
    address: form.address,
    notes: form.notes,
  };
  const recordable = complete && !hasUnavailable && settings.storeOpen && orderable.length > 0;

  const onWhatsApp = async (e: MouseEvent<HTMLAnchorElement>) => {
    if (!recordable || status !== "idle") {
      if (status !== "idle") e.preventDefault();
      return; // the link opens WhatsApp with whatever is filled in
    }
    e.preventDefault();
    const popup = window.open("", "_blank");
    const res = await placeOrder("whatsapp");
    if (!res) {
      popup?.close();
      return;
    }
    const href = waHref(
      settings.whatsapp,
      buildOrderMessage({ lines: orderable, locale, rules, t: t.whatsapp, returningDiscount: eligible, customer, orderNumber: res.number }),
    );
    if (popup) {
      popup.opener = null;
      popup.location.href = href;
    }
    finish(res.number);
  };

  // ---- render -----------------------------------------------------------------------------------------------------
  if (!hydrated) return <Skeleton />;

  if (status === "placed") {
    return (
      <div className="grid min-h-[50vh] place-items-center text-center" role="status" aria-live="polite">
        <div>
          <div className="mx-auto grid size-24 place-items-center rounded-full bg-ok/15 text-ok ring-1 ring-ok/30">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <motion.path
                d="m5 12.5 4.2 4.2L19 7"
                stroke="currentColor"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: reduce ? 1 : 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </svg>
          </div>
          <p className="mt-6 font-display text-2xl font-bold">{tc.placed}</p>
        </div>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <div className="mx-auto grid size-20 place-items-center rounded-full bg-violet/20 text-violet-3 shadow-[0_0_60px_rgba(70,28,247,0.45)]">
          <BagIcon size={34} />
        </div>
        <h2 className="mt-8 font-display text-3xl font-bold tracking-[-0.03em]">{tc.emptyTitle}</h2>
        <p className="mt-3 text-muted">{tc.emptyBody}</p>
        <Link href={`/${locale}/shop`} className={clsx(BTN_PRIMARY, "mt-8 h-14 px-8")}>
          {tc.emptyCta}
          <ArrowRightIcon size={18} />
        </Link>
      </div>
    );
  }

  const busy = status !== "idle";
  // The "fix these fields" summary disappears by itself once every field is valid again.
  const visibleError =
    formError === tc.errors.summary && complete && !Object.values(serverErrors).some(Boolean) ? null : formError;
  const itemCount = orderable.reduce((n, l) => n + l.qty, 0);

  const summary = (
    <div className="rounded-[28px] border border-white/[0.08] bg-panel/60 p-5 backdrop-blur-xl sm:p-7">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-xl font-bold tracking-[-0.02em]">{tc.summaryTitle}</h2>
        <button
          type="button"
          onClick={() => cart.open(true)}
          className="text-sm font-medium text-violet-3 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-2"
        >
          {tc.edit}
        </button>
      </div>

      <ul className="mt-5 space-y-3">
        {lines.map((l) => (
          <li key={`${l.productId}|${l.businessName ?? ""}|${l.destinationUrl ?? ""}`} className="flex items-center gap-3">
            <div className="relative grid size-16 shrink-0 place-items-center rounded-2xl bg-[radial-gradient(circle_at_50%_70%,rgba(123,92,255,0.28),transparent_70%)]">
              <ProductImage src={l.image} alt="" width={64} height={64} className="size-14 object-contain" />
              <span className="absolute -right-1.5 -top-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-violet px-1.5 text-xs font-bold text-white">
                {l.qty}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className={clsx("truncate text-sm font-semibold", l.unavailable && "text-muted line-through")}>{l.name}</p>
              {l.unavailable ? (
                <p className="text-xs font-medium text-off">{tc.errors.unavailable}</p>
              ) : (
                <p className="truncate text-xs text-muted">
                  {[l.businessName, l.destinationUrl && hostOf(l.destinationUrl)].filter(Boolean).join(" · ") ||
                    fmt(t.summary.each, { price: formatDT(l.unitPrice, locale) })}
                </p>
              )}
            </div>
            <p className="text-sm font-semibold tabular-nums">{formatDT(l.unitPrice * l.qty, locale)}</p>
          </li>
        ))}
      </ul>

      <FreeDeliveryBar
        subtotal={priced.subtotal}
        threshold={settings.rules.freeDeliveryThreshold}
        locale={locale}
        t={t.freeDelivery}
        className="mt-6"
      />

      <dl className="mt-6 space-y-2.5 border-t border-white/[0.07] pt-5 text-sm">
        <div className="flex justify-between text-muted">
          <dt>{itemCount === 1 ? t.summary.itemsOne : fmt(t.summary.items, { count: itemCount })}</dt>
          <dd className="relative text-text">
            <AnimatedPrice value={priced.subtotal} locale={locale} className={clsx(eligible && "text-muted")} />
            <AnimatePresence>
              {eligible && (
                <motion.span
                  aria-hidden="true"
                  className="absolute inset-x-[-2px] top-1/2 h-[2px] origin-left rounded-full bg-violet-3"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  exit={{ scaleX: 0, transition: { duration: 0.2 } }}
                  transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
                />
              )}
            </AnimatePresence>
          </dd>
        </div>
        <AnimatePresence initial={false}>
          {eligible && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="flex justify-between font-medium text-violet-3">
                <dt>{fmt(t.summary.discount, { pct })}</dt>
                <dd className="tabular-nums">−{formatDT(priced.discount, locale)}</dd>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex justify-between text-muted">
          <dt>{t.summary.delivery}</dt>
          <dd className={priced.deliveryFee === 0 ? "font-medium text-ok" : "text-text"}>
            {priced.deliveryFee === 0 ? t.summary.free : formatDT(priced.deliveryFee, locale)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between border-t border-white/[0.07] pt-4">
          <dt className="font-display text-lg font-semibold">{t.summary.total}</dt>
          <dd className="font-display text-3xl font-bold tracking-[-0.03em]">
            <AnimatedPrice value={priced.total} locale={locale} />
          </dd>
        </div>
        <p className="text-right text-xs text-muted">{t.summary.cod}</p>
      </dl>
    </div>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-14">
      {/* summary — first on mobile (collapsible), sticky right column on desktop */}
      <aside className="lg:order-2 lg:sticky lg:top-28 lg:self-start" aria-label={tc.summaryTitle}>
        <button
          type="button"
          onClick={() => setSummaryOpen((v) => !v)}
          aria-expanded={summaryOpen}
          aria-controls={`${uid}-summary`}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-panel/60 px-5 py-4 text-left lg:hidden"
        >
          <span className="inline-flex items-center gap-2 text-sm font-medium text-violet-3">
            {summaryOpen ? tc.hideSummary : tc.showSummary}
            <ChevronDownIcon size={16} className={clsx("transition-transform duration-300", summaryOpen && "rotate-180")} />
          </span>
          <span className="font-display text-lg font-bold">
            <AnimatedPrice value={priced.total} locale={locale} />
          </span>
        </button>
        <div
          id={`${uid}-summary`}
          className={clsx(
            "grid transition-[grid-template-rows] duration-500 ease-expo lg:grid-rows-[1fr]",
            summaryOpen ? "mt-3 grid-rows-[1fr] lg:mt-0" : "grid-rows-[0fr]",
          )}
        >
          <div className={clsx("min-h-0 overflow-hidden lg:overflow-visible", !summaryOpen && "max-lg:invisible")}>{summary}</div>
        </div>
      </aside>

      {/* form */}
      <form noValidate onSubmit={onSubmit} className="relative lg:order-1" aria-describedby={visibleError ? `${uid}-form-error` : undefined}>
        {!settings.storeOpen && (
          <div className="mb-6 rounded-2xl border border-gold/30 bg-gold/10 px-5 py-4 text-sm text-gold" role="note">
            {tc.closedBanner}
          </div>
        )}

        <Fieldset title={tc.contactTitle} index={1}>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField uid={uid} f="name" label={tc.name} placeholder={tc.namePlaceholder} autoComplete="name" form={form} set={set} blur={blur} error={errorFor("name")} className="sm:col-span-2" />
            <div className="sm:col-span-2">
              <FieldShell uid={uid} f="phone" label={tc.phone} error={errorFor("phone")} help={tc.phoneHelp}>
                {(describedBy, invalid) => (
                  <div
                    className={clsx(
                      "flex items-stretch overflow-hidden rounded-2xl border bg-ink/60 transition-[border-color,box-shadow] duration-300",
                      "focus-within:shadow-[0_0_0_4px_rgba(123,92,255,0.18)]",
                      invalid ? "border-off focus-within:border-off" : "border-white/10 focus-within:border-violet-2",
                    )}
                  >
                    <span className="flex items-center border-r border-white/10 px-4 text-[15px] font-medium text-muted" aria-hidden="true">
                      +216
                    </span>
                    <input
                      id={`${uid}-phone`}
                      name="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      required
                      value={form.phone}
                      onChange={(e) => set("phone", e.target.value)}
                      onBlur={() => blur("phone")}
                      maxLength={MAX.phone}
                      placeholder={tc.phonePlaceholder}
                      aria-invalid={invalid || undefined}
                      aria-describedby={describedBy}
                      className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-[15px] tracking-wide text-text outline-none placeholder:text-muted/60"
                    />
                    <AnimatePresence>
                      {phone && (
                        <motion.span
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          className="mr-3 grid size-7 place-self-center place-items-center rounded-full bg-ok/15 text-ok"
                          aria-hidden="true"
                        >
                          <CheckIcon size={15} strokeWidth={2.6} />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </FieldShell>
              <ReturningBanner
                state={phone && discount?.phone === phone ? discount.state : null}
                pct={pct}
                title={tc.returningTitle}
                body={tc.returningBody}
                checking={tc.checking}
              />
            </div>
            <TextField uid={uid} f="email" type="email" label={tc.email} optional={tc.optional} placeholder={tc.emailPlaceholder} autoComplete="email" form={form} set={set} blur={blur} error={errorFor("email")} />
            <TextField uid={uid} f="businessName" label={tc.business} optional={tc.optional} placeholder={tc.businessPlaceholder} autoComplete="organization" form={form} set={set} blur={blur} error={errorFor("businessName")} />
          </div>
        </Fieldset>

        <Fieldset title={tc.deliveryTitle} index={2}>
          <div className="grid gap-5 sm:grid-cols-2">
            <FieldShell uid={uid} f="governorate" label={tc.governorate} error={errorFor("governorate")}>
              {(describedBy, invalid) => (
                <div className="relative">
                  <select
                    id={`${uid}-governorate`}
                    name="governorate"
                    autoComplete="address-level1"
                    required
                    value={form.governorate}
                    onChange={(e) => {
                      set("governorate", e.target.value);
                      setTouched((s) => ({ ...s, governorate: true }));
                    }}
                    onBlur={() => blur("governorate")}
                    aria-invalid={invalid || undefined}
                    aria-describedby={describedBy}
                    className={clsx(inputCls(invalid), "appearance-none pr-11", !form.governorate && "text-muted/80")}
                  >
                    <option value="" disabled>
                      {tc.governoratePlaceholder}
                    </option>
                    {GOVERNORATES.map((g) => (
                      <option key={g} value={g} className="bg-ink-2 text-text">
                        {g}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted" />
                </div>
              )}
            </FieldShell>
            <TextField uid={uid} f="city" label={tc.city} placeholder={tc.cityPlaceholder} autoComplete="address-level2" form={form} set={set} blur={blur} error={errorFor("city")} />
            <TextField uid={uid} f="address" label={tc.address} placeholder={tc.addressPlaceholder} autoComplete="street-address" form={form} set={set} blur={blur} error={errorFor("address")} className="sm:col-span-2" />
            <TextField uid={uid} f="notes" multiline label={tc.notes} optional={tc.optional} placeholder={tc.notesPlaceholder} autoComplete="off" form={form} set={set} blur={blur} error={errorFor("notes")} className="sm:col-span-2" />
          </div>
        </Fieldset>

        {/* honeypot — hidden from people and assistive tech; bots fill it */}
        <div aria-hidden="true" className="absolute -left-[10000px] top-auto size-px overflow-hidden">
          <label htmlFor={`${uid}-website`}>{tc.honeypot}</label>
          <input
            id={`${uid}-website`}
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(e) => set("website", e.target.value)}
          />
        </div>

        <AnimatePresence>
          {visibleError && (
            <motion.div
              ref={errorRef}
              id={`${uid}-form-error`}
              role="alert"
              tabIndex={-1}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-6 overflow-hidden rounded-2xl border border-off/35 bg-off/10 px-5 py-4 text-sm font-medium text-[#ff9aa6] outline-none"
            >
              {visibleError}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-8">
          <p className="mb-4 text-center text-xs leading-relaxed text-muted">
            {withLinks(tc.legalConsent, {
              terms: (
                <Link href={`/${locale}/legal/terms`} target="_blank" className={LEGAL_LINK}>
                  {tc.legalTerms}
                </Link>
              ),
              privacy: (
                <Link href={`/${locale}/legal/privacy`} target="_blank" className={LEGAL_LINK}>
                  {tc.legalPrivacy}
                </Link>
              ),
            })}
          </p>
          <motion.button
            type="submit"
            disabled={busy || !settings.storeOpen}
            whileTap={reduce || busy ? undefined : { scale: 0.98 }}
            className={clsx(BTN_PRIMARY, "group/submit h-16 w-full px-8 text-base")}
          >
            <span
              aria-hidden="true"
              className="absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-expo group-hover/submit:translate-x-[420%]"
            />
            {status === "submitting" ? (
              <>
                <span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-white border-r-transparent" />
                {tc.submitting}
              </>
            ) : (
              <>
                {tc.submit}
                <span aria-hidden="true" className="h-5 w-px bg-white/30" />
                <AnimatedPrice value={priced.total} locale={locale} />
                <ArrowRightIcon size={18} className="transition-transform duration-300 group-hover/submit:translate-x-1" />
              </>
            )}
          </motion.button>
          <p className="mt-3 flex items-center justify-center gap-2 text-center text-sm text-muted">
            <ShieldIcon size={16} className="text-ok" />
            {tc.noPayNow}
          </p>

          <div className="my-7 flex items-center gap-4 text-xs uppercase tracking-[0.3em] text-muted" aria-hidden="true">
            <span className="h-px flex-1 bg-white/10" />
            {tc.or}
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <WhatsAppOrderButton
            locale={locale}
            settings={initialSettings}
            items={orderable}
            customer={customer}
            returningDiscount={eligible}
            discountPct={pct}
            onClick={onWhatsApp}
            busyLabel={status === "wa-saving" ? tc.whatsappSaving : null}
            className="h-14 w-full text-base"
          />
          <p className="mt-3 text-center text-xs leading-relaxed text-muted">
            {recordable ? tc.whatsappRecorded : tc.whatsappHint}
          </p>
          <p className="mt-8 text-center text-xs text-muted/80">{tc.privacy}</p>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------

const LEGAL_LINK =
  "text-text underline decoration-white/30 underline-offset-2 transition-colors hover:text-white hover:decoration-violet-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-2";

/** "{terms}"-style placeholders → React nodes, so a translated sentence can carry inline links. */
function withLinks(template: string, nodes: Record<string, ReactNode>): ReactNode[] {
  return template.split(/(\{\w+\})/g).map((part, i) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1];
    return key && key in nodes ? <Fragment key={i}>{nodes[key]}</Fragment> : part;
  });
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const inputCls = (invalid: boolean) =>
  clsx(
    "w-full rounded-2xl border bg-ink/60 px-4 py-3.5 text-[15px] text-text outline-none transition-[border-color,box-shadow] duration-300 placeholder:text-muted/60",
    "focus:shadow-[0_0_0_4px_rgba(123,92,255,0.18)]",
    invalid ? "border-off focus:border-off" : "border-white/10 focus:border-violet-2",
  );

function Fieldset({ title, index, children }: { title: string; index: number; children: ReactNode }) {
  return (
    <fieldset className="mt-8 rounded-[28px] border border-white/[0.08] bg-panel/40 p-5 first:mt-0 sm:p-7">
      <legend className="sr-only">{title}</legend>
      <div className="mb-6 flex items-center gap-3" aria-hidden="true">
        <span className="grid size-8 place-items-center rounded-full bg-violet font-display text-sm font-bold text-white">{index}</span>
        <span className="font-display text-xl font-bold tracking-[-0.02em]">{title}</span>
      </div>
      {children}
    </fieldset>
  );
}

function FieldShell({
  uid,
  f,
  label,
  optional,
  help,
  error,
  className,
  children,
}: {
  uid: string;
  f: Field;
  label: string;
  optional?: string;
  help?: string;
  error?: string;
  className?: string;
  children: (describedBy: string | undefined, invalid: boolean) => ReactNode;
}) {
  const helpId = help ? `${uid}-${f}-help` : undefined;
  const errId = error ? `${uid}-${f}-error` : undefined;
  const describedBy = [errId, helpId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={`${uid}-${f}`} className="mb-1.5 flex items-baseline gap-2 text-sm font-medium">
        {label}
        {optional && <span className="text-xs font-normal text-muted">({optional})</span>}
      </label>
      {children(describedBy, !!error)}
      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            id={errId}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden pt-1.5 text-xs font-medium text-[#ff9aa6]"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
      {help && (
        <p id={helpId} className="pt-1.5 text-xs text-muted">
          {help}
        </p>
      )}
    </div>
  );
}

function TextField({
  uid,
  f,
  label,
  optional,
  placeholder,
  autoComplete,
  type = "text",
  multiline,
  form,
  set,
  blur,
  error,
  className,
}: {
  uid: string;
  f: Field;
  label: string;
  optional?: string;
  placeholder?: string;
  autoComplete: string;
  type?: string;
  multiline?: boolean;
  form: Form;
  set: (f: Field, v: string) => void;
  blur: (f: Field) => void;
  error?: string;
  className?: string;
}) {
  return (
    <FieldShell uid={uid} f={f} label={label} optional={optional} error={error} className={className}>
      {(describedBy, invalid) =>
        multiline ? (
          <textarea
            id={`${uid}-${f}`}
            name={f}
            rows={3}
            value={form[f]}
            onChange={(e) => set(f, e.target.value)}
            onBlur={() => blur(f)}
            maxLength={MAX[f]}
            placeholder={placeholder}
            autoComplete={autoComplete}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className={clsx(inputCls(invalid), "resize-y")}
          />
        ) : (
          <input
            id={`${uid}-${f}`}
            name={f}
            type={type}
            value={form[f]}
            onChange={(e) => set(f, e.target.value)}
            onBlur={() => blur(f)}
            maxLength={MAX[f]}
            placeholder={placeholder}
            autoComplete={autoComplete}
            required={!optional}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className={inputCls(invalid)}
          />
        )
      }
    </FieldShell>
  );
}

function ReturningBanner({
  state,
  pct,
  title,
  body,
  checking,
}: {
  state: "checking" | "eligible" | "none" | null;
  pct: number;
  title: string;
  body: string;
  checking: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        {state === "checking" && (
          <motion.p
            key="checking"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 pt-2 text-xs text-muted"
          >
            <span aria-hidden="true" className="size-3 animate-spin rounded-full border-2 border-violet-3 border-r-transparent" />
            {checking}
          </motion.p>
        )}
        {state === "eligible" && (
          <motion.div
            key="eligible"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97, height: 0 }}
            animate={{ opacity: 1, y: 0, scale: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="relative mt-3 overflow-hidden rounded-2xl border border-violet-2/40 bg-gradient-to-r from-violet/25 via-violet-2/15 to-transparent px-4 py-3.5">
              {!reduce && (
                <motion.span
                  aria-hidden="true"
                  className="absolute inset-y-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                  initial={{ left: "-40%" }}
                  animate={{ left: "140%" }}
                  transition={{ duration: 1.4, delay: 0.3, ease: "easeInOut" }}
                />
              )}
              <div className="relative flex items-center gap-3">
                <motion.span
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-violet text-white shadow-[0_0_24px_rgba(123,92,255,0.7)]"
                  initial={reduce ? undefined : { rotate: -90, scale: 0 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 380, damping: 16, delay: 0.1 }}
                >
                  <SparkleIcon size={18} />
                </motion.span>
                <p className="text-sm">
                  <span className="font-display font-bold text-white">{title}</span>{" "}
                  <span className="text-text/85">{fmt(body, { pct })}</span>
                </p>
              </div>
              {!reduce &&
                [0, 1, 2, 3, 4, 5].map((i) => (
                  <motion.span
                    key={i}
                    aria-hidden="true"
                    className="absolute left-7 top-1/2 size-1.5 rounded-full bg-violet-3"
                    initial={{ x: 0, y: 0, opacity: 1 }}
                    animate={{ x: Math.cos((i / 6) * Math.PI * 2) * 34, y: Math.sin((i / 6) * Math.PI * 2) * 34, opacity: 0 }}
                    transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  />
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-14" aria-hidden="true">
      <div className="space-y-6">
        <div className="h-80 animate-pulse rounded-[28px] bg-panel/60" />
        <div className="h-64 animate-pulse rounded-[28px] bg-panel/50" />
      </div>
      <div className="h-96 animate-pulse rounded-[28px] bg-panel/60" />
    </div>
  );
}

