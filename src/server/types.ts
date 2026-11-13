import "server-only";
// Row types and shared server-side types. Client components may `import type` from here (type imports are erased).
import type {
  auditLog,
  customers,
  destinationHistory,
  orderItems,
  orders,
  pageViews,
  products,
  tags,
  taps,
} from "../db/schema";
import type { Rules } from "../lib/business";

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type Tap = typeof taps.$inferSelect;
export type DestinationHistory = typeof destinationHistory.$inferSelect;
export type PageView = typeof pageViews.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;

export type ProductKind = Product["kind"];
export type OrderStatus = Order["status"];
export type OrderChannel = Order["channel"];
export type TagKind = Tag["kind"];
export type TagStatus = Tag["status"];
export type ChipStatus = Tag["chipStatus"];
export type DestinationType = Tag["destinationType"];
export type TapSource = Tap["source"];
export type Device = Tap["device"];
export type Locale = "fr" | "en";

export const PRODUCT_KINDS = ["stand", "card", "keychain", "sticker", "pack"] as const satisfies readonly ProductKind[];
export const ORDER_STATUSES = ["new", "confirmed", "preparing", "shipped", "delivered", "cancelled"] as const satisfies readonly OrderStatus[];
export const ORDER_CHANNELS = ["web", "whatsapp", "manual"] as const satisfies readonly OrderChannel[];
export const TAG_KINDS = ["stand", "card", "keychain", "sticker"] as const satisfies readonly TagKind[];
export const TAG_STATUSES = ["active", "disabled"] as const satisfies readonly TagStatus[];
export const CHIP_STATUSES = ["none", "written", "tested", "locked"] as const satisfies readonly ChipStatus[];
export const DESTINATION_TYPES = [
  "google_review",
  "instagram",
  "tiktok",
  "facebook",
  "menu",
  "website",
  "contact",
  "whatsapp",
  "custom",
] as const satisfies readonly DestinationType[];

export type { Rules };

/** Typed settings (DB stores strings). Money values are integer millimes. */
export type Settings = {
  deliveryFee: number;
  freeDeliveryThreshold: number;
  returningDiscountPct: number;
  phone: string; // 8 digits, e.g. "25875529"
  whatsapp: string; // international digits for wa.me, e.g. "21625875529"
  email: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  /** Optional legal identity for the legal notice page ("" = hidden). Read server-side by the legal pages only. */
  legalName: string; // raison sociale / nom commercial
  taxId: string; // matricule fiscal / RNE
  address: string; // business / postal address of the seller (CGV + privacy controller)
  storeOpen: boolean;
};

/** Settings safe to expose to the browser (the legal identity is rendered server-side instead). */
export type PublicSettings = Omit<Settings, "legalName" | "taxId" | "address">;

export type CreateOrderItemInput = {
  productId: number;
  qty: number;
  businessName?: string;
  destinationUrl?: string;
};

export type CreateOrderCustomerInput = {
  name: string;
  phone: string;
  email?: string;
  businessName?: string;
  governorate: string;
  city: string;
  address: string;
  notes?: string;
};

export type CreateOrderInput = {
  items: CreateOrderItemInput[];
  customer: CreateOrderCustomerInput;
  locale: Locale;
  channel?: OrderChannel;
};

/** Field-level error codes (locale-agnostic; the UI translates them). */
export type FieldErrorCode =
  | "required"
  | "invalid"
  | "invalid_phone"
  | "invalid_email"
  | "invalid_url"
  | "invalid_governorate"
  | "too_long"
  | "too_many"
  | "unavailable"
  | "taken";

export type FieldErrors = Record<string, FieldErrorCode>;

/** Localized public projection of a catalog product (what /api/products returns). */
export type PublicProduct = {
  id: number;
  slug: string;
  kind: ProductKind;
  name: string;
  tagline: string;
  description: string;
  price: number;
  compareAt: number | null;
  /** Set while a time-limited sale runs (price = sale price, compareAt = regular price). */
  saleEndsAt: number | null;
  image: string;
  model: string | null;
  sort: number;
};

/** Non-PII view of an order — safe for the public thank-you page. */
export type PublicOrderSummary = {
  number: string;
  status: OrderStatus;
  locale: string;
  subtotal: number;
  discount: number;
  discountReason: string | null;
  deliveryFee: number;
  total: number;
  paymentMethod: string;
  createdAt: number;
  firstName: string;
  items: { productName: string; qty: number; unitPrice: number; lineTotal: number }[];
};
