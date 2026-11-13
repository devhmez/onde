import type { Metadata } from "next";
import CatalogEditor from "@/components/admin/catalog/CatalogEditor";
import { PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { listProducts } from "@/server/catalog";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Catalog" };

export default async function CatalogPage() {
  await requireAdmin();
  const products = await listProducts({ includeInactive: true, raw: true });
  const sorted = [...products].sort((a, b) => a.sort - b.sort || a.id - b.id);
  return (
    <>
      <PageHeader title="Catalog" subtitle="What the shop sells — names in English and French, prices, packs." />
      <CatalogEditor products={sorted} />
    </>
  );
}
