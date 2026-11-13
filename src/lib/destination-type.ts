// Destination type guessed from a URL — shared by the server (authoritative) and the admin edit panel (live hint).
// Client-safe: no Node APIs.

export type GuessedDestinationType =
  | "google_review"
  | "instagram"
  | "tiktok"
  | "facebook"
  | "menu"
  | "website"
  | "contact"
  | "whatsapp"
  | "custom";

/** Types a URL identifies on its own (host or scheme). "website" / "menu" / "custom" are the owner's choice. */
export const PLATFORM_TYPES = ["google_review", "instagram", "tiktok", "facebook", "whatsapp", "contact"] as const;

/** Guess the destination type from a URL (google → google_review, instagram, tiktok, facebook, wa.me → whatsapp…). */
export function guessDestinationType(url: string): GuessedDestinationType {
  const v = (url || "").toLowerCase();
  if (!v) return "google_review";
  if (v.startsWith("tel:") || v.startsWith("mailto:") || v.startsWith("sms:") || /\.vcf(\?|$)/.test(v)) return "contact";
  let host = "";
  try {
    host = new URL(v).hostname.replace(/^www\./, "");
  } catch {
    return "custom";
  }
  if (
    host === "g.page" ||
    host === "maps.app.goo.gl" ||
    host === "g.co" ||
    (host === "goo.gl" && v.includes("/maps")) ||
    /(^|\.)google\.[a-z.]+$/.test(host) ||
    host === "search.google.com"
  )
    return "google_review";
  if (host === "instagram.com" || host === "instagr.am" || host.endsWith(".instagram.com")) return "instagram";
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
  if (host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.com" || host === "fb.me" || host === "m.me") return "facebook";
  if (host === "wa.me" || host === "api.whatsapp.com" || host === "whatsapp.com" || host.endsWith(".whatsapp.com")) return "whatsapp";
  return "website";
}

/**
 * The type a link should be stored with: when the URL clearly belongs to a platform (an Instagram URL, a Google
 * review link, wa.me…) that platform wins over a contradicting pick (e.g. "Google Reviews" left selected while an
 * Instagram link was pasted). A "Google Reviews" pick with a plain web page (not a Google / g.page link) becomes
 * "Website". Otherwise the owner's pick stays (menu, website, custom link…).
 */
export function reconcileDestinationType<T extends string>(picked: T, url: string): T | GuessedDestinationType {
  if (!url) return picked;
  const guessed = guessDestinationType(url);
  if ((PLATFORM_TYPES as readonly string[]).includes(guessed) && guessed !== picked) return guessed;
  if (picked === "google_review" && guessed === "website") return guessed;
  return picked;
}
