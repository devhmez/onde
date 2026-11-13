"use client";
// Store settings: open/closed, delivery + discount rules, contact & socials (empty = hidden on the site), optional
// legal identity for the legal notice page. `notifications` is the phone-notifications card (it has its own actions).
import { AnimatePresence, motion } from "motion/react";
import { useId, useState, type ReactNode } from "react";
import { updateSettingsAction } from "@/app/(admin)/admin/actions";
import { Switch } from "../controls";
import { fmtMoney, parseDT, toDTInput } from "../format";
import { useToast } from "../toast";
import type { SettingsView } from "../types";

type Form = {
  storeOpen: boolean;
  deliveryFee: string;
  freeDeliveryThreshold: string;
  returningDiscountPct: string;
  phone: string;
  whatsapp: string;
  email: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  legalName: string;
  taxId: string;
  address: string;
};

const fromView = (s: SettingsView): Form => ({
  storeOpen: s.storeOpen,
  deliveryFee: toDTInput(s.deliveryFee),
  freeDeliveryThreshold: toDTInput(s.freeDeliveryThreshold),
  returningDiscountPct: String(s.returningDiscountPct),
  phone: s.phone,
  whatsapp: s.whatsapp,
  email: s.email,
  instagram: s.instagram,
  facebook: s.facebook,
  tiktok: s.tiktok,
  legalName: s.legalName,
  taxId: s.taxId,
  address: s.address,
});

export default function SettingsForm({ initial, notifications }: { initial: SettingsView; notifications?: ReactNode }) {
  const toast = useToast();
  const uid = useId();
  const [f, setF] = useState<Form>(() => fromView(initial));
  const [base, setBase] = useState<Form>(() => fromView(initial));
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(base);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((s) => ({ ...s, [k]: v }));
    if (fields[k]) setFields((x) => ({ ...x, [k]: "" }));
  };

  const fee = parseDT(f.deliveryFee);
  const threshold = parseDT(f.freeDeliveryThreshold);
  const pct = Number(f.returningDiscountPct);

  async function save() {
    setPending(true);
    setFields({});
    const res = await updateSettingsAction({
      storeOpen: f.storeOpen,
      deliveryFee: f.deliveryFee,
      freeDeliveryThreshold: f.freeDeliveryThreshold,
      returningDiscountPct: Number.isFinite(pct) ? Math.round(pct) : -1,
      phone: f.phone,
      whatsapp: f.whatsapp,
      email: f.email,
      instagram: f.instagram,
      facebook: f.facebook,
      tiktok: f.tiktok,
      legalName: f.legalName,
      taxId: f.taxId,
      address: f.address,
    });
    setPending(false);
    if (!res.ok) {
      setFields(res.fields ?? {});
      toast.err("Settings not saved", res.error);
      return;
    }
    const next = fromView(res.data.settings);
    setF(next);
    setBase(next);
    toast.ok("Settings saved", "The website uses them right away.");
  }

  const input = (k: keyof Form, label: string, opts: { hint?: string; placeholder?: string; affix?: string; pre?: string; mode?: "text" | "tel" | "email" | "url" | "decimal" | "numeric"; type?: string } = {}) => (
    <div className="field">
      <label htmlFor={`${uid}-${k}`}>{label}</label>
      <div className={opts.affix ? "affix" : opts.pre ? "affix pre" : undefined}>
        {opts.pre ? <span>{opts.pre}</span> : null}
        <input
          id={`${uid}-${k}`}
          className={`input${fields[k] ? " bad" : ""}`}
          type={opts.type ?? "text"}
          inputMode={opts.mode}
          value={String(f[k])}
          placeholder={opts.placeholder}
          onChange={(e) => set(k, e.target.value as never)}
          autoComplete="off"
          spellCheck={false}
        />
        {opts.affix ? <span>{opts.affix}</span> : null}
      </div>
      {fields[k] ? <span className="err">{fields[k]}</span> : opts.hint ? <span className="hint">{opts.hint}</span> : null}
    </div>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="grid">
        <div className="stack" style={{ minWidth: 0 }}>
          <section className="card">
            <h3>Store</h3>
            <div className="tog">
              <span>
                Store open
                <span className="hint" style={{ display: "block" }}>
                  {f.storeOpen ? "Customers can order on the website." : "Website orders are paused (you can still record manual orders)."}
                </span>
              </span>
              <Switch checked={f.storeOpen} onChange={(v) => set("storeOpen", v)} label="Store open" tone="ok" />
            </div>
          </section>

          <section className="card">
            <h3>Delivery & loyalty</h3>
            <div className="sub">Used by the cart, the checkout and every order (the server re-prices with these).</div>
            <div className="form-grid mt16">
              {input("deliveryFee", "Delivery fee", { affix: "DT", mode: "decimal", placeholder: "7" })}
              {input("freeDeliveryThreshold", "Free delivery from", { affix: "DT", mode: "decimal", placeholder: "99" })}
              {input("returningDiscountPct", "Returning-customer discount", { affix: "%", mode: "numeric", placeholder: "10" })}
            </div>
            <p className="notice mt16">
              <span aria-hidden>ⓘ</span>
              <span>
                {threshold != null && !Number.isNaN(threshold) && fee != null && !Number.isNaN(fee) ? (
                  <>
                    Orders of <b>{fmtMoney(threshold)}</b> or more ship <b>free</b>; below that, delivery costs <b>{fmtMoney(fee)}</b>.{" "}
                  </>
                ) : null}
                {Number.isFinite(pct) && pct > 0 ? (
                  <>
                    After a delivered order, the customer’s next order gets <b>−{Math.round(pct)}%</b> once.
                  </>
                ) : (
                  <>No returning-customer discount.</>
                )}
              </span>
            </p>
          </section>

          <section className="card">
            <h3>Contact</h3>
            <div className="sub">Shown on the website, footer and order confirmations. Empty fields are hidden.</div>
            <div className="form-grid mt16">
              {input("phone", "Phone", { pre: "+216", mode: "tel", placeholder: "25 875 529" })}
              {input("whatsapp", "WhatsApp", { mode: "tel", placeholder: "21625875529", hint: "8-digit Tunisian number or international digits." })}
              <div className="full">{input("email", "Email", { mode: "email", type: "email", placeholder: "hello@onde.tn", hint: "Add it once the domain mailbox exists." })}</div>
            </div>
          </section>

          <section className="card">
            <h3>Social networks</h3>
            <div className="sub">A full URL or just the @handle. Empty = icon hidden on the site.</div>
            <div className="form-grid mt16">
              {input("instagram", "Instagram", { mode: "url", placeholder: "@onde.tn" })}
              {input("tiktok", "TikTok", { mode: "url", placeholder: "@onde.tn" })}
              <div className="full">{input("facebook", "Facebook", { mode: "url", placeholder: "https://facebook.com/…" })}</div>
            </div>
          </section>

          <section className="card">
            <h3>Legal identity</h3>
            <div className="sub">Shown on the Legal notice, the terms of sale and the privacy policy once filled in. Empty = hidden. Tunisian law expects at least the name and the address.</div>
            <div className="form-grid mt16">
              <div className="full">{input("legalName", "Raison sociale / nom commercial", { placeholder: "As registered (company name or your name)" })}</div>
              <div className="full">{input("taxId", "Matricule fiscal / RNE", { placeholder: "1234567/A/B/M/000", hint: "Letters, digits, / . - only." })}</div>
              <div className="full">{input("address", "Adresse", { placeholder: "Rue, code postal, ville", hint: "Business or postal address of the seller." })}</div>
            </div>
          </section>
        </div>

        <div className="stack">
          {notifications}

          <section className="card">
            <h3>Admin password</h3>
            <div className="sub">Stored as a bcrypt hash in the server environment — never in the database.</div>
            <ol className="hint" style={{ margin: "12px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
              <li>In the project folder (on your Mac or on the VPS), run:</li>
            </ol>
            <code className="code-block">node scripts/hash-password.mjs</code>
            <ol className="hint" start={2} style={{ margin: "10px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>
              <li>Type the new password twice (12+ characters).</li>
              <li>
                Copy the <span className="mono">base64:…</span> line into <span className="mono">ADMIN_PASSWORD_HASH</span> in the server’s <span className="mono">.env</span>.
              </li>
              <li>Restart the app:</li>
            </ol>
            <code className="code-block">docker compose up -d</code>
            <p className="hint mt12">Every open session is signed out automatically when the password changes.</p>
          </section>
        </div>
      </div>

      <AnimatePresence>
        {dirty ? (
          <motion.div
            className="bulkbar"
            style={{ position: "sticky", bottom: 16, marginTop: 16 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          >
            <span>
              <b>Unsaved changes</b>
            </span>
            <span className="grow" />
            <button type="button" className="btn sm" onClick={() => (setF(base), setFields({}))}>
              Discard
            </button>
            <button type="submit" className="btn sm p" disabled={pending}>
              {pending ? "Saving…" : "Save settings"}
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </form>
  );
}
