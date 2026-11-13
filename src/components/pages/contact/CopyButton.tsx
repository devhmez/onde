"use client";
// Copy-to-clipboard pill with a little check morph and a polite live announcement.
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { IconCheck, IconCopy } from "../icons";

export default function CopyButton({ value, label, copiedLabel, className }: { value: string; label: string; copiedLabel: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Older browsers / insecure contexts: fall back to a temporary selection.
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } finally {
        ta.remove();
      }
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2200);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={clsx(
        "inline-flex h-12 items-center gap-2 rounded-full px-5 text-sm font-semibold ring-1 ring-inset transition duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-2 active:scale-95",
        copied ? "bg-ok/15 text-ok ring-ok/40" : "bg-white/[0.04] text-text ring-white/12 hover:bg-white/[0.08]",
        className,
      )}
    >
      <span className="relative grid h-4 w-4 place-items-center">
        <IconCopy size={16} className={clsx("absolute transition duration-300", copied ? "scale-50 opacity-0" : "scale-100 opacity-100")} />
        <IconCheck size={16} className={clsx("absolute transition duration-300", copied ? "scale-100 opacity-100" : "scale-50 opacity-0")} />
      </span>
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </button>
  );
}
