"use server";
// Admin server actions. Every action: requireAdmin() first → zod validation → src/server/* → revalidate.
// Return values are shaped for the UI (ActionResult), never raw secrets.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { normalizeDestination } from "@/components/admin/destinations";
import { mapFieldCodes } from "@/components/admin/errors";
import { parseDT } from "@/components/admin/format";
import { CHIP_STATUSES, DEST_TYPES, kindNoun, ORDER_STATUSES, PRODUCT_KINDS, TAG_KINDS } from "@/components/admin/meta";
import type { ActionResult, DestinationType, FieldErrors, Product, SettingsView, TagRow } from "@/components/admin/types";
import { requireAdmin } from "@/lib/auth";
import { normalizePhone } from "@/lib/business";
import { guessDestinationType, reconcileDestinationType } from "@/lib/destination-type";
import { audit } from "@/server/audit";
import { setProductActive, upsertProduct } from "@/server/catalog";
import { checkDiscount, updateCustomer } from "@/server/customers";
import { assignStockTagToOrder, createOrder, createTagsForOrder, getOrder, StockAssignError, updateOrderStatus } from "@/server/orders";
import { printedCodes } from "@/server/print-log";
import { releaseToStock, SellError, sellOptions, sellStockTag } from "@/server/stands";
import { anonymizeCustomer } from "@/server/retention";
import { updateSettings } from "@/server/settings";
import { createStockTags, createTag, deleteTag, getTag, listTagsByIds, MAX_STOCK_BATCH, updateTag } from "@/server/tags";
import { settingsView, toTagRow } from "./_lib/data";

type Fail = { ok: false; error: string; fields?: FieldErrors };

function zodFail(err: z.ZodError): Fail {
  const fields: FieldErrors = {};
  for (const issue of err.issues) {
    const key = issue.path.map(String).join(".") || "form";
    if (!fields[key]) fields[key] = issue.message;
  }
  const first = Object.values(fields)[0];
  return { ok: false, error: first ?? "Please check the form.", fields };
}

/** Maps data-layer errors (DataError / OrderError: { code, fields }) to UI messages. Unknown errors are logged. */
function errorFail(e: unknown): Fail {
  if (e && typeof e === "object" && "code" in e && typeof (e as { code: unknown }).code === "string") {
    const { code, fields } = e as { code: string; fields?: Record<string, string> };
    const mapped = mapFieldCodes(fields);
    switch (code) {
      case "not_found":
        return { ok: false, error: "This item no longer exists — refresh the page." };
      case "closed":
        return { ok: false, error: "The store is closed (Settings → Store open). Record it with the “Manual” channel instead." };
      case "empty":
        return { ok: false, error: "Add at least one product to the order." };
      case "invalid_status":
        return { ok: false, error: "Unknown order status." };
      case "validation":
        return { ok: false, error: mapped ? `Please fix: ${Object.values(mapped)[0]}` : "Please check the form.", fields: mapped };
      default:
        if (mapped) return { ok: false, error: "Please check the highlighted fields.", fields: mapped };
    }
  }
  console.error("[admin action]", e);
  return { ok: false, error: "Something went wrong — please try again." };
}

function revalidateAdmin() {
  revalidatePath("/admin", "layout");
}
/** Catalog + settings also change the public site. */
function revalidateSite() {
  revalidatePath("/[locale]", "layout");
  revalidateAdmin();
}

const id = z.number().int().positive();

// ───────────────────────────── Smart links (tags) ─────────────────────────────

const updateTagSchema = z.object({
  id,
  destinationType: z.enum(DEST_TYPES).optional(),
  destinationUrl: z.string().max(2048).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  label: z.string().trim().max(120, "Label is too long (120 max).").optional(),
  notes: z.string().trim().max(1000, "Notes are too long.").optional(),
  customerId: id.nullable().optional(),
  kind: z.enum(TAG_KINDS).optional(),
  chipStatus: z.enum(CHIP_STATUSES).optional(),
});
export type UpdateTagInput = z.input<typeof updateTagSchema>;

export async function updateTagAction(input: UpdateTagInput): Promise<ActionResult<{ tag: TagRow }>> {
  await requireAdmin();
  const parsed = updateTagSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const { id: tagId, ...patch } = parsed.data;
  try {
    if (patch.destinationUrl !== undefined) {
      const type = patch.destinationType ?? (await getTag(tagId))?.destinationType;
      if (!type) return { ok: false, error: "This smart link no longer exists — refresh the page." };
      const norm = normalizeDestination(type, patch.destinationUrl);
      if (!norm.ok) return { ok: false, error: norm.error, fields: { destinationUrl: norm.error } };
      patch.destinationUrl = norm.url;
      // An Instagram link saved under "Google Reviews" is an Instagram link: the URL's platform wins.
      patch.destinationType = reconcileDestinationType(type, norm.url);
    }
    await updateTag(tagId, patch);
    const fresh = await getTag(tagId);
    if (!fresh) return { ok: false, error: "This smart link no longer exists — refresh the page." };
    const name = fresh.customer ? fresh.customer.businessName?.trim() || fresh.customer.name : null;
    revalidateAdmin();
    return { ok: true, data: { tag: toTagRow(fresh, name) } };
  } catch (e) {
    return errorFail(e);
  }
}

const bulkSchema = z.object({ ids: z.array(id).min(1, "Select at least one product.").max(500), status: z.enum(["active", "disabled"]) });

export async function setTagsStatusAction(input: z.input<typeof bulkSchema>): Promise<ActionResult<{ count: number }>> {
  await requireAdmin();
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  try {
    for (const tagId of parsed.data.ids) await updateTag(tagId, { status: parsed.data.status });
    revalidateAdmin();
    return { ok: true, data: { count: parsed.data.ids.length } };
  } catch (e) {
    return errorFail(e);
  }
}

const createTagSchema = z.object({
  kind: z.enum(TAG_KINDS, "Choose a product type."),
  label: z.string().trim().max(120, "Label is too long (120 max).").optional(),
  customerId: id.optional(),
  destinationType: z.enum(DEST_TYPES),
  destinationUrl: z.string().max(2048).optional(),
  notes: z.string().trim().max(1000).optional(),
});
export type CreateTagActionInput = z.input<typeof createTagSchema>;

export async function createTagAction(input: CreateTagActionInput): Promise<ActionResult<{ tag: TagRow }>> {
  await requireAdmin();
  const parsed = createTagSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const d = parsed.data;
  let url = "";
  if (d.destinationUrl?.trim()) {
    const norm = normalizeDestination(d.destinationType, d.destinationUrl);
    if (!norm.ok) return { ok: false, error: norm.error, fields: { destinationUrl: norm.error } };
    url = norm.url;
  }
  try {
    const tag = await createTag({
      kind: d.kind,
      label: d.label || undefined,
      customerId: d.customerId,
      destinationType: d.destinationType,
      destinationUrl: url,
      notes: d.notes || undefined,
    });
    const full = await getTag(tag.id);
    const name = full?.customer ? full.customer.businessName?.trim() || full.customer.name : null;
    revalidateAdmin();
    return { ok: true, data: { tag: toTagRow(tag, name) } };
  } catch (e) {
    return errorFail(e);
  }
}

const stockSchema = z.object({
  kind: z.enum(TAG_KINDS, "Choose a product type."),
  count: z
    .number("Enter how many links to create.")
    .int("Whole numbers only.")
    .min(1, "Create at least 1 link.")
    .max(MAX_STOCK_BATCH, `${MAX_STOCK_BATCH} links at most per batch.`),
  label: z.string().trim().max(120, "Label is too long (120 max).").optional(),
  notes: z.string().trim().max(1000, "Notes are too long.").optional(),
});
export type CreateStockActionInput = z.input<typeof stockSchema>;

/** "+ Add stock": N smart links with no customer and no destination, ready to print and write to chips. */
export async function createStockTagsAction(input: CreateStockActionInput): Promise<ActionResult<{ tags: TagRow[] }>> {
  await requireAdmin();
  const parsed = stockSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  try {
    const created = await createStockTags({
      kind: parsed.data.kind,
      count: parsed.data.count,
      label: parsed.data.label || undefined,
      notes: parsed.data.notes || undefined,
    });
    revalidateAdmin();
    return { ok: true, data: { tags: created.map((t) => toTagRow(t, null)) } };
  } catch (e) {
    return errorFail(e);
  }
}

export async function deleteTagAction(tagId: number): Promise<ActionResult> {
  await requireAdmin();
  if (!id.safeParse(tagId).success) return { ok: false, error: "Invalid smart link." };
  try {
    const tag = await getTag(tagId);
    if (!tag) return { ok: false, error: "This smart link no longer exists." };
    if (tag.tapCount > 0) {
      return { ok: false, error: "This smart link has already been tapped — disable it instead of deleting it." };
    }
    // A printed code or a written chip is a physical stand: deleting its code would make that QR / chip lead nowhere
    // for good (and free the code for a new stand).
    if (tag.printedAt != null || tag.chipStatus !== "none") {
      const what = tag.printedAt != null && tag.chipStatus !== "none" ? "printed and its chip written" : tag.printedAt != null ? "printed" : "its chip written";
      return { ok: false, error: `This stand was ${what} — return it to stock or disable it instead.` };
    }
    await deleteTag(tagId);
    revalidateAdmin();
    return { ok: true, data: null };
  } catch (e) {
    return errorFail(e);
  }
}

// ───────────────────────────── Orders ─────────────────────────────

export async function updateOrderStatusAction(input: { id: number; status: string }): Promise<ActionResult<{ status: string }>> {
  await requireAdmin();
  const parsed = z.object({ id, status: z.enum(ORDER_STATUSES) }).safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  try {
    const order = await updateOrderStatus(parsed.data.id, parsed.data.status);
    revalidateAdmin();
    return { ok: true, data: { status: order.status } };
  } catch (e) {
    return errorFail(e);
  }
}

export async function createTagsForOrderAction(orderId: number): Promise<ActionResult<{ tags: TagRow[] }>> {
  await requireAdmin();
  if (!id.safeParse(orderId).success) return { ok: false, error: "Invalid order." };
  try {
    const created = await createTagsForOrder(orderId);
    const o = await getOrder(orderId);
    const name = o ? o.customer.businessName?.trim() || o.customer.name : null;
    revalidateAdmin();
    return { ok: true, data: { tags: created.map((t) => toTagRow(t, name)) } };
  } catch (e) {
    return errorFail(e);
  }
}

const assignStockSchema = z.object({
  orderId: id,
  code: z.string().trim().min(1, "Type the code printed under the QR.").max(32),
  /** Confirmed replacement of a code minted for this order (never printed, tapped or written). */
  replace: z.string().trim().max(16).optional(),
});

/**
 * "Use a stock stand": the pre-printed stock link with this code becomes one of the order's smart links (customer,
 * order, destination of the matching order line, label "<owner> — <stock label>"), so no new code is minted for it.
 */
export async function assignStockTagAction(
  input: z.input<typeof assignStockSchema>,
): Promise<ActionResult<{ tag: TagRow; activated: boolean; replaced: string | null }> | { ok: false; error: string; fields?: FieldErrors; replaceCode: string }> {
  await requireAdmin();
  const parsed = assignStockSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  try {
    const res = await assignStockTagToOrder(parsed.data.orderId, parsed.data.code, { replace: parsed.data.replace });
    const o = await getOrder(parsed.data.orderId);
    const name = o ? o.customer.businessName?.trim() || o.customer.name : null;
    revalidateAdmin();
    return { ok: true, data: { tag: toTagRow(res.tag, name), activated: res.activated, replaced: res.replaced } };
  } catch (e) {
    if (e instanceof StockAssignError) {
      const kind = e.kind ? kindNoun(e.kind) : "product";
      if (e.reason === "replace_needed" && e.replaceCode) {
        const error = `This order already has ${e.replaceCode} for its ${kind} — a code made for it that was never printed, tapped or written.`;
        return { ok: false, error, replaceCode: e.replaceCode };
      }
      const error =
        e.reason === "unknown_code"
          ? `No smart link has the code ${e.code || "typed"} — check the code printed under the QR, or tap the stand: the page shows its code.`
          : e.reason === "not_in_stock"
            ? `${e.code} is not in stock: it already has a customer or a destination (search ${e.code} to see who has it).`
            : e.reason === "no_unit"
              ? `This order has no ${kind} left without a smart link.`
              : "This order is cancelled — reopen it first.";
      return { ok: false, error, fields: { code: error } };
    }
    return errorFail(e);
  }
}

// ───────────────────────────── Stands: sell at the counter, return to stock, print log ─────────────────────────────

const sellSchema = z
  .object({
    tagId: id.optional(),
    code: z.string().trim().max(40).optional(),
    customerId: id.optional(),
    newCustomer: z
      .object({
        name: z.string().trim().max(120, "Name is too long.").optional(),
        businessName: z.string().trim().max(120, "Business name is too long.").optional(),
        phone: z.string().trim().min(1, "Enter the client’s phone number.").max(30),
      })
      .optional(),
    destinationUrl: z.string().trim().max(2048).optional(),
    destinationType: z.enum(DEST_TYPES).optional(),
    sale: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("none") }),
      z.object({ mode: z.literal("new"), price: z.string().trim().max(12) }),
      z.object({ mode: z.literal("order"), orderId: id, replace: z.string().trim().max(16).optional() }),
    ]),
  })
  .refine((v) => v.tagId || v.code, { message: "Type the code printed under the QR.", path: ["code"] })
  .refine((v) => v.customerId || v.newCustomer, { message: "Pick the client, or create a new one.", path: ["customerId"] });
export type SellStandInput = z.input<typeof sellSchema>;

export type SellStandResult = {
  tag: TagRow;
  customer: { id: number; name: string; businessName: string | null };
  createdCustomer: boolean;
  matchedByPhone: boolean;
  order: { id: number; number: string } | null;
  activated: boolean;
};

/**
 * "Sell this stand" (walk-in sale, no order needed): a stock stand → an existing or new client (+ Google review link),
 * optionally recorded as an in-person sale or attached to the client's open order. One step, one transaction.
 */
export async function sellStandAction(input: SellStandInput): Promise<ActionResult<SellStandResult>> {
  await requireAdmin();
  const parsed = sellSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const d = parsed.data;
  let url = "";
  let type: DestinationType | undefined;
  if (d.destinationUrl) {
    const picked = d.destinationType ?? (guessDestinationType(d.destinationUrl) as DestinationType);
    const norm = normalizeDestination(picked, d.destinationUrl);
    if (!norm.ok) return { ok: false, error: norm.error, fields: { destinationUrl: norm.error } };
    url = norm.url;
    type = reconcileDestinationType(picked, url) as DestinationType;
  }
  let sale: Parameters<typeof sellStockTag>[0]["sale"] = { mode: "none" };
  if (d.sale.mode === "new") {
    const price = parseDT(d.sale.price);
    if (price == null || Number.isNaN(price) || price < 0) {
      return { ok: false, error: "Enter the price paid in DT (e.g. 59).", fields: { price: "Enter the price paid in DT (e.g. 59)." } };
    }
    sale = { mode: "new", price };
  } else if (d.sale.mode === "order") sale = { mode: "order", orderId: d.sale.orderId, replace: d.sale.replace || undefined };
  try {
    const res = sellStockTag({
      tagId: d.tagId,
      code: d.code,
      customerId: d.customerId,
      newCustomer: d.customerId ? undefined : d.newCustomer,
      destinationUrl: url || undefined,
      destinationType: type,
      sale,
    });
    revalidateAdmin();
    const name = res.customer.businessName?.trim() || res.customer.name;
    return {
      ok: true,
      data: {
        tag: toTagRow(res.tag, name),
        customer: { id: res.customer.id, name: res.customer.name, businessName: res.customer.businessName },
        createdCustomer: res.createdCustomer,
        matchedByPhone: res.matchedByPhone,
        order: res.order,
        activated: res.activated,
      },
    };
  } catch (e) {
    if (e instanceof SellError) {
      const det = e.detail ?? {};
      switch (e.code) {
        case "unknown_code": {
          const sug = det.suggestions?.length ? ` Did you mean ${det.suggestions.slice(0, 3).join(", ")}?` : "";
          const error = `No stand has the code ${det.code || "typed"}.${sug} Tap the stand with your phone: the page shows its code.`;
          return { ok: false, error, fields: { code: error } };
        }
        case "not_in_stock": {
          const error = `${det.code} is not in stock — ${det.owner ? `it belongs to ${det.owner}` : "it already has a destination"}. Return it to stock first if that was a mistake.`;
          return { ok: false, error, fields: { code: error } };
        }
        case "order": {
          const error =
            det.reason === "replace_needed"
              ? `That order already has a code (${det.code}) for this product — refresh and pick the order again, or open it to replace that code with this stand.`
              : det.reason === "cancelled"
                ? "That order is cancelled."
                : e.fields?.price
                  ? "Enter the price paid in DT (e.g. 59)."
                  : "That order can’t take this stand any more — refresh and pick again.";
          return { ok: false, error, fields: { sale: error } };
        }
        default: {
          const mapped = mapFieldCodes(e.fields);
          const error = mapped?.["newCustomer.phone"]
            ? "Enter the client’s phone number (8 digits)."
            : mapped?.["newCustomer.name"]
              ? "Enter the business or contact name."
              : "Pick the client, or create a new one.";
          return { ok: false, error, fields: mapped };
        }
      }
    }
    return errorFail(e);
  }
}

/** Sell form helper: default sale price of this stand and the picked client’s open orders waiting for one. */
export async function sellOptionsAction(input: { tagId: number; customerId: number | null }): Promise<
  ActionResult<{
    price: number | null;
    /** `replace`: the order's unprinted code the stand would replace (sent back as sale.replace). */
    openOrders: { id: number; number: string; status: string; missing: number; replace: string | null }[];
    knownUrl: string | null;
  }>
> {
  await requireAdmin();
  const parsed = z.object({ tagId: id, customerId: id.nullable() }).safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  try {
    return { ok: true, data: sellOptions(parsed.data.tagId, parsed.data.customerId) };
  } catch (e) {
    return errorFail(e);
  }
}

/** "Return to stock": undo a wrong assignment (see releaseToStock; `cancelSale` also cancels its in-person sale). */
export async function releaseTagAction(
  tagId: number,
  opts: { cancelSale?: boolean } = {},
): Promise<
  ActionResult<{
    tag: TagRow;
    removedTaps: number;
    customer: string | null;
    order: { id: number; number: string } | null;
    cancelledSale: { id: number; number: string } | null;
  }>
> {
  await requireAdmin();
  if (!id.safeParse(tagId).success) return { ok: false, error: "Invalid smart link." };
  try {
    const res = releaseToStock(tagId, { cancelSale: opts?.cancelSale === true });
    revalidateAdmin();
    return {
      ok: true,
      data: { tag: toTagRow(res.tag, null), removedTaps: res.removedTaps, customer: res.customer, order: res.order, cancelledSale: res.cancelledSale },
    };
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: unknown }).code === "already_stock") {
      return { ok: false, error: "This stand is already in stock." };
    }
    return errorFail(e);
  }
}

/**
 * The A4 QR sheet (QR codes page → Print sheet) is a print too: record its codes in the print log before the browser
 * prints it, and report how many of them had already been printed.
 */
export async function logPrintSheetAction(ids: number[]): Promise<ActionResult<{ count: number; alreadyPrinted: string[] }>> {
  await requireAdmin();
  const parsed = z.array(id).min(1).max(1000).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Nothing to print." };
  try {
    const rows = await listTagsByIds(parsed.data);
    const done = printedCodes();
    const alreadyPrinted = rows.filter((r) => done.has(r.code)).map((r) => r.code);
    audit("print.sheet", { count: rows.length, codes: rows.map((r) => r.code) });
    revalidateAdmin();
    return { ok: true, data: { count: rows.length, alreadyPrinted } };
  } catch (e) {
    return errorFail(e);
  }
}

const orderSchema = z.object({
  channel: z.enum(["manual", "whatsapp"]),
  locale: z.enum(["fr", "en"]),
  items: z
    .array(
      z.object({
        productId: id,
        qty: z.number().int().min(1).max(99),
        businessName: z.string().trim().max(120).optional(),
        destinationUrl: z.string().trim().max(2048).optional(),
      }),
    )
    .min(1, "Add at least one product.")
    .max(50),
  customer: z.object({
    name: z.string().trim().min(1, "Required.").max(120),
    phone: z.string().trim().min(1, "Required.").max(30),
    email: z.string().trim().max(200).optional(),
    businessName: z.string().trim().max(120).optional(),
    governorate: z.string().trim().min(1, "Choose a governorate."),
    city: z.string().trim().min(1, "Required.").max(80),
    address: z.string().trim().min(1, "Required.").max(300),
    notes: z.string().trim().max(1000).optional(),
  }),
});
export type CreateOrderActionInput = z.input<typeof orderSchema>;

export async function createOrderAction(input: CreateOrderActionInput): Promise<ActionResult<{ id: number; number: string }>> {
  await requireAdmin();
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const d = parsed.data;
  const blank = (v?: string) => (v && v.trim() ? v.trim() : undefined);
  try {
    const { order } = await createOrder({
      channel: d.channel,
      locale: d.locale,
      items: d.items.map((i) => ({ productId: i.productId, qty: i.qty, businessName: blank(i.businessName), destinationUrl: blank(i.destinationUrl) })),
      customer: {
        name: d.customer.name,
        phone: d.customer.phone,
        email: blank(d.customer.email),
        businessName: blank(d.customer.businessName),
        governorate: d.customer.governorate,
        city: d.customer.city,
        address: d.customer.address,
        notes: blank(d.customer.notes),
      },
    });
    revalidateAdmin();
    return { ok: true, data: { id: order.id, number: order.number } };
  } catch (e) {
    return errorFail(e);
  }
}

export async function checkDiscountAction(phone: string): Promise<{ eligible: boolean; pct: number }> {
  await requireAdmin();
  const p = normalizePhone(String(phone ?? ""));
  if (!p) return { eligible: false, pct: 0 };
  try {
    return await checkDiscount(p);
  } catch {
    return { eligible: false, pct: 0 };
  }
}

// ───────────────────────────── Customers ─────────────────────────────

const customerSchema = z.object({
  id,
  name: z.string().trim().min(1, "Required.").max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().max(200).optional(),
  businessName: z.string().trim().max(120).optional(),
  governorate: z.string().trim().max(60).optional(),
  city: z.string().trim().max(80).optional(),
  address: z.string().trim().max(300).optional(),
  notes: z.string().max(2000, "Notes are too long (2000 max).").optional(),
  discountAvailable: z.boolean().optional(),
});
export type UpdateCustomerInput = z.input<typeof customerSchema>;

export async function updateCustomerAction(input: UpdateCustomerInput): Promise<ActionResult> {
  await requireAdmin();
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const { id: customerId, ...rest } = parsed.data;
  const nul = (v: string | undefined) => (v === undefined ? undefined : v.trim() ? v.trim() : null);
  try {
    await updateCustomer(customerId, {
      name: rest.name,
      phone: rest.phone,
      email: nul(rest.email),
      businessName: nul(rest.businessName),
      governorate: nul(rest.governorate),
      city: nul(rest.city),
      address: nul(rest.address),
      notes: rest.notes === undefined ? undefined : rest.notes.trim() ? rest.notes : null,
      discountAvailable: rest.discountAvailable,
    });
    revalidateAdmin();
    return { ok: true, data: null };
  } catch (e) {
    return errorFail(e);
  }
}

/** Deletion request (privacy policy): blank the customer's personal data, keep their orders' accounting data. */
export async function anonymizeCustomerAction(customerId: number): Promise<ActionResult> {
  await requireAdmin();
  const parsed = id.safeParse(customerId);
  if (!parsed.success) return zodFail(parsed.error);
  try {
    anonymizeCustomer(parsed.data);
    revalidateAdmin();
    return { ok: true, data: null };
  } catch (e) {
    return errorFail(e);
  }
}

// ───────────────────────────── Catalog ─────────────────────────────

const dtString = z.string().trim().max(12);
const productSchema = z.object({
  id: id.optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, digits and dashes (e.g. pack-salon).")
    .max(60),
  kind: z.enum(PRODUCT_KINDS),
  nameEn: z.string().trim().min(1, "English name is required.").max(120),
  nameFr: z.string().trim().min(1, "French name is required.").max(120),
  taglineEn: z.string().trim().max(200).default(""),
  taglineFr: z.string().trim().max(200).default(""),
  descEn: z.string().trim().max(5000).default(""),
  descFr: z.string().trim().max(5000).default(""),
  price: dtString,
  compareAt: dtString.default(""),
  salePrice: dtString.default(""),
  saleEndsAt: z.number().int().positive().nullable().default(null),
  image: z.string().trim().regex(/^\/[A-Za-z0-9._\-/]+$/, "Pick an image."),
  model: z.string().trim().default(""),
  active: z.boolean(),
  sort: z.number().int().min(-1000).max(1000).default(0),
});
export type UpsertProductActionInput = z.input<typeof productSchema>;

export async function upsertProductAction(input: UpsertProductActionInput): Promise<ActionResult<{ product: Product }>> {
  await requireAdmin();
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const d = parsed.data;
  const price = parseDT(d.price);
  if (price == null || Number.isNaN(price) || price <= 0) {
    return { ok: false, error: "Enter a price in DT (e.g. 59 or 59.500).", fields: { price: "Enter a price in DT (e.g. 59.500)." } };
  }
  const compareAt = parseDT(d.compareAt);
  if (compareAt !== null && (Number.isNaN(compareAt) || compareAt <= price)) {
    return { ok: false, error: "The “was” price must be higher than the price.", fields: { compareAt: "Must be higher than the price (or empty)." } };
  }
  const salePrice = parseDT(d.salePrice);
  if (salePrice !== null && (Number.isNaN(salePrice) || salePrice <= 0 || salePrice >= price)) {
    return { ok: false, error: "The promo price must be lower than the price.", fields: { salePrice: "Must be lower than the regular price (or empty)." } };
  }
  if ((salePrice === null) !== (d.saleEndsAt === null)) {
    return salePrice === null
      ? { ok: false, error: "Enter the promo price, or clear the end date.", fields: { salePrice: "Required with an end date." } }
      : { ok: false, error: "Pick when the promo ends.", fields: { saleEndsAt: "Required with a promo price." } };
  }
  if (d.model && !/^\/models\/[A-Za-z0-9._-]+\.glb$/.test(d.model)) {
    return { ok: false, error: "Invalid 3D model path.", fields: { model: "Pick a model or leave empty." } };
  }
  try {
    const product = await upsertProduct({
      id: d.id,
      slug: d.slug,
      kind: d.kind,
      nameEn: d.nameEn,
      nameFr: d.nameFr,
      taglineEn: d.taglineEn,
      taglineFr: d.taglineFr,
      descEn: d.descEn,
      descFr: d.descFr,
      price,
      compareAt,
      salePrice,
      saleEndsAt: d.saleEndsAt,
      image: d.image,
      model: d.model || null,
      active: d.active,
      sort: d.sort,
    });
    revalidateSite();
    return { ok: true, data: { product } };
  } catch (e) {
    return errorFail(e);
  }
}

export async function setProductActiveAction(input: { id: number; active: boolean }): Promise<ActionResult> {
  await requireAdmin();
  const parsed = z.object({ id, active: z.boolean() }).safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  try {
    await setProductActive(parsed.data.id, parsed.data.active);
    revalidateSite();
    return { ok: true, data: null };
  } catch (e) {
    return errorFail(e);
  }
}

// ───────────────────────────── Settings ─────────────────────────────

const settingsSchema = z.object({
  deliveryFee: dtString,
  freeDeliveryThreshold: dtString,
  returningDiscountPct: z.number().int("Whole percent only.").min(0, "Between 0 and 90%.").max(90, "Between 0 and 90%."),
  phone: z.string().trim().max(30),
  whatsapp: z.string().trim().max(30),
  email: z.string().trim().max(200),
  instagram: z.string().trim().max(300),
  facebook: z.string().trim().max(300),
  tiktok: z.string().trim().max(300),
  legalName: z.string().trim().max(120, "120 characters max.").optional(),
  taxId: z.string().trim().max(40, "40 characters max.").optional(),
  address: z.string().trim().max(200, "200 characters max.").optional(),
  storeOpen: z.boolean(),
});
export type UpdateSettingsInput = z.input<typeof settingsSchema>;


export async function updateSettingsAction(input: UpdateSettingsInput): Promise<ActionResult<{ settings: SettingsView }>> {
  await requireAdmin();
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const d = parsed.data;
  const fee = parseDT(d.deliveryFee);
  const threshold = parseDT(d.freeDeliveryThreshold);
  const fields: FieldErrors = {};
  if (fee == null || Number.isNaN(fee)) fields.deliveryFee = "Enter an amount in DT (e.g. 7).";
  if (threshold == null || Number.isNaN(threshold)) fields.freeDeliveryThreshold = "Enter an amount in DT (e.g. 99).";
  if (Object.keys(fields).length) return { ok: false, error: Object.values(fields)[0], fields };

  const patch: Parameters<typeof updateSettings>[0] = {
    deliveryFee: fee as number,
    freeDeliveryThreshold: threshold as number,
    returningDiscountPct: d.returningDiscountPct,
    phone: d.phone,
    whatsapp: d.whatsapp,
    email: d.email,
    instagram: d.instagram,
    facebook: d.facebook,
    tiktok: d.tiktok,
    legalName: d.legalName,
    taxId: d.taxId,
    address: d.address,
    storeOpen: d.storeOpen,
  };

  try {
    const s = await updateSettings(patch);
    revalidateSite();
    return { ok: true, data: { settings: settingsView(s) } };
  } catch (e) {
    return errorFail(e);
  }
}
