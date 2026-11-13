// Customer page → "Client page" section (server part): loads the owner view of the customer's client page.
import { getPortalAdmin } from "@/server/portal";
import ClientPortalPanel from "./ClientPortalPanel";

export default async function ClientPortalSection({ customerId }: { customerId: number }) {
  const view = await getPortalAdmin(customerId);
  if (!view) return null;
  return <ClientPortalPanel customerId={customerId} view={view} />;
}
