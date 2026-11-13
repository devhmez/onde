import type { Metadata } from "next";
import PhoneNotifications from "@/components/admin/settings/PhoneNotifications";
import SettingsForm from "@/components/admin/settings/SettingsForm";
import { PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { adminHost } from "@/server/admin-host";
import { getVapidPublicKey, listSubscriptions } from "@/server/push";
import { getSettings } from "@/server/settings";
import { settingsView } from "../../_lib/data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireAdmin();
  const settings = await getSettings();
  return (
    <>
      <PageHeader title="Settings" subtitle="Store status, delivery rules, contact details, phone notifications." />
      <div style={{ marginTop: 6 }}>
        <SettingsForm
          initial={settingsView(settings)}
          notifications={<PhoneNotifications vapidPublicKey={getVapidPublicKey()} initialDevices={listSubscriptions()} adminHost={adminHost()} />}
        />
      </div>
    </>
  );
}
