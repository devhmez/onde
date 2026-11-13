// Proxy rules for the client page /c/<token> (called from src/proxy.ts). Pure: no DB, no secrets — part of the proxy
// bundle, hence no `import "server-only"`.
//
//   • /c/<token> is never locale-prefixed (the token is the whole address). Language: ?lang=fr|en → onde-locale cookie
//     → French. A ?lang choice is remembered in the cookie, like visiting /fr or /en on the site. The page reads the
//     result from the PORTAL_LOCALE_HEADER request header.
//   • /fr/c/<token> and /en/c/<token> (someone added a prefix) → 307 to /c/<token>?lang=… — the token is kept.
//   • Responses: Referrer-Policy no-referrer (the token must never reach a destination or /t/ through Referer),
//     noindex, no caching, no framing.
//   • The owner's view of a client's dashboard (/admin/customers/<id>/dashboard, admin session checked by the proxy
//     first) is the same document: same headers, language from ?lang only (French by default, never remembered).
import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, isLocale, type Locale } from "../i18n/config";
import { LOCALE_COOKIE } from "./locale";

export const PORTAL_LOCALE_HEADER = "x-onde-portal-locale";

const PREFIXED = /^\/(fr|en)\/c\/([^/]+)\/?$/;
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const PORTAL_HEADERS: Record<string, string> = {
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Cache-Control": "private, no-store, max-age=0",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
};

/** Locale of a client-page request: ?lang → cookie → French. */
export function portalLocale(lang: string | null | undefined, cookie: string | null | undefined): Locale {
  if (lang && isLocale(lang)) return lang;
  if (cookie && isLocale(cookie)) return cookie;
  return defaultLocale;
}

const OWNER_DASHBOARD = /^\/admin\/customers\/[^/]+\/dashboard\/?$/;

/** The response for the owner's view of a client dashboard (session already verified), or null for another path. */
export function ownerDashboardProxy(request: NextRequest): NextResponse | null {
  if (!OWNER_DASHBOARD.test(request.nextUrl.pathname)) return null;
  const lang = request.nextUrl.searchParams.get("lang");
  const headers = new Headers(request.headers);
  headers.set(PORTAL_LOCALE_HEADER, lang && isLocale(lang) ? lang : defaultLocale);
  const res = NextResponse.next({ request: { headers } });
  for (const [k, v] of Object.entries(PORTAL_HEADERS)) res.headers.set(k, v);
  return res;
}

/** The response for a client-page request, or null when the path is not one. */
export function portalProxy(request: NextRequest): NextResponse | null {
  const { pathname, searchParams } = request.nextUrl;

  const prefixed = PREFIXED.exec(pathname);
  if (prefixed && (request.method === "GET" || request.method === "HEAD")) {
    const url = request.nextUrl.clone();
    url.pathname = `/c/${prefixed[2]}`;
    url.search = "";
    url.searchParams.set("lang", prefixed[1]);
    const res = NextResponse.redirect(url, 307);
    for (const [k, v] of Object.entries(PORTAL_HEADERS)) res.headers.set(k, v);
    return res;
  }

  if (pathname !== "/c" && !pathname.startsWith("/c/")) return null;

  const lang = searchParams.get("lang");
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = portalLocale(lang, cookie);
  const headers = new Headers(request.headers);
  headers.set(PORTAL_LOCALE_HEADER, locale);
  const res = NextResponse.next({ request: { headers } });
  for (const [k, v] of Object.entries(PORTAL_HEADERS)) res.headers.set(k, v);
  if (lang && isLocale(lang) && cookie !== lang) {
    res.cookies.set(LOCALE_COOKIE, lang, { path: "/", maxAge: LOCALE_COOKIE_MAX_AGE, sameSite: "lax" });
  }
  return res;
}
