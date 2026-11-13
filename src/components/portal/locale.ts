import "server-only";
// Locale + dictionary of a client-page request (the proxy resolved ?lang → cookie → French into a request header).
import { headers } from "next/headers";
import { defaultLocale, isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { PORTAL_LOCALE_HEADER } from "@/server/portal-proxy";
import type { PortalDict } from "./dict";

export async function portalRequestLocale(): Promise<Locale> {
  const v = (await headers()).get(PORTAL_LOCALE_HEADER) ?? "";
  return isLocale(v) ? v : defaultLocale;
}

export async function portalDict(locale: Locale): Promise<PortalDict> {
  return (await getDictionary(locale)).portal as PortalDict;
}
