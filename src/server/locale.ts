// Request locale detection shared by src/proxy.ts and the smart-link route: cookie → Accept-Language → default (fr).
// Pure string logic (no DB, no secrets) and part of the proxy bundle, hence no `import "server-only"`.
import { defaultLocale, isLocale, locales, type Locale } from "../i18n/config";

export const LOCALE_COOKIE = "onde-locale";

/** Best supported locale from an Accept-Language header (q-weighted, primary subtag match), or null. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { lang: (tag ?? "").trim().toLowerCase().split("-")[0] ?? "", weight: Number.isFinite(weight) ? weight : 0, i };
    })
    .filter((x) => x.lang && x.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.i - b.i);
  for (const { lang } of ranked) if ((locales as readonly string[]).includes(lang)) return lang as Locale;
  return null;
}

export function detectLocale(cookieValue: string | null | undefined, acceptLanguage: string | null | undefined): Locale {
  if (cookieValue && isLocale(cookieValue)) return cookieValue;
  return localeFromAcceptLanguage(acceptLanguage) ?? defaultLocale;
}

/** Locale for a Request (reads the onde-locale cookie and Accept-Language). */
export function requestLocale(req: Request): Locale {
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(/(?:^|;\s*)onde-locale=([^;]+)/);
  return detectLocale(m ? m[1].trim() : null, req.headers.get("accept-language"));
}
