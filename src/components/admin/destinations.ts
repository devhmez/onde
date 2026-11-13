// Destination normalisation shared by the edit panel (live preview) and the server actions (authoritative).
// Turns friendly input ("@cafe", "25 875 529", "cafe.tn") into a safe absolute URL for the smart-link redirect.
import { normalizePhone } from "@/lib/business";
import type { DestinationType } from "./types";

export type DestinationResult = { ok: true; url: string } | { ok: false; error: string };

const MAX = 2048;

export function normalizeDestination(type: DestinationType, raw: string): DestinationResult {
  const v = (raw ?? "").trim();
  if (!v) return { ok: false, error: "Enter where this smart link should go." };
  if (v.length > MAX) return { ok: false, error: "That link is too long." };

  if (type === "whatsapp" && !/^https?:/i.test(v)) {
    const p = normalizePhone(v);
    if (p) return { ok: true, url: `https://wa.me/216${p}` };
  }
  if (type === "contact" && /^[+\d][\d\s.-]{7,}$/.test(v)) {
    const p = normalizePhone(v);
    if (p) return { ok: true, url: `tel:+216${p}` };
  }
  if (type === "instagram" && (/^@[A-Za-z0-9._]{1,30}$/.test(v) || /^[A-Za-z0-9_]{1,30}$/.test(v))) {
    return { ok: true, url: `https://instagram.com/${v.replace(/^@/, "")}` };
  }
  if (type === "tiktok" && (/^@[A-Za-z0-9._]{2,24}$/.test(v) || /^[A-Za-z0-9_]{2,24}$/.test(v))) {
    return { ok: true, url: `https://www.tiktok.com/@${v.replace(/^@/, "")}` };
  }
  if (type === "facebook" && /^[A-Za-z0-9_]{3,50}$/.test(v)) {
    return { ok: true, url: `https://facebook.com/${v}` };
  }

  if (/^tel:\+?[\d\s-]{6,}$/i.test(v)) return { ok: true, url: v.replace(/\s/g, "") };
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(v)) return { ok: true, url: v };
  if (/^sms:\+?[\d\s-]{6,}/i.test(v)) return { ok: true, url: v.replace(/\s/g, "") };
  if (/^[a-z][a-z0-9+.-]*:/i.test(v) && !/^https?:\/\//i.test(v)) {
    return { ok: false, error: "Only web (https://), phone (tel:) and email (mailto:) links are allowed." };
  }

  const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("protocol");
    if (!u.hostname.includes(".") || u.hostname.endsWith(".")) throw new Error("host");
    if (u.username || u.password) throw new Error("credentials");
    return { ok: true, url: u.toString() };
  } catch {
    return { ok: false, error: "That doesn’t look like a valid link." };
  }
}
