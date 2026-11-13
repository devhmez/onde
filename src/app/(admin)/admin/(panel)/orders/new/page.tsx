import type { Metadata } from "next";
import Link from "next/link";
import NewOrderForm from "@/components/admin/orders/NewOrderForm";
import { PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { listProducts } from "@/server/catalog";
import { getRules } from "@/server/settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New order" };

export default async function NewOrderPage() {
  await requireAdmin();
  const [products, rules] = await Promise.all([listProducts({ includeInactive: true }), getRules()]);
  const sorted = [...products].sort((a, b) => Number(b.active) - Number(a.active) || a.sort - b.sort);
  return (
    <>
      <PageHeader back={{ href: "/admin/orders", label: "Orders" }} title="New order" subtitle="Record an order taken on WhatsApp or by phone." />
      <div className="notice mt16" role="note">
        <div>
          <b>Sold a stand at the client’s counter?</b> Don’t create an order here (it adds a delivery fee and an address): open the
          stand — <b>Find a stand</b> → its code → <b>Sell this stand</b> → <i>Paid in person</i>. The sale is recorded with no delivery fee.{" "}
          <Link className="linkbtn" href="/admin/products?stock=1">
            Stock →
          </Link>
        </div>
      </div>
      <NewOrderForm products={sorted} rules={rules} />
    </>
  );
}
