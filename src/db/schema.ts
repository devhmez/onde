// ONDE data model (SQLite via better-sqlite3 + drizzle-orm). Money = integer millimes (1 DT = 1000).
import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  kind: text("kind", { enum: ["stand", "card", "keychain", "sticker", "pack"] }).notNull(),
  nameEn: text("name_en").notNull(),
  nameFr: text("name_fr").notNull(),
  taglineEn: text("tagline_en").notNull().default(""),
  taglineFr: text("tagline_fr").notNull().default(""),
  descEn: text("desc_en").notNull().default(""),
  descFr: text("desc_fr").notNull().default(""),
  price: integer("price").notNull(), // millimes
  compareAt: integer("compare_at"), // millimes, optional "was" price
  salePrice: integer("sale_price"), // millimes, time-limited promo price (see src/lib/sale.ts)
  saleEndsAt: integer("sale_ends_at"), // unix ms — the regular price applies again after this
  image: text("image").notNull(), // /products/*.webp
  model: text("model"), // /models/*.glb
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sort: integer("sort").notNull().default(0),
  createdAt: integer("created_at").notNull(), // unix ms
});

export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(), // normalized 8 digits (Tunisia), e.g. "25875529"
  email: text("email"),
  businessName: text("business_name"),
  governorate: text("governorate"),
  city: text("city"),
  address: text("address"),
  discountAvailable: integer("discount_available", { mode: "boolean" }).notNull().default(false),
  notes: text("notes"),
  createdAt: integer("created_at").notNull(),
  // Client page (onde.tn/c/<token>, see src/server/portal.ts): private capability link, off until the owner creates it.
  portalToken: text("portal_token").unique(), // ≥128-bit random, base64url; regenerating it kills the old link
  portalEnabled: integer("portal_enabled", { mode: "boolean" }).notNull().default(false),
  portalMode: text("portal_mode", { enum: ["direct", "approval"] }).notNull().default("direct"), // approval = owner validates each change
  portalCreatedAt: integer("portal_created_at"), // when the current link was created / regenerated
  portalSeenAt: integer("portal_seen_at"), // last visit of the client (bots and owner previews excluded)
});

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  number: text("number").notNull().unique(), // "OND-1001"
  customerId: integer("customer_id").notNull().references(() => customers.id),
  status: text("status", { enum: ["new", "confirmed", "preparing", "shipped", "delivered", "cancelled"] }).notNull().default("new"),
  channel: text("channel", { enum: ["web", "whatsapp", "manual"] }).notNull().default("web"),
  locale: text("locale").notNull().default("fr"),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  governorate: text("governorate").notNull(),
  city: text("city").notNull(),
  address: text("address").notNull(),
  notes: text("notes"),
  subtotal: integer("subtotal").notNull(),
  discount: integer("discount").notNull().default(0),
  discountReason: text("discount_reason"), // "returning_10"
  deliveryFee: integer("delivery_fee").notNull(),
  total: integer("total").notNull(),
  paymentMethod: text("payment_method").notNull().default("cod"), // cash on delivery for now
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [index("orders_status_idx").on(t.status), index("orders_created_idx").on(t.createdAt)]);

export const orderItems = sqliteTable("order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => products.id),
  productName: text("product_name").notNull(),
  kind: text("kind").notNull(),
  unitPrice: integer("unit_price").notNull(),
  qty: integer("qty").notNull(),
  lineTotal: integer("line_total").notNull(),
  businessName: text("business_name"), // what to print / configure
  destinationUrl: text("destination_url"), // e.g. Google review link the customer wants
});

// A physical NFC product in the field = one permanent smart link onde.tn/t/CODE
export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(), // 6 chars, no look-alikes
  label: text("label").notNull().default(""), // e.g. "Café Lumière — counter stand"
  kind: text("kind", { enum: ["stand", "card", "keychain", "sticker"] }).notNull(),
  customerId: integer("customer_id").references(() => customers.id),
  orderId: integer("order_id").references(() => orders.id),
  destinationType: text("destination_type", {
    enum: ["google_review", "instagram", "tiktok", "facebook", "menu", "website", "contact", "whatsapp", "custom"],
  }).notNull().default("google_review"),
  destinationUrl: text("destination_url").notNull().default(""),
  status: text("status", { enum: ["active", "disabled"] }).notNull().default("active"),
  // Physical NFC chip of this product: none (not written yet) → written → tested (a real NFC tap reached the link) →
  // locked (read-only, permanent). Set by hand in the admin; an NFC tap moves none/written to tested automatically.
  chipStatus: text("chip_status", { enum: ["none", "written", "tested", "locked"] }).notNull().default("none"),
  chipAt: integer("chip_at"), // unix ms of the last chip-status change
  notes: text("notes"),
  tapCount: integer("tap_count").notNull().default(0),
  lastTapAt: integer("last_tap_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  locationLabel: text("location_label"), // where the product stands at the client's ("Comptoir", "Terrasse"); owner + client editable
  customerSince: integer("customer_since"), // when it moved to its current customer (client page counts taps from here); null = always theirs
}, (t) => [index("tags_customer_idx").on(t.customerId)]);

export const taps = sqliteTable("taps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tagId: integer("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  ts: integer("ts").notNull(),
  source: text("source", { enum: ["nfc", "qr"] }).notNull(),
  device: text("device", { enum: ["ios", "android", "desktop", "other"] }).notNull(),
  referer: text("referer"),
  ipHash: text("ip_hash"), // sha256(ip + daily salt) — privacy-preserving uniques
}, (t) => [index("taps_tag_ts_idx").on(t.tagId, t.ts), index("taps_ts_idx").on(t.ts)]);

export const destinationHistory = sqliteTable("destination_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tagId: integer("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  fromType: text("from_type"),
  fromUrl: text("from_url"),
  toType: text("to_type").notNull(),
  toUrl: text("to_url").notNull(),
  changedAt: integer("changed_at").notNull(),
  actor: text("actor", { enum: ["owner", "client"] }), // who changed it; null = the owner (rows before the client page)
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const pageViews = sqliteTable("page_views", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ts: integer("ts").notNull(),
  path: text("path").notNull(),
  locale: text("locale"),
  device: text("device"),
  referrer: text("referrer"),
  visitor: text("visitor"), // daily-salted hash, no PII
}, (t) => [index("pv_ts_idx").on(t.ts)]);

export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ts: integer("ts").notNull(),
  action: text("action").notNull(),
  details: text("details"),
});

// Web Push (new-order alerts on the owner's phone / computers). One row per browser push subscription.
// `origin` = the admin origin the device subscribed from (e.g. https://admin.onde.tn): notification links are built on it.
export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  endpoint: text("endpoint").notNull().unique(), // push-service URL (Apple / Google / Mozilla / Microsoft) — never shown in full
  p256dh: text("p256dh").notNull(), // browser public key (base64url) used to encrypt payloads
  auth: text("auth").notNull(), // browser auth secret (base64url)
  origin: text("origin").notNull(),
  label: text("label"), // "iPhone", "Mac · Safari", …
  userAgent: text("user_agent"),
  createdAt: integer("created_at").notNull(),
  lastSeenAt: integer("last_seen_at"), // last time the device re-registered itself
  lastSuccessAt: integer("last_success_at"), // last push accepted by the push service
  lastError: text("last_error"),
  failures: integer("failures").notNull().default(0), // consecutive temporary failures (429 / 5xx / network)
});

// The server's VAPID key pair (single row, id = 1). Generated once and never changed: every subscription is bound to
// the public key. The private key never leaves the server (not in exports, settings, logs or the audit log).
export const vapidKeys = sqliteTable("vapid_keys", {
  id: integer("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  subject: text("subject").notNull(),
  createdAt: integer("created_at").notNull(),
});

// Destination changes made by clients from their client page (src/server/portal.ts). In "direct" mode the change is
// applied at once (status "applied"); in "approval" mode it waits as "pending" until the owner approves or rejects it.
// One pending request per product: a newer one marks the previous one "replaced". Rows also drive the daily rate limit.
export const portalRequests = sqliteTable("portal_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  tagId: integer("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  mode: text("mode", { enum: ["direct", "approval"] }).notNull(),
  status: text("status", { enum: ["applied", "pending", "approved", "rejected", "replaced", "cancelled"] }).notNull(),
  fromType: text("from_type"),
  fromUrl: text("from_url"),
  toType: text("to_type").notNull(),
  toUrl: text("to_url").notNull(),
  createdAt: integer("created_at").notNull(),
  decidedAt: integer("decided_at"),
}, (t) => [
  index("portal_requests_customer_idx").on(t.customerId, t.createdAt),
  index("portal_requests_tag_idx").on(t.tagId, t.createdAt),
  uniqueIndex("portal_requests_one_pending").on(t.tagId).where(sql`${t.status} = 'pending'`),
]);
