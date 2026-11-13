"use client";
// Interactive chrome for legal documents: reading-progress bar, scroll-spy table of contents (sticky on desktop,
// collapsible on phones) and a print button.
import { useEffect, useState, type MouseEvent } from "react";
import { motion, useScroll, useSpring } from "motion/react";
import clsx from "clsx";
import { scrollToTarget } from "@/lib/motion";
import { IconPrinter } from "../icons";
import { useReducedMotionPref } from "../motion";

type TocItem = { id: string; title: string };

/** Decorative reading-progress hairline at the very top of the viewport. */
export function ReadingProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 26, mass: 0.4 });
  return (
    <motion.div
      aria-hidden
      className="op-noprint fixed inset-x-0 top-0 z-[70] h-[3px] origin-left bg-gradient-to-r from-violet via-violet-2 to-violet-3 shadow-[0_0_12px_rgba(123,92,255,.8)]"
      style={{ scaleX }}
    />
  );
}

export function LegalToc({ items, title }: { items: TocItem[]; title: string }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const reduce = useReducedMotionPref();

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const visible = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting);
        const first = items.find((i) => visible.get(i.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);

  const go = (id: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    scrollToTarget(el, { offset: -110, immediate: reduce });
    history.replaceState(null, "", `#${id}`);
    setActive(id);
    el.focus({ preventScroll: true });
  };

  const list = (
    <ol className="space-y-0.5">
      {items.map((it, i) => {
        const on = it.id === active;
        return (
          <li key={it.id}>
            <a
              href={`#${it.id}`}
              onClick={go(it.id)}
              aria-current={on ? "location" : undefined}
              className={clsx(
                "group flex items-baseline gap-3 rounded-xl px-3 py-2 text-sm transition duration-300",
                on ? "bg-violet/15 text-white" : "text-muted hover:bg-white/[0.04] hover:text-text",
              )}
            >
              <span className={clsx("font-mono text-[11px] tabular-nums", on ? "text-violet-3" : "text-muted")}>{String(i + 1).padStart(2, "0")}</span>
              <span className="leading-snug">{it.title}</span>
            </a>
          </li>
        );
      })}
    </ol>
  );

  return (
    <>
      {/* phones / tablets */}
      <details className="op-details op-noprint group rounded-2xl border border-line bg-panel/70 lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold">
          {title}
          <span className="op-details-icon text-violet-3 transition-transform duration-300">+</span>
        </summary>
        <div className="px-1 pb-2">{list}</div>
      </details>
      {/* desktop */}
      <nav aria-label={title} className="op-noprint sticky top-28 hidden max-h-[calc(100svh-8rem)] overflow-auto lg:block" data-lenis-prevent>
        <p className="eyebrow mb-4 px-3">{title}</p>
        {list}
      </nav>
    </>
  );
}

export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="op-noprint inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm text-muted ring-1 ring-inset ring-line transition hover:text-white hover:ring-violet/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-2"
    >
      <IconPrinter size={16} />
      {label}
    </button>
  );
}
