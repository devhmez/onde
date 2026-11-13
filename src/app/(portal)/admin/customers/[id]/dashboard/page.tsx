// /admin/customers/<id>/dashboard — the owner sees a customer's client dashboard exactly as the client does
// (the same PortalPage, in the client page's own document: (portal) root layout, portal.css, its three fonts), for any
// customer, whether or not their client link exists or is on. A sticky admin banner sits on top.
// Admin only: the proxy checks the session first (src/proxy.ts → ownerDashboardProxy also sets the language from
// ?lang, French by default, and the client page's private headers), and the page re-checks it. The page's actions are
// the owner's (src/app/(admin)/admin/portal-actions.ts, bound to this customer id): actor "owner", no client push,
// nothing counted in the client's daily limit, the client's "last opened" never touched.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  ownerDecideRequestAction,
  ownerPreviewLinkAction,
  ownerSaveLocationAction,
  ownerSubmitLinkAction,
} from "@/app/(admin)/admin/portal-actions";
import OwnerBanner from "@/components/admin/portal/OwnerBanner";
import { portalDict, portalRequestLocale } from "@/components/portal/locale";
import PortalPage from "@/components/portal/PortalPage";
import { getSession, requireAdmin } from "@/lib/auth";
import { getOwnerDashboard } from "@/server/portal";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const customerId = (raw: string) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** One read per request (metadata + page). */
const load = cache((id: number) => getOwnerDashboard(id));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  const n = customerId(id);
  const data = session && n ? await load(n) : null;
  return {
    title: data ? `${data.view.business} — client dashboard · ONDE Admin` : "Client dashboard · ONDE Admin",
    // Still the owner's installed app (scope /admin) — not the client's.
    manifest: "/admin.webmanifest",
    icons: { icon: "/favicon.ico", apple: "/admin-icons/apple-touch-icon.png" },
    appleWebApp: { capable: true, title: "ONDE Admin", statusBarStyle: "black" },
  };
}

export default async function OwnerDashboardPage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;
  const n = customerId(id);
  if (!n) notFound();
  const [data, locale] = await Promise.all([load(n), portalRequestLocale()]);
  if (!data) notFound();
  const t = await portalDict(locale);
  const { view } = data;
  return (
    <PortalPage
      view={view}
      t={t}
      locale={locale}
      actions={{
        viewer: "owner",
        preview: ownerPreviewLinkAction.bind(null, n),
        submit: ownerSubmitLinkAction.bind(null, n),
        saveLocation: ownerSaveLocationAction.bind(null, n),
        decide: ownerDecideRequestAction.bind(null, n),
      }}
      banner={
        <OwnerBanner
          customerId={n}
          business={view.business}
          locale={locale}
          link={data.link}
          enabled={data.enabled}
          anonymized={data.anonymized}
          phone={data.phone}
          firstName={data.firstName}
          changesUsed={data.changesUsed}
          limit={data.limit}
          mode={view.mode}
        />
      }
    />
  );
}
