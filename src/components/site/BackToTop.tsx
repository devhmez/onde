"use client";
import { scrollToTarget } from "@/lib/motion";

export default function BackToTop({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        scrollToTarget(0, { duration: 1.6 });
        document.getElementById("content")?.focus({ preventScroll: true });
      }}
      className="group inline-flex items-center gap-3 text-sm font-medium text-muted transition-colors hover:text-text"
    >
      {label}
      <span className="grid h-10 w-10 place-items-center rounded-full border border-line transition-colors duration-300 group-hover:border-violet-2 group-hover:bg-violet/20">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 transition-transform duration-500 ease-expo group-hover:-translate-y-0.5" aria-hidden="true">
          <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  );
}
