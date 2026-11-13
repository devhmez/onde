// /c/<token> — a customer's private client page ("Espace client"): taps, products, and changing where they lead.
// Unknown, regenerated, turned-off and anonymized tokens all get the same server-rendered "link not valid" page, so an
// old or guessed link learns nothing. (Rendered here rather than via notFound(): without a streaming boundary
// Next.js would answer with an empty error shell that only shows the message once the JavaScript has loaded.)
import type { Metadata } from "next";
import { headers } from "next/headers";
import InvalidLink from "@/components/portal/InvalidLink";
import PortalPage from "@/components/portal/PortalPage";
import { portalDict, portalRequestLocale } from "@/components/portal/locale";
import { getPortalView, isPortalTokenValid } from "@/server/portal";
import { readSettings } from "@/server/settings";
import { cancelRequestAction, previewLinkAction, saveLocationAction, submitLinkAction } from "./actions";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ token }, locale] = await Promise.all([params, portalRequestLocale()]);
  const t = await portalDict(locale);
  return { title: isPortalTokenValid(token) ? t.meta.title : t.meta.invalidTitle };
}

function ondeWhatsapp(): string {
  try {
    return readSettings().whatsapp.replace(/\D/g, "");
  } catch {
    return "";
  }
}

export default async function ClientPortalPage({ params, searchParams }: Props) {
  const [{ token }, sp, h, locale] = await Promise.all([params, searchParams, headers(), portalRequestLocale()]);
  const [view, t] = await Promise.all([getPortalView(token, { userAgent: h.get("user-agent"), preview: sp.preview === "1" }), portalDict(locale)]);
  if (!view) return <InvalidLink t={t} locale={locale} whatsapp={ondeWhatsapp()} />;
  // The token is bound to each action (it is already the page's address): every call is re-checked on the server.
  return (
    <PortalPage
      view={view}
      t={t}
      locale={locale}
      actions={{
        viewer: "client",
        preview: previewLinkAction.bind(null, token),
        submit: submitLinkAction.bind(null, token),
        cancel: cancelRequestAction.bind(null, token),
        saveLocation: saveLocationAction.bind(null, token),
      }}
    />
  );
}
