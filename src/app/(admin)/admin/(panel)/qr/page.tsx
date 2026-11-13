import type { Metadata } from "next";
import Link from "next/link";
import { productLabel } from "@/components/admin/meta";
import QrSheet from "@/components/admin/qr/QrSheet";
import type { StandCard } from "@/components/admin/types";
import { EmptyState, PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { printDesignAvailable } from "@/server/qr-print";
import { standStats } from "@/server/stands";
import { listTags } from "@/server/tags";
import { toTagRow } from "../../_lib/data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "QR codes" };

export default async function QrPage() {
  await requireAdmin();
  const { rows, total } = await listTags({ limit: 1000 });
  const stats = standStats(rows);
  const tags: StandCard[] = rows.map((r) => ({
    ...toTagRow(r),
    taps30d: stats.get(r.id)?.taps30d ?? 0,
    printedAt: stats.get(r.id)?.printedAt ?? null,
    product: productLabel(r),
  }));
  return (
    <>
      <div className="screen-only">
        <PageHeader
          title="QR codes"
          subtitle="Every stand and its QR, by client — stock first."
          actions={
            <>
              <Link className="btn" href="/admin/products?new=1">
                + Add product
              </Link>
              <Link className="btn p" href="/admin/products?stock=1">
                Stock &amp; sell
              </Link>
            </>
          }
        />
      </div>
      {total === 0 ? (
        <div className="card mt22">
          <EmptyState
            title="No smart links yet — so no QR codes"
            actions={
              <>
                <Link className="btn p" href="/admin/products?stock=1">
                  + Add stock
                </Link>
                <Link className="btn" href="/admin/orders">
                  Generate from an order
                </Link>
              </>
            }
          >
            Create stock (codes printed in advance) or generate links from an order; each gets a QR that opens the same permanent link as its
            chip.
          </EmptyState>
        </div>
      ) : (
        <>
          {total > rows.length ? <p className="hint mt12 screen-only">Showing the {rows.length} most recent of {total} smart links.</p> : null}
          <QrSheet tags={tags} blackDesign={printDesignAvailable("black")} />
        </>
      )}
    </>
  );
}
