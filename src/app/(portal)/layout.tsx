// Root layout of the client pages (/c/<token>): its own light document — no intro, 3D, smooth scroll, cart or
// analytics beacon — so it opens fast on a phone. Private: noindex, and no Referer ever leaves the page (the token is
// in the URL). The proxy sends the same policies as HTTP headers (src/server/portal-proxy.ts).
// Also the document of the owner's view of a client's dashboard (/admin/customers/<id>/dashboard): the same page.
// "Add to Home Screen": the ONDE icon, and a manifest without start_url — the start URL is then the page it was added
// from, i.e. that client's own /c/<token> (one static file serves every client; the token never appears in it).
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { portalFontVariables } from "@/components/portal/fonts";
import { portalDict, portalRequestLocale } from "@/components/portal/locale";
import "./portal.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await portalDict(await portalRequestLocale());
  return {
    title: t.meta.title,
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
    referrer: "no-referrer",
    formatDetection: { telephone: false, email: false, address: false },
    icons: { icon: "/favicon.ico", apple: "/client-icons/apple-touch-icon.png" },
    manifest: "/client.webmanifest",
    appleWebApp: { capable: true, title: "ONDE", statusBarStyle: "black" },
  };
}

export const viewport: Viewport = {
  themeColor: "#07060b",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function PortalRootLayout({ children }: { children: ReactNode }) {
  const locale = await portalRequestLocale();
  return (
    <html lang={locale} className={portalFontVariables}>
      <body className="pt-body">{children}</body>
    </html>
  );
}
