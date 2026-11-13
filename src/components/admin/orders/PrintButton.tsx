"use client";
import { IconPrint } from "../icons";

export default function PrintButton({ label = "Print packing slip" }: { label?: string }) {
  return (
    <button type="button" className="btn" onClick={() => window.print()}>
      <IconPrint /> {label}
    </button>
  );
}
