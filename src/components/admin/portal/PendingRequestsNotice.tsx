// Overview → client link requests waiting for the owner's approval (customers in "Needs my approval" mode).
import Link from "next/link";
import { listPendingPortalRequests } from "@/server/portal";
import { timeAgo } from "../format";
import { DEST_META } from "../meta";
import "./portal-admin.css";

export default async function PendingRequestsNotice() {
  const { total, rows } = await listPendingPortalRequests(4);
  if (!total) return null;
  return (
    <section className="notice warn pa-overview" aria-label="Client link requests">
      <span className="pa-badge" aria-hidden>
        {total}
      </span>
      <div className="grow">
        <b>
          {total === 1 ? "1 client link request is" : `${total} client link requests are`} waiting for your approval
        </b>
        <ul>
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/customers/${r.customerId}#client-page`}>
                {r.business} · <span className="mono">{r.code}</span> → {DEST_META[r.toType]?.label ?? r.toType}
              </Link>{" "}
              <span className="muted" suppressHydrationWarning>
                {timeAgo(r.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {rows[0] ? (
        <Link className="btn sm" href={`/admin/customers/${rows[0].customerId}#client-page`}>
          Review →
        </Link>
      ) : null}
    </section>
  );
}
