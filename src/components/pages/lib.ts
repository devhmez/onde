// Pure helpers shared by the "pages" module (About / Contact / Legal / Inactive / 404).
// Safe to import from both server and client components (no Node or DOM APIs at module level).

/** Replace `{name}` placeholders. Unknown placeholders are left untouched. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}

/** 0 → "0:00", 155.2 → "2:35" */
export function fmtTime(seconds: number): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** ISO-8601 duration for structured data: 155 → "PT2M35S" */
export function isoDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `PT${Math.floor(s / 60)}M${s % 60}S`;
}

const digits = (v: string) => v.replace(/\D/g, "");

/** WhatsApp click-to-chat link with an optional prefilled message. Accepts "21625875529", "+216 25 875 529" or "25875529". */
export function waLink(number: string, text?: string): string {
  let d = digits(number);
  if (d.length === 8) d = `216${d}`;
  return text ? `https://wa.me/${d}?text=${encodeURIComponent(text)}` : `https://wa.me/${d}`;
}

/** 8-digit Tunisian number → "tel:+21625875529" */
export function telHref(phone8: string): string {
  let d = digits(phone8);
  if (d.length === 8) d = `216${d}`;
  return `tel:+${d}`;
}

/** 8-digit Tunisian number → "+216 25 875 529" */
export function formatPhone(phone8: string): string {
  let d = digits(phone8);
  if (d.startsWith("216") && d.length === 11) d = d.slice(3);
  if (d.length !== 8) return phone8;
  return `+216 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`;
}

const EMAIL_RE = /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}$/i;
export function isEmail(v: string | null | undefined): v is string {
  return !!v && EMAIL_RE.test(v.trim());
}

export type SocialNetwork = "instagram" | "facebook" | "tiktok";

const SOCIAL_HOSTS: Record<SocialNetwork, RegExp> = {
  instagram: /(^|\.)instagram\.com$/i,
  facebook: /(^|\.)(facebook\.com|fb\.com|fb\.me)$/i,
  tiktok: /(^|\.)tiktok\.com$/i,
};

/**
 * Settings may hold a full URL ("https://instagram.com/onde.tn"), a bare host path ("instagram.com/onde.tn")
 * or a handle ("@onde.tn"). Returns a safe https URL or null (never a javascript:/data: URL).
 */
export function socialUrl(network: SocialNetwork, raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const candidate = /^https?:\/\//i.test(v) ? v : /^[\w.-]+\.[a-z]{2,}\//i.test(v) ? `https://${v}` : null;
  if (candidate) {
    try {
      const u = new URL(candidate);
      if (u.protocol !== "https:" && u.protocol !== "http:") return null;
      if (!SOCIAL_HOSTS[network].test(u.hostname)) return null;
      u.protocol = "https:";
      return u.toString();
    } catch {
      return null;
    }
  }
  const handle = v.replace(/^@/, "");
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(handle)) return null;
  switch (network) {
    case "instagram":
      return `https://www.instagram.com/${handle}`;
    case "facebook":
      return `https://www.facebook.com/${handle}`;
    case "tiktok":
      return `https://www.tiktok.com/@${handle}`;
  }
}

/** Display label for a social link: "@handle" when we can infer it, else the host+path. */
export function socialHandle(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean)[0] ?? "";
    if (!seg) return u.hostname.replace(/^www\./, "");
    return seg.startsWith("@") ? seg : `@${seg}`;
  } catch {
    return url;
  }
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
