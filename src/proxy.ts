// Next.js 16 Proxy (formerly middleware), Node.js runtime.
// 0) Canonical admin origin: GET/HEAD page loads of /admin/** on another public host (onde.tn) get a 308 to
//    https://admin.onde.tn/… (one origin = one installable app = one push identity). See src/server/admin-host.ts.
// 1) Admin gate: /admin/** (except /admin/login) and /api/admin/** (except login/logout) need a valid session —
//    pages redirect to /admin/login?next=…, APIs answer 401 JSON. Route handlers / server actions re-check (defense in depth).
// 2) Locale prefixing for public pages: /shop → /fr/shop (cookie onde-locale → Accept-Language → fr). Visiting a
//    prefixed URL remembers that locale in the cookie (used by /t/CODE → /{locale}/inactive and future visits to /).
import { NextResponse, type NextRequest } from "next/server";
import { isLocale } from "./i18n/config";
import { canonicalAdminRedirect, isAdminHost } from "./server/admin-host";
import { detectLocale, LOCALE_COOKIE } from "./server/locale";
import { ownerDashboardProxy, portalProxy } from "./server/portal-proxy";
import { SESSION_COOKIE, verifySessionToken } from "./server/session";

const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// Root-level files/routes that must never get a locale prefix.
const UNPREFIXED = new Set([
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
  "/manifest.json",
  "/icon",
  "/apple-icon",
  "/opengraph-image",
  "/twitter-image",
]);

function isAdminPage(p: string) {
  return p === "/admin" || p.startsWith("/admin/");
}
function isAdminLogin(p: string) {
  return p === "/admin/login" || p.startsWith("/admin/login/");
}
function isAdminApi(p: string) {
  return p === "/api/admin" || p.startsWith("/api/admin/");
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // ---- 1. Admin gate -------------------------------------------------------------------------------------------
  if (isAdminApi(pathname)) {
    if (pathname === "/api/admin/login" || pathname === "/api/admin/logout") return NextResponse.next();
    if (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  if (isAdminPage(pathname)) {
    const canonical = canonicalAdminRedirect({ method: request.method, host: request.headers.get("host"), pathname, search });
    if (canonical) return NextResponse.redirect(canonical, 308);
    const authed = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
    if (isAdminLogin(pathname)) {
      if (authed) return NextResponse.redirect(new URL("/admin", request.url));
      return NextResponse.next();
    }
    // The owner's view of a client dashboard renders the client page's document (language + private headers).
    if (authed) return ownerDashboardProxy(request) ?? NextResponse.next();
    const login = new URL("/admin/login", request.url);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }

  // ---- 2. Locale prefixing ---------------------------------------------------------------------------------------
  // Client pages /c/<token> are never prefixed (src/server/portal-proxy.ts: language, no-referrer, noindex).
  const portal = portalProxy(request);
  if (portal) return portal;
  if (
    pathname.startsWith("/api/") ||
    pathname === "/api" ||
    pathname.startsWith("/t/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/.well-known/") ||
    UNPREFIXED.has(pathname) ||
    /\.[A-Za-z0-9]+$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  // On the admin host "/" is the dashboard (Caddy redirects it too). Real redirect: the app's scope is /admin.
  if (pathname === "/" && (request.method === "GET" || request.method === "HEAD") && isAdminHost(request.headers.get("host"))) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  const first = pathname.split("/")[1] ?? "";
  if (isLocale(first)) {
    const res = NextResponse.next();
    if (request.cookies.get(LOCALE_COOKIE)?.value !== first) {
      res.cookies.set(LOCALE_COOKIE, first, { path: "/", maxAge: LOCALE_COOKIE_MAX_AGE, sameSite: "lax" });
    }
    return res;
  }

  const locale = detectLocale(request.cookies.get(LOCALE_COOKIE)?.value, request.headers.get("accept-language"));
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Everything except Next internals, smart links and files with an extension…
    "/((?!_next/static|_next/image|t/|.*\\.[A-Za-z0-9]+$).*)",
    // …but always gate the admin area, whatever the path looks like.
    "/admin/:path*",
    "/api/admin/:path*",
  ],
};
