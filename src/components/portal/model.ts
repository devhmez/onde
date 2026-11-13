// Client page (onde.tn/c/<token>) — client-safe types and constants shared by the page, its client components, the
// server layer (src/server/portal.ts) and the admin "Client page" card. No server imports here.
import type { DestinationType, TagKind } from "../admin/types";

export type PortalMode = "direct" | "approval";
export const PORTAL_MODES = ["direct", "approval"] as const satisfies readonly PortalMode[];

/** Client link changes allowed per customer per rolling 24 h (direct changes + approval requests). */
export const PORTAL_DAILY_LIMIT = 20;
/** Location label ("Comptoir", "Terrasse") max length. */
export const LOCATION_MAX = 40;

/** What the client picks in "Changer le lien". */
export const LINK_CHOICES = ["google", "instagram", "facebook", "tiktok", "site", "whatsapp", "other"] as const;
export type LinkChoice = (typeof LINK_CHOICES)[number];

/** Destination type a choice maps to before URL detection ("site" keeps "menu" when the stand already was a menu). */
export const CHOICE_TYPE: Record<LinkChoice, DestinationType> = {
  google: "google_review",
  instagram: "instagram",
  facebook: "facebook",
  tiktok: "tiktok",
  site: "website",
  whatsapp: "whatsapp",
  other: "custom",
};

/** Choice pre-selected in the change sheet for the current destination type. */
export function choiceForType(t: DestinationType): LinkChoice {
  switch (t) {
    case "google_review":
      return "google";
    case "instagram":
    case "facebook":
    case "tiktok":
    case "whatsapp":
      return t;
    case "menu":
    case "website":
      return "site";
    default:
      return "other";
  }
}

/** Stable error codes returned by the client-page actions (translated by the page). */
export const LINK_ERRORS = [
  "empty",
  "invalid",
  "not_https",
  "blocked_host",
  "wrong_platform",
  "too_long",
  "same",
  /** The client's PORTAL_DAILY_LIMIT link changes in a rolling 24 h are used up (the dialog shows its "limit" notice). */
  "daily_limit",
  /** A short-term throttle (per IP / per hour / per day for labels): try again in a few minutes. */
  "rate_limited",
  "disabled",
  "unknown",
  "expired",
  "failed",
] as const;
export type LinkError = (typeof LINK_ERRORS)[number];

export type StandVariant = "white" | "black" | null;

/** One product as the client sees it. Never carries internal ids, notes, order data or other customers. */
export type PortalStand = {
  code: string;
  kind: TagKind;
  variant: StandVariant;
  location: string | null;
  destType: DestinationType;
  destUrl: string;
  active: boolean;
  taps30d: number;
  lastTapAt: number | null;
  /** Waiting for the owner (approval mode). */
  pending: { type: DestinationType; url: string; at: number } | null;
  /** Outcome of the latest request when it was decided in the last days (and nothing newer happened). */
  outcome: { status: "approved" | "rejected"; type: DestinationType; url: string; at: number } | null;
};

export type PortalView = {
  business: string;
  mode: PortalMode;
  totals: { today: number; d7: number; d30: number; all: number };
  /** Last 30 Tunisian calendar days, oldest first (YYYY-MM-DD). */
  series: { date: string; taps: number }[];
  /** NFC vs QR over the same 30 days. */
  split: { nfc: number; qr: number };
  stands: PortalStand[];
  /** Link changes still allowed in the rolling 24 h window. */
  changesLeft: number;
  /** ONDE WhatsApp number (international digits) for the help link, "" when not set. */
  whatsapp: string;
  /** When these figures were computed (unix ms) — "now" for relative times. */
  generatedAt: number;
};

export type LinkPreview = { type: DestinationType; url: string };

export type PreviewResult = { ok: true; preview: LinkPreview } | { ok: false; error: LinkError };
export type SubmitResult =
  | { ok: true; status: "applied" | "pending"; preview: LinkPreview; changesLeft: number }
  | { ok: false; error: LinkError };
export type SimpleResult = { ok: true } | { ok: false; error: LinkError };
