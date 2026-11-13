"use client";
// The edit panel on a stand's own page (/admin/stands/CODE): same panel as Products, wired straight to the actions.
// Every action revalidates the admin, so the page around it re-renders with the new data in the same round trip.
import { useRouter } from "next/navigation";
import { updateTagAction } from "@/app/(admin)/admin/actions";
import { isStock } from "../meta";
import type { CustomerOption, TagDetail } from "../types";
import EditPanel from "./EditPanel";

export default function StandPanel({ detail, customers, blackDesign }: { detail: TagDetail; customers: CustomerOption[]; blackDesign: boolean }) {
  const router = useRouter();
  const row = detail.row;
  return (
    <EditPanel
      key={`${row.id}:${isStock(row) ? "stock" : "sold"}`}
      row={row}
      detail={detail}
      customers={customers}
      blackDesign={blackDesign}
      onStandPage
      onUpdate={(patch) => updateTagAction({ id: row.id, ...patch })}
      onDeleted={() => router.replace("/admin/products")}
    />
  );
}
