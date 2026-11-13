// Client-safe view types for the admin UI. Derived from the Drizzle schema (type-only imports — nothing from the DB
// layer reaches the client bundle).
import type {
  customers,
  destinationHistory,
  orderItems,
  orders,
  products,
  tags,
} from "@/db/schema";

export type Tag = typeof tags.$inferSelect;
export type TagKind = Tag["kind"];
export type TagStatus = Tag["status"];
export type ChipStatus = Tag["chipStatus"];
export type DestinationType = Tag["destinationType"];
export type Order = typeof orders.$inferSelect;
export type OrderStatus = Order["status"];
export type OrderChannel = Order["channel"];
export type OrderItem = typeof orderItems.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Product = typeof products.$inferSelect;
export type ProductKind = Product["kind"];
export type DestinationChange = typeof destinationHistory.$inferSelect;

/** A smart link as shown in tables: the tag row + display customer name + its absolute permanent URL. */
export type TagRow = Tag & { customerName: string | null; link: string };

/** Extra data loaded for the tag selected in the Products workspace (and on the stand page). */
export type TagDetail = {
  row: TagRow;
  taps30d: number;
  history: DestinationChange[];
  customer: { id: number; name: string; businessName: string | null; phone: string } | null;
  order: { id: number; number: string; status: string } | null;
  /** Last print download of this code (print log), null = never printed. */
  printedAt: number | null;
  /** The in-person sale this stand was handed over with (still counted, its only stand): Return to stock offers to cancel it. */
  inPersonSale: { id: number; number: string; total: number } | null;
};

/** A stand in "Find a stand" results (GET /api/admin/find). */
export type StandHit = {
  id: number;
  code: string;
  kind: TagKind;
  product: string;
  status: TagStatus;
  stock: boolean;
  chipStatus: ChipStatus;
  customerId: number | null;
  customerName: string | null;
  destinationType: DestinationType;
  destinationUrl: string;
  tapCount: number;
};

export type FindResponse = {
  code: string;
  exact: StandHit | null;
  readAs: string | null;
  noSuchCode: boolean;
  suggestions: StandHit[];
  /** Codes that differ from the found one only by look-alike characters (C/G/Q, U/V, M/N…). */
  lookalikes: StandHit[];
  partial: StandHit[];
  customers: { id: number; name: string; businessName: string | null; phone: string; stands: { id: number; code: string; kind: TagKind; product: string; status: TagStatus }[] }[];
  recent: StandHit[];
};

/** A customer's stand with its figures (customer page cards, QR page). */
export type StandCard = TagRow & { taps30d: number; printedAt: number | null; product: string };

/** Lightweight customer option for pickers. */
export type CustomerOption = { id: number; name: string; businessName: string | null; phone: string };

export type FieldErrors = Record<string, string>;
export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string; fields?: FieldErrors };

export type SeriesPoint = { label: string; value: number };

/** Settings as shown in the admin form. Money in millimes. */
export type SettingsView = {
  deliveryFee: number;
  freeDeliveryThreshold: number;
  returningDiscountPct: number;
  phone: string;
  whatsapp: string;
  email: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  legalName: string;
  taxId: string;
  address: string;
  storeOpen: boolean;
};
