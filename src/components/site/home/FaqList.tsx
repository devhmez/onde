"use client";
// Accessible accordion (button + region, aria-expanded/controls), smooth height via grid rows,
// animated plus → minus, first item open by default. Content is in the DOM for SEO. An item may end with an internal
// link (href already localized by the server).
import Link from "next/link";
import { useId, useState } from "react";
import clsx from "clsx";

type Item = { q: string; a: string; link?: { href: string; label: string } };

export default function FaqList({ items }: { items: Item[] }) {
  const [open, setOpen] = useState<Set<number>>(() => new Set([0]));
  const base = useId();

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <ul className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
      {items.map((it, i) => {
        const isOpen = open.has(i);
        const btnId = `${base}-q${i}`;
        const panelId = `${base}-a${i}`;
        return (
          <li key={it.q} data-reveal-item>
            <h3>
              <button
                id={btnId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(i)}
                className="group flex w-full items-center justify-between gap-6 py-6 text-left md:py-7"
              >
                <span
                  className={clsx(
                    "font-display text-[clamp(1.1rem,2vw,1.45rem)] font-semibold leading-snug tracking-[-0.01em] transition-colors duration-300",
                    isOpen ? "text-text" : "text-text/80 group-hover:text-text",
                  )}
                >
                  {it.q}
                </span>
                <span
                  aria-hidden="true"
                  className={clsx(
                    "relative grid h-10 w-10 shrink-0 place-items-center rounded-full border transition-all duration-500 ease-expo",
                    isOpen ? "rotate-180 border-violet-2 bg-violet text-white" : "border-white/15 text-text group-hover:border-violet-2",
                  )}
                >
                  <span className="absolute h-[1.5px] w-3.5 rounded bg-current" />
                  <span
                    className={clsx(
                      "absolute h-3.5 w-[1.5px] rounded bg-current transition-transform duration-500 ease-expo",
                      isOpen && "scale-y-0",
                    )}
                  />
                </span>
              </button>
            </h3>
            <div id={panelId} role="region" aria-labelledby={btnId} className="accordion-panel" data-open={isOpen}>
              <div aria-hidden={!isOpen} inert={!isOpen}>
                <div
                  className={clsx(
                    "max-w-3xl pb-7 pr-14 transition-[opacity,translate] duration-500 ease-expo",
                    isOpen ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
                  )}
                >
                  <p className="text-[1rem] leading-relaxed text-muted">{it.a}</p>
                  {it.link && (
                    <Link
                      href={it.link.href}
                      className="mt-3 inline-flex items-center gap-2 text-[0.95rem] font-medium text-violet-3 transition-colors hover:text-white"
                    >
                      {it.link.label}
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
                        <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
