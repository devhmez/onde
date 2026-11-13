import "server-only";
import { getDb, type Executor } from "../db";
import { settings as settingsTable } from "../db/schema";
import { DEFAULT_RULES, normalizePhone } from "../lib/business";
import { audit } from "./audit";
import { DataError } from "./errors";
import type { FieldErrors, PublicSettings, Rules, Settings } from "./types";

export const SETTINGS_DEFAULTS: Settings = {
  deliveryFee: DEFAULT_RULES.deliveryFee,
  freeDeliveryThreshold: DEFAULT_RULES.freeDeliveryThreshold,
  returningDiscountPct: DEFAULT_RULES.returningDiscountPct,
  phone: "25875529",
  whatsapp: "21625875529",
  email: "",
  instagram: "",
  facebook: "",
  tiktok: "",
  legalName: "",
  taxId: "",
  address: "",
  storeOpen: true,
};

const NUMBER_KEYS = ["deliveryFee", "freeDeliveryThreshold", "returningDiscountPct"] as const;
const SETTING_KEYS = Object.keys(SETTINGS_DEFAULTS) as (keyof Settings)[];

function toInt(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

/** Synchronous read — usable inside a better-sqlite3 transaction (pass `tx`). */
export function readSettings(executor?: Executor): Settings {
  const rows = (executor ?? getDb()).select().from(settingsTable).all();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const str = (k: keyof Settings) => (map.has(k) ? String(map.get(k)) : String(SETTINGS_DEFAULTS[k]));
  return {
    deliveryFee: Math.max(0, toInt(map.get("deliveryFee"), SETTINGS_DEFAULTS.deliveryFee)),
    freeDeliveryThreshold: Math.max(0, toInt(map.get("freeDeliveryThreshold"), SETTINGS_DEFAULTS.freeDeliveryThreshold)),
    returningDiscountPct: Math.min(100, Math.max(0, toInt(map.get("returningDiscountPct"), SETTINGS_DEFAULTS.returningDiscountPct))),
    phone: str("phone"),
    whatsapp: str("whatsapp"),
    email: str("email"),
    instagram: str("instagram"),
    facebook: str("facebook"),
    tiktok: str("tiktok"),
    legalName: str("legalName"),
    taxId: str("taxId"),
    address: str("address"),
    storeOpen: map.has("storeOpen") ? map.get("storeOpen") !== "false" : SETTINGS_DEFAULTS.storeOpen,
  };
}

export function rulesFrom(s: Settings): Rules {
  return {
    deliveryFee: s.deliveryFee,
    freeDeliveryThreshold: s.freeDeliveryThreshold,
    returningDiscountPct: s.returningDiscountPct,
  };
}

export async function getSettings(): Promise<Settings> {
  return readSettings();
}

export async function getPublicSettings(): Promise<PublicSettings> {
  const s = readSettings();
  return {
    deliveryFee: s.deliveryFee,
    freeDeliveryThreshold: s.freeDeliveryThreshold,
    returningDiscountPct: s.returningDiscountPct,
    phone: s.phone,
    whatsapp: s.whatsapp,
    email: s.email,
    instagram: s.instagram,
    facebook: s.facebook,
    tiktok: s.tiktok,
    storeOpen: s.storeOpen,
  };
}

export async function getRules(): Promise<Rules> {
  return rulesFrom(readSettings());
}

// ---------------------------------------------------------------------------------------------------------------
// Normalizers for the owner-editable contact/social values

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Matricule fiscal ("1234567/A/B/M/000", "1234567ABM000") or RNE identifier ("1234567A").
const TAX_ID_RE = /^[A-Z0-9][A-Z0-9 ./-]{3,39}$/;

function socialUrl(raw: string, network: "instagram" | "facebook" | "tiktok"): string | null {
  const v = raw.trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      u.protocol = "https:";
      return u.toString();
    } catch {
      return null;
    }
  }
  if (/^(www\.)?(instagram\.com|facebook\.com|fb\.com|tiktok\.com)\//i.test(v)) return `https://${v}`;
  const handle = v.replace(/^@/, "");
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(handle)) return null;
  if (network === "instagram") return `https://www.instagram.com/${handle}`;
  if (network === "tiktok") return `https://www.tiktok.com/@${handle}`;
  return `https://www.facebook.com/${handle}`;
}

function whatsappDigits(raw: string): string | null {
  const d = raw.replace(/\D/g, "").replace(/^00/, "");
  if (!d) return "";
  if (/^[2-9]\d{7}$/.test(d)) return `216${d}`; // local Tunisian number → international
  return /^\d{8,15}$/.test(d) ? d : null;
}

function intIn(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= min && r <= max ? r : null;
}

/**
 * Validate + persist a partial settings patch. Money values are millimes. Social values accept a URL or a handle
 * (normalized to a full https URL); `whatsapp` accepts a local 8-digit number (prefixed with 216) or international digits.
 * Throws DataError("validation", fields) when a value is invalid. Returns the full settings after the update.
 */
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const fields: FieldErrors = {};
  const out: Partial<Record<keyof Settings, string>> = {};

  for (const key of Object.keys(patch) as (keyof Settings)[]) {
    if (!SETTING_KEYS.includes(key)) continue;
    const value = patch[key];
    if (value === undefined) continue;

    if ((NUMBER_KEYS as readonly string[]).includes(key)) {
      const n = key === "returningDiscountPct" ? intIn(value, 0, 90) : intIn(value, 0, 10_000_000);
      if (n == null) fields[key] = "invalid";
      else out[key] = String(n);
      continue;
    }
    if (key === "storeOpen") {
      out.storeOpen = value === true || value === "true" ? "true" : "false";
      continue;
    }
    const s = typeof value === "string" ? value.trim() : String(value ?? "").trim();
    if (s.length > 500) {
      fields[key] = "too_long";
      continue;
    }
    switch (key) {
      case "phone": {
        if (!s) out.phone = "";
        else {
          const p = normalizePhone(s);
          if (p) out.phone = p;
          else fields.phone = "invalid_phone";
        }
        break;
      }
      case "whatsapp": {
        const w = whatsappDigits(s);
        if (w == null) fields.whatsapp = "invalid_phone";
        else out.whatsapp = w;
        break;
      }
      case "email": {
        if (s && !EMAIL_RE.test(s)) fields.email = "invalid_email";
        else out.email = s.toLowerCase();
        break;
      }
      case "legalName": {
        if (s.length > 120) fields.legalName = "too_long";
        else out.legalName = s.replace(/\s+/g, " ");
        break;
      }
      case "taxId": {
        const t = s.toUpperCase().replace(/\s+/g, " ");
        if (t && !TAX_ID_RE.test(t)) fields.taxId = t.length > 40 ? "too_long" : "invalid";
        else out.taxId = t;
        break;
      }
      case "address": {
        if (s.length > 200) fields.address = "too_long";
        else out.address = s.replace(/\s+/g, " ");
        break;
      }
      case "instagram":
      case "facebook":
      case "tiktok": {
        const u = socialUrl(s, key);
        if (u == null) fields[key] = "invalid_url";
        else out[key] = u;
        break;
      }
      default:
        out[key] = s;
    }
  }

  if (Object.keys(fields).length) throw new DataError("validation", fields);

  const entries = Object.entries(out) as [keyof Settings, string][];
  if (entries.length) {
    const db = getDb();
    db.transaction((tx) => {
      for (const [key, value] of entries) {
        tx.insert(settingsTable)
          .values({ key, value })
          .onConflictDoUpdate({ target: settingsTable.key, set: { value } })
          .run();
      }
      audit("settings.update", Object.fromEntries(entries), tx);
    });
  }
  return readSettings();
}
