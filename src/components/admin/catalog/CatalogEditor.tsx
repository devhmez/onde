"use client";
// Shop catalog: product cards (instant visibility switch) + bilingual edit modal (EN/FR names, taglines, descriptions,
// price in DT with 3 decimals → millimes, "was" price, image, 3D model, sort).
import { motion } from "motion/react";
import Image from "next/image";
import { useId, useState } from "react";
import { setProductActiveAction, upsertProductAction } from "@/app/(admin)/admin/actions";
import { Modal, Switch } from "../controls";
import { fmtMoney, parseDT, toDTInput } from "../format";
import { PRODUCT_IMAGES, PRODUCT_KIND_LABEL, PRODUCT_KINDS, PRODUCT_MODELS } from "../meta";
import { useToast } from "../toast";
import type { Product, ProductKind } from "../types";
import { EmptyState, Pill } from "../ui";

type Draft = {
  id?: number;
  slug: string;
  kind: ProductKind;
  nameEn: string;
  nameFr: string;
  taglineEn: string;
  taglineFr: string;
  descEn: string;
  descFr: string;
  price: string;
  compareAt: string;
  /** Time-limited promo price (DT) and its end, as a datetime-local value in the admin's time zone. */
  salePrice: string;
  saleEnds: string;
  image: string;
  model: string;
  active: boolean;
  sort: number;
};

/** ms → "YYYY-MM-DDTHH:mm" in the browser's time zone (what <input type="datetime-local"> expects). */
function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const toDraft = (p: Product): Draft => ({
  id: p.id,
  slug: p.slug,
  kind: p.kind,
  nameEn: p.nameEn,
  nameFr: p.nameFr,
  taglineEn: p.taglineEn,
  taglineFr: p.taglineFr,
  descEn: p.descEn,
  descFr: p.descFr,
  price: toDTInput(p.price),
  compareAt: toDTInput(p.compareAt),
  salePrice: toDTInput(p.salePrice),
  saleEnds: p.saleEndsAt ? toLocalInput(p.saleEndsAt) : "",
  image: p.image,
  model: p.model ?? "",
  active: p.active,
  sort: p.sort,
});

const blank = (sort: number): Draft => ({
  slug: "",
  kind: "pack",
  nameEn: "",
  nameFr: "",
  taglineEn: "",
  taglineFr: "",
  descEn: "",
  descFr: "",
  price: "",
  compareAt: "",
  salePrice: "",
  saleEnds: "",
  image: PRODUCT_IMAGES[0],
  model: "",
  active: false,
  sort,
});

export default function CatalogEditor({ products, openNewSignal }: { products: Product[]; openNewSignal?: boolean }) {
  const toast = useToast();
  const [now] = useState(() => Date.now());
  // Pending visibility switches (optimistic) — cleared once the server answers and the page re-renders.
  const [pendingActive, setPendingActive] = useState<Record<number, boolean>>({});
  const [draft, setDraft] = useState<Draft | null>(openNewSignal ? blank((products.at(-1)?.sort ?? 0) + 10) : null);
  const [modalKey, setModalKey] = useState(0);
  const openModal = (d: Draft) => {
    setDraft(d);
    setModalKey((k) => k + 1);
  };

  async function toggle(p: Product, next: boolean) {
    setPendingActive((a) => ({ ...a, [p.id]: next }));
    const res = await setProductActiveAction({ id: p.id, active: next });
    setPendingActive((a) => {
      const n = { ...a };
      delete n[p.id];
      return n;
    });
    if (res.ok) toast.ok(next ? `${p.nameEn} is visible in the shop` : `${p.nameEn} hidden from the shop`);
    else toast.err("Couldn’t change visibility", res.error);
  }

  return (
    <>
      <div className="row between wrap mt22">
        <span className="hint">Prices are in DT with 3 decimals (59.500). Changes go live on the site immediately.</span>
        <button type="button" className="btn p" onClick={() => openModal(blank((products.at(-1)?.sort ?? 0) + 10))}>
          + New product
        </button>
      </div>
      {products.length === 0 ? (
        <div className="card mt16">
          <EmptyState title="The catalog is empty">It is seeded automatically on first start — or create a product now.</EmptyState>
        </div>
      ) : (
        <div className="cat-grid" style={{ marginTop: 16 }}>
          {products.map((p, i) => {
            const on = pendingActive[p.id] ?? p.active;
            return (
              <motion.article
                key={p.id}
                className={`card prod${on ? "" : " inactive"}`}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: Math.min(i * 0.05, 0.4) }}
              >
                <div className="prod-top">
                  <div className="thumb">
                    <Image src={p.image} alt="" width={64} height={64} unoptimized={!p.image.startsWith("/")} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h4>{p.nameEn}</h4>
                    <div className="hint" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.nameFr}
                    </div>
                    <small>/{p.slug}</small>
                  </div>
                  <Switch checked={on} onChange={(v) => toggle(p, v)} label={`Show ${p.nameEn} in the shop`} />
                </div>
                <div className="price-row">
                  {p.salePrice != null && p.saleEndsAt != null && p.saleEndsAt > now ? (
                    <>
                      <b>{fmtMoney(p.salePrice)}</b>
                      <s>{fmtMoney(p.price)}</s>
                      <Pill tone="on">Promo → {new Date(p.saleEndsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</Pill>
                    </>
                  ) : (
                    <>
                      <b>{fmtMoney(p.price)}</b>
                      {p.compareAt ? <s>{fmtMoney(p.compareAt)}</s> : null}
                    </>
                  )}
                  <span className="grow" />
                  <Pill tone={on ? "on" : "gray"}>{on ? "In shop" : "Hidden"}</Pill>
                </div>
                <p className="hint" style={{ minHeight: 36 }}>
                  {p.taglineEn || <span style={{ opacity: 0.6 }}>No tagline yet.</span>}
                </p>
                <div className="row between">
                  <span className="hint">
                    {PRODUCT_KIND_LABEL[p.kind]} · sort {p.sort}
                    {p.model ? " · 3D" : ""}
                  </span>
                  <button type="button" className="btn sm" onClick={() => openModal(toDraft(p))}>
                    Edit
                  </button>
                </div>
              </motion.article>
            );
          })}
        </div>
      )}
      <ProductModal key={modalKey} draft={draft} onClose={() => setDraft(null)} />
    </>
  );
}

function ProductModal({ draft, onClose }: { draft: Draft | null; onClose: () => void }) {
  const toast = useToast();
  const uid = useId();
  const [d, setD] = useState<Draft | null>(draft);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [now] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!d) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((s) => (s ? { ...s, [k]: v } : s));
    if (fields[k as string]) setFields((f) => ({ ...f, [k as string]: "" }));
  };
  const price = parseDT(d.price);
  const compare = parseDT(d.compareAt);
  const savings = price && compare && !Number.isNaN(price) && !Number.isNaN(compare) && compare > price ? compare - price : 0;
  const isNew = !d.id;
  const images = PRODUCT_IMAGES.includes(d.image as (typeof PRODUCT_IMAGES)[number]) ? [...PRODUCT_IMAGES] : [d.image, ...PRODUCT_IMAGES];

  async function save() {
    if (!d) return;
    setPending(true);
    setError(null);
    setFields({});
    const { saleEnds, ...rest } = d;
    const endsMs = saleEnds ? new Date(saleEnds).getTime() : null;
    const res = await upsertProductAction({ ...rest, saleEndsAt: endsMs != null && Number.isFinite(endsMs) ? endsMs : null });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      setFields(res.fields ?? {});
      return;
    }
    toast.ok(isNew ? `${res.data.product.nameEn} created` : `${res.data.product.nameEn} saved`, "Live on the site now.");
    onClose();
  }

  const text = (k: keyof Draft, label: string, opts: { area?: boolean; max?: number; placeholder?: string } = {}) => (
    <div className="field">
      <label htmlFor={`${uid}-${k}`}>{label}</label>
      {opts.area ? (
        <textarea id={`${uid}-${k}`} className={`textarea${fields[k] ? " bad" : ""}`} value={String(d[k] ?? "")} maxLength={opts.max} placeholder={opts.placeholder} onChange={(e) => set(k, e.target.value as never)} />
      ) : (
        <input id={`${uid}-${k}`} className={`input${fields[k] ? " bad" : ""}`} value={String(d[k] ?? "")} maxLength={opts.max} placeholder={opts.placeholder} onChange={(e) => set(k, e.target.value as never)} />
      )}
      {fields[k] ? <span className="err">{fields[k]}</span> : null}
    </div>
  );

  return (
    <Modal
      open={Boolean(draft)}
      onClose={onClose}
      title={isNew ? "New product" : `Edit ${d.nameEn || d.slug}`}
      subtitle="English and French are both shown on the site — fill both."
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn p" onClick={save} disabled={pending}>
            {pending ? "Saving…" : isNew ? "Create product" : "Save — update the site"}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="form-grid">
          {text("nameEn", "Name · English", { max: 120 })}
          {text("nameFr", "Nom · Français", { max: 120 })}
          {text("taglineEn", "Tagline · English", { max: 200 })}
          {text("taglineFr", "Accroche · Français", { max: 200 })}
          {text("descEn", "Description · English", { area: true, max: 5000 })}
          {text("descFr", "Description · Français", { area: true, max: 5000 })}

          <div className="field">
            <label htmlFor={`${uid}-price`}>Price</label>
            <div className="affix">
              <input id={`${uid}-price`} className={`input${fields.price ? " bad" : ""}`} inputMode="decimal" value={d.price} placeholder="59.000" onChange={(e) => set("price", e.target.value)} />
              <span>DT</span>
            </div>
            {fields.price ? <span className="err">{fields.price}</span> : <span className="hint">{price && !Number.isNaN(price) ? `${fmtMoney(price)} · ${price.toLocaleString("en-US")} millimes` : "e.g. 59 or 59.500"}</span>}
          </div>
          <div className="field">
            <label htmlFor={`${uid}-compare`}>“Was” price (optional)</label>
            <div className="affix">
              <input id={`${uid}-compare`} className={`input${fields.compareAt ? " bad" : ""}`} inputMode="decimal" value={d.compareAt} placeholder="—" onChange={(e) => set("compareAt", e.target.value)} />
              <span>DT</span>
            </div>
            {fields.compareAt ? <span className="err">{fields.compareAt}</span> : <span className="hint">{savings ? `Shows a ${fmtMoney(savings)} saving.` : "Struck-through price for packs and promos."}</span>}
          </div>
          <div className="field">
            <label htmlFor={`${uid}-sale`}>Promo price (optional)</label>
            <div className="affix">
              <input id={`${uid}-sale`} className={`input${fields.salePrice ? " bad" : ""}`} inputMode="decimal" value={d.salePrice} placeholder="—" onChange={(e) => set("salePrice", e.target.value)} />
              <span>DT</span>
            </div>
            {fields.salePrice ? <span className="err">{fields.salePrice}</span> : <span className="hint">Charged until the end date, with the regular price struck through and a countdown. Then the regular price comes back by itself.</span>}
          </div>
          <div className="field">
            <label htmlFor={`${uid}-sale-ends`}>Promo ends</label>
            <input id={`${uid}-sale-ends`} type="datetime-local" className={`input${fields.saleEndsAt ? " bad" : ""}`} value={d.saleEnds} onChange={(e) => set("saleEnds", e.target.value)} />
            {fields.saleEndsAt ? <span className="err">{fields.saleEndsAt}</span> : <span className="hint">{d.saleEnds && new Date(d.saleEnds).getTime() < now ? "In the past — the promo is over." : "Leave both promo fields empty for no promo."}</span>}
          </div>

          <div className="field">
            <label htmlFor={`${uid}-slug`}>Slug (URL)</label>
            <input
              id={`${uid}-slug`}
              className={`input mono${fields.slug ? " bad" : ""}`}
              value={d.slug}
              readOnly={!isNew}
              onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
              placeholder="pack-salon"
            />
            {fields.slug ? <span className="err">{fields.slug}</span> : <span className="hint">{isNew ? "/shop/<slug> — can’t be changed later." : "Fixed: links and 3D scenes use it."}</span>}
          </div>
          <div className="field">
            <label htmlFor={`${uid}-kind`}>Type</label>
            <select id={`${uid}-kind`} className="select" value={d.kind} onChange={(e) => set("kind", e.target.value as ProductKind)} disabled={!isNew}>
              {PRODUCT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {PRODUCT_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${uid}-image`}>Image</label>
            <select id={`${uid}-image`} className={`select${fields.image ? " bad" : ""}`} value={d.image} onChange={(e) => set("image", e.target.value)}>
              {images.map((src) => (
                <option key={src} value={src}>
                  {src.replace("/products/", "")}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${uid}-model`}>3D model</label>
            <select id={`${uid}-model`} className={`select${fields.model ? " bad" : ""}`} value={d.model} onChange={(e) => set("model", e.target.value)}>
              <option value="">None</option>
              {PRODUCT_MODELS.map((m) => (
                <option key={m} value={m}>
                  {m.replace("/models/", "")}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${uid}-sort`}>Sort order</label>
            <input id={`${uid}-sort`} className="input" inputMode="numeric" value={d.sort} onChange={(e) => set("sort", Number(e.target.value.replace(/[^\d-]/g, "")) || 0)} />
            <span className="hint">Lower comes first in the shop.</span>
          </div>
          <div className="field">
            <span className="flabel">Visible in shop</span>
            <div className="row" style={{ height: 42 }}>
              <Switch checked={d.active} onChange={(v) => set("active", v)} label="Visible in shop" />
              <span className="hint">{d.active ? "Customers can order it." : "Hidden (still usable in manual orders)."}</span>
            </div>
          </div>
        </div>
        {error ? (
          <p className="err mt12" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
