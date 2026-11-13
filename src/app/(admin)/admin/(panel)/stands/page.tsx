// /admin/stands (no code): every stand is listed in Products (Stock tab for the unsold ones), and one stand opens at
// /admin/stands/CODE — "Find a stand" (search on every page) gets there from the code printed under the QR.
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function StandsIndex() {
  await requireAdmin();
  redirect("/admin/products");
}
