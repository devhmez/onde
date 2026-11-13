// The screen from the film: "Products — Every chip, every link, one place."
import type { Metadata } from "next";
import { fmtSeriesDate } from "@/components/admin/format";
import KpiGrid from "@/components/admin/Kpis";
import { TAG_KINDS } from "@/components/admin/meta";
import ProductsWorkspace from "@/components/admin/products/ProductsWorkspace";
import type { CustomerOption, TagDetail } from "@/components/admin/types";
import { requireAdmin } from "@/lib/auth";
import { listCustomers } from "@/server/customers";
import { stockPrintSummary } from "@/server/print-log";
import { printDesignAvailable } from "@/server/qr-print";
import { getKpis, getTapSeries } from "@/server/stats";
import { countStockByKind, getTag, listTags } from "@/server/tags";
import { int, oneOf, str, toTagDetail, toTagRow, type SearchParams } from "../../_lib/data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Products" };

const PAGE_SIZE = 20;

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = str(sp.q).slice(0, 100);
  const status = oneOf(sp.status, ["active", "disabled"] as const);
  const kind = oneOf(sp.kind, TAG_KINDS);
  // ?stock=1 — links made in advance (no customer, no destination): print, write the chips, assign when sold.
  const stock = str(sp.stock) === "1";
  const page = int(sp.page, 1, 1, 10_000);
  const tagParam = int(sp.tag, 0, 0);

  const [list, all, stockAll, kpis, series, customers] = await Promise.all([
    listTags({ q: q || undefined, status: stock ? undefined : status, kind, stock, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    listTags({ limit: 1 }),
    listTags({ stock: true, kind, limit: 1 }),
    getKpis(),
    getTapSeries(30),
    listCustomers({ limit: 1000 }),
  ]);

  const rows = list.rows.map((r) => toTagRow(r));
  // The tag in ?tag= (even if filtered out of the table), else the first row — like the film, a product is always open.
  let detail: TagDetail | null = null;
  for (const candidate of [tagParam, rows[0]?.id ?? 0]) {
    if (!candidate) continue;
    const t = await getTag(candidate);
    if (!t) continue;
    detail = toTagDetail(t);
    break;
  }

  const printSummary = stock ? stockPrintSummary(kind) : null;
  // A stock search that finds nothing: is that code sold (or disabled) instead?
  const elsewhere = stock && q && list.total === 0 ? (await listTags({ q, limit: 5 })).rows.map((r) => toTagRow(r)) : [];
  const customerOptions: CustomerOption[] = customers.rows.map((c) => ({ id: c.id, name: c.name, businessName: c.businessName, phone: c.phone }));

  return (
    <ProductsWorkspace
      kpis={<KpiGrid k={kpis} />}
      rows={rows}
      total={list.total}
      totalAll={all.total}
      stockTotal={stockAll.total}
      blackDesign={printDesignAvailable("black")}
      printSummary={printSummary}
      page={page}
      pageSize={PAGE_SIZE}
      filters={{ q, status: stock ? "" : (status ?? ""), kind: kind ?? "", stock }}
      selectedId={detail ? detail.row.id : (rows[0]?.id ?? null)}
      detail={detail}
      customers={customerOptions}
      chart={{ labels: series.map((p) => fmtSeriesDate(p.date)), values: series.map((p) => p.taps) }}
      openNew={str(sp.new) === "1"}
      stockByKind={countStockByKind()}
      elsewhere={elsewhere}
    />
  );
}
