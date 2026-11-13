"use client";
// Edit a customer's contact details, notes and the returning-customer discount flag; anonymize on a deletion request.
import { useRouter } from "next/navigation";
import { useId, useState, type ChangeEvent, type InputHTMLAttributes } from "react";
import { anonymizeCustomerAction, updateCustomerAction } from "@/app/(admin)/admin/actions";
import { GOVERNORATES } from "@/lib/business";
import { Modal, Switch } from "../controls";
import { useToast } from "../toast";
import type { Customer } from "../types";

export default function CustomerEditor({ customer, pct }: { customer: Customer; pct: number }) {
  const toast = useToast();
  const router = useRouter();
  const uid = useId();
  const init = {
    name: customer.name,
    phone: customer.phone,
    email: customer.email ?? "",
    businessName: customer.businessName ?? "",
    governorate: customer.governorate ?? "",
    city: customer.city ?? "",
    address: customer.address ?? "",
    notes: customer.notes ?? "",
  };
  const [v, setV] = useState(init);
  const [base, setBase] = useState(init);
  const [discount, setDiscount] = useState(customer.discountAvailable);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [savingFlag, setSavingFlag] = useState(false);
  const [confirmAnon, setConfirmAnon] = useState(false);
  const [anonymizing, setAnonymizing] = useState(false);
  const anonymized = base.phone.startsWith("anon-"); // see src/server/retention.ts
  const dirty = (Object.keys(v) as (keyof typeof v)[]).some((k) => v[k] !== base[k]);

  const set = (k: keyof typeof v) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setV((s) => ({ ...s, [k]: e.target.value }));
    if (fields[k]) setFields((f) => ({ ...f, [k]: "" }));
  };

  async function save() {
    setPending(true);
    setFields({});
    const res = await updateCustomerAction({ id: customer.id, ...v });
    setPending(false);
    if (res.ok) {
      setBase(v);
      toast.ok("Customer saved");
    } else {
      setFields(res.fields ?? {});
      toast.err("Couldn’t save", res.error);
    }
  }

  async function toggleDiscount(next: boolean) {
    setSavingFlag(true);
    setDiscount(next);
    const res = await updateCustomerAction({ id: customer.id, discountAvailable: next });
    setSavingFlag(false);
    if (res.ok) toast.ok(next ? `−${pct}% unlocked for the next order` : "Returning discount removed");
    else {
      setDiscount(!next);
      toast.err("Couldn’t change the discount", res.error);
    }
  }

  async function anonymize() {
    setAnonymizing(true);
    const res = await anonymizeCustomerAction(customer.id);
    setAnonymizing(false);
    setConfirmAnon(false);
    if (!res.ok) {
      toast.err("Couldn’t anonymize", res.error);
      return;
    }
    const blank = { ...init, name: "Anonymized customer", phone: `anon-${customer.id}`, email: "", businessName: "", city: "", address: "", notes: "" };
    setV(blank);
    setBase(blank);
    setDiscount(false);
    toast.ok("Customer anonymized", "Personal data removed; orders keep their amounts.");
    router.refresh();
  }

  const input = (k: keyof typeof v, label: string, props: InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="field">
      <label htmlFor={`${uid}-${k}`}>{label}</label>
      <input id={`${uid}-${k}`} className={`input${fields[k] ? " bad" : ""}`} value={v[k]} onChange={set(k)} {...props} />
      {fields[k] ? <span className="err">{fields[k]}</span> : null}
    </div>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h3>Details</h3>
      <div className="sub">Changes apply to future orders; past orders keep their snapshot.</div>

      <div className="tog" style={{ padding: "12px 14px", borderRadius: 12, background: "var(--panel2)", border: "1px solid var(--line)" }}>
        <span>
          Returning discount −{pct}%
          <span className="hint" style={{ display: "block" }}>
            {discount ? "Will be applied to their next order automatically." : "Earned automatically when an order is delivered."}
          </span>
        </span>
        <Switch checked={discount} onChange={toggleDiscount} label={`Returning discount −${pct}%`} disabled={savingFlag} tone="ok" />
      </div>

      <div className="stack mt16" style={{ gap: 12 }}>
        {input("name", "Name", { maxLength: 120 })}
        {input("phone", "Phone", { inputMode: "tel" })}
        {input("businessName", "Business", { maxLength: 120 })}
        {input("email", "Email", { inputMode: "email" })}
        <div className="field">
          <label htmlFor={`${uid}-gov`}>Governorate</label>
          <select id={`${uid}-gov`} className={`select${fields.governorate ? " bad" : ""}`} value={v.governorate} onChange={set("governorate")}>
            <option value="">—</option>
            {GOVERNORATES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        {input("city", "City", { maxLength: 80 })}
        {input("address", "Address", { maxLength: 300 })}
        <div className="field">
          <label htmlFor={`${uid}-notes`}>Notes</label>
          <textarea id={`${uid}-notes`} className="textarea" value={v.notes} onChange={set("notes")} maxLength={2000} placeholder="Preferences, follow-ups, what they loved…" />
        </div>
      </div>
      <button type="submit" className={`save${pending ? " busy" : ""}`} disabled={!dirty || pending}>
        Save changes
      </button>

      <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
        {anonymized ? (
          <span className="hint">Personal data removed (deletion request or 3 years without an order).</span>
        ) : (
          <>
            <button type="button" className="btn xs danger" onClick={() => setConfirmAnon(true)}>
              Anonymize customer
            </button>
            <span className="hint" style={{ marginLeft: 10 }}>
              For a deletion request.
            </span>
          </>
        )}
      </div>

      <Modal
        open={confirmAnon}
        onClose={() => setConfirmAnon(false)}
        title="Anonymize this customer?"
        subtitle="Name, phone, email, business, city, address and notes are erased here and on all their orders. Order numbers, products and amounts stay for the accounts. This can’t be undone."
        size="sm"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setConfirmAnon(false)} data-autofocus>
              Keep data
            </button>
            <button type="button" className="btn danger" onClick={anonymize} disabled={anonymizing}>
              {anonymizing ? "Anonymizing…" : "Anonymize permanently"}
            </button>
          </>
        }
      >
        <p className="hint">Their smart links keep working. Customers are also anonymized automatically 3 years after their last order.</p>
      </Modal>
    </form>
  );
}
