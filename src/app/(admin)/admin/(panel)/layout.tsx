// Authenticated shell: the film's sidebar + main column. Every page below also calls requireAdmin() itself.
import type { ReactNode } from "react";
import PushBootstrap from "@/components/admin/push/PushBootstrap";
import Sidebar from "@/components/admin/Sidebar";
import { AdminProviders } from "@/components/admin/toast";
import { requireAdmin } from "@/lib/auth";
import { listOrders } from "@/server/orders";
import { getVapidPublicKey, listSubscriptions } from "@/server/push";
import { siteUrl } from "../_lib/data";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  const { total: newOrders } = await listOrders({ status: "new", limit: 1 });
  return (
    <AdminProviders>
      <PushBootstrap newOrders={newOrders} vapidPublicKey={getVapidPublicKey()} deviceFps={listSubscriptions().map((d) => d.fp)} />
      <div className="shell">
        <Sidebar newOrders={newOrders} siteUrl={siteUrl()} />
        <main className="main" id="main">
          <div className="main-inner">{children}</div>
        </main>
      </div>
    </AdminProviders>
  );
}
