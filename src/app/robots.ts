// /robots.txt — per host.
//  - onde.tn: crawl everything public; keep crawlers out of the admin, the APIs, the smart-link redirects (/t/ would
//    otherwise inflate tap analytics and leak customers' destinations into search results) and the private client
//    pages (/c/). Pages that must not be indexed but may be crawled (checkout, order, inactive, 404) carry noindex.
//  - admin.onde.tn (the dashboard host): nothing to crawl at all. The proxy in front also sends X-Robots-Tag: noindex.
import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { hostnameOf, isAdminHost } from "@/server/admin-host";
import { siteUrl } from "@/components/pages/seo";

// PUBLIC_BASE_URL and the Host header are read at request time (the Docker image is built once, configured at run time).
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host");
  if (isAdminHost(host) || hostnameOf(host).startsWith("admin.")) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/t/", "/c/"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
