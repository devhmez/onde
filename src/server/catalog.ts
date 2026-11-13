import "server-only";
import { and, asc, eq, ne } from "drizzle-orm";
import { getDb } from "../db";
import { products } from "../db/schema";
import { audit } from "./audit";
import { DataError, NotFoundError } from "./errors";
import { withSale } from "../lib/sale";
import { PRODUCT_KINDS, type FieldErrors, type Locale, type NewProduct, type Product, type PublicProduct } from "./types";

/**
 * Catalog rows. By default prices are the ones customers pay *now*: during an active sale `price` is the sale
 * price and `compareAt` the regular one (see src/lib/sale.ts). Pass `raw: true` for the stored values (admin editor).
 */
export async function listProducts(opts: { includeInactive?: boolean; raw?: boolean } = {}): Promise<Product[]> {
  const db = getDb();
  const q = db.select().from(products);
  const rows = opts.includeInactive ? q.orderBy(asc(products.sort), asc(products.id)).all()
    : q.where(eq(products.active, true)).orderBy(asc(products.sort), asc(products.id)).all();
  return opts.raw ? rows : rows.map((r) => withSale(r));
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  if (typeof slug !== "string" || !slug) return null;
  const row = getDb().select().from(products).where(eq(products.slug, slug.toLowerCase())).get();
  return row ? withSale(row) : null;
}

export async function getProductById(id: number): Promise<Product | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const row = getDb().select().from(products).where(eq(products.id, id)).get();
  return row ? withSale(row) : null;
}

/** Localized, public-safe projection (used by /api/products and handy for pages). */
export function toPublicProduct(row: Product, locale: Locale): PublicProduct {
  const fr = locale === "fr";
  const p = withSale(row);
  return {
    id: p.id,
    slug: p.slug,
    kind: p.kind,
    name: fr ? p.nameFr : p.nameEn,
    tagline: fr ? p.taglineFr : p.taglineEn,
    description: fr ? p.descFr : p.descEn,
    price: p.price,
    compareAt: p.compareAt ?? null,
    saleEndsAt: p.saleEndsAt ?? null,
    image: p.image,
    model: p.model ?? null,
    sort: p.sort,
  };
}

export async function listPublicProducts(locale: Locale): Promise<PublicProduct[]> {
  return (await listProducts()).map((p) => toPublicProduct(p, locale));
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ASSET_RE = /^\/[A-Za-z0-9._\-/]+$/;

export type UpsertProductInput = Omit<NewProduct, "id" | "createdAt"> & { id?: number };

/**
 * Create (no id) or update (id) a catalog product. Validates slug/kind/prices (millimes)/asset paths.
 * Throws DataError("validation", fields) — `slug: "taken"` when the slug belongs to another product.
 */
export async function upsertProduct(input: UpsertProductInput): Promise<Product> {
  const fields: FieldErrors = {};
  const slug = String(input.slug ?? "").trim().toLowerCase();
  if (!slug) fields.slug = "required";
  else if (!SLUG_RE.test(slug) || slug.length > 60) fields.slug = "invalid";
  if (!PRODUCT_KINDS.includes(input.kind)) fields.kind = "invalid";
  const nameEn = String(input.nameEn ?? "").trim();
  const nameFr = String(input.nameFr ?? "").trim();
  if (!nameEn) fields.nameEn = "required";
  else if (nameEn.length > 120) fields.nameEn = "too_long";
  if (!nameFr) fields.nameFr = "required";
  else if (nameFr.length > 120) fields.nameFr = "too_long";
  const price = Number(input.price);
  if (!Number.isInteger(price) || price < 0 || price > 100_000_000) fields.price = "invalid";
  const compareAt = input.compareAt == null || (input.compareAt as unknown) === "" ? null : Number(input.compareAt);
  if (compareAt != null && (!Number.isInteger(compareAt) || compareAt < 0 || compareAt > 100_000_000)) fields.compareAt = "invalid";
  const salePrice = input.salePrice == null || (input.salePrice as unknown) === "" ? null : Number(input.salePrice);
  if (salePrice != null && (!Number.isInteger(salePrice) || salePrice < 0 || (Number.isInteger(price) && salePrice >= price))) fields.salePrice = "invalid";
  const saleEndsAt = input.saleEndsAt == null || (input.saleEndsAt as unknown) === "" ? null : Number(input.saleEndsAt);
  if (saleEndsAt != null && (!Number.isInteger(saleEndsAt) || saleEndsAt <= 0)) fields.saleEndsAt = "invalid";
  if ((salePrice == null) !== (saleEndsAt == null)) fields[salePrice == null ? "salePrice" : "saleEndsAt"] = "required";
  const image = String(input.image ?? "").trim();
  if (!image) fields.image = "required";
  else if (!ASSET_RE.test(image) && !/^https:\/\//.test(image)) fields.image = "invalid";
  const model = input.model == null || String(input.model).trim() === "" ? null : String(input.model).trim();
  if (model && !ASSET_RE.test(model)) fields.model = "invalid";
  const texts = {
    taglineEn: String(input.taglineEn ?? "").trim(),
    taglineFr: String(input.taglineFr ?? "").trim(),
    descEn: String(input.descEn ?? "").trim(),
    descFr: String(input.descFr ?? "").trim(),
  };
  for (const [k, v] of Object.entries(texts)) {
    if (v.length > (k.startsWith("desc") ? 5000 : 200)) fields[k] = "too_long";
  }
  const sort = input.sort == null ? 0 : Math.trunc(Number(input.sort)) || 0;
  const active = input.active == null ? true : Boolean(input.active);

  const db = getDb();
  if (!fields.slug) {
    const clash = db
      .select({ id: products.id })
      .from(products)
      .where(input.id ? and(eq(products.slug, slug), ne(products.id, input.id)) : eq(products.slug, slug))
      .get();
    if (clash) fields.slug = "taken";
  }
  if (Object.keys(fields).length) throw new DataError("validation", fields);

  const values = { slug, kind: input.kind, nameEn, nameFr, ...texts, price, compareAt, salePrice, saleEndsAt, image, model, active, sort };

  if (input.id) {
    const existing = db.select({ id: products.id }).from(products).where(eq(products.id, input.id)).get();
    if (!existing) throw new NotFoundError("product");
    const row = db.update(products).set(values).where(eq(products.id, input.id)).returning().get();
    audit("product.update", { id: row.id, slug: row.slug, price: row.price, active: row.active });
    return row;
  }
  const row = db.insert(products).values({ ...values, createdAt: Date.now() }).returning().get();
  audit("product.create", { id: row.id, slug: row.slug, price: row.price });
  return row;
}

export async function setProductActive(id: number, active: boolean): Promise<void> {
  const r = getDb().update(products).set({ active }).where(eq(products.id, id)).run();
  if (r.changes === 0) throw new NotFoundError("product");
  audit("product.active", { id, active });
}
