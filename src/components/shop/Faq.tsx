"use client";
// Accessible accordion (button + region), one open at a time. Every answer stays in the server HTML (closed panels are
// collapsed with the CSS grid-rows technique, not unmounted), so crawlers and in-page search see the full FAQ.
// An item may end with an internal link (href already localized by the server page).
import Link from "next/link";
import { useId, useState } from "react";
import clsx from "clsx";
import { ArrowRightIcon, PlusIcon } from "./Icons";

export type FaqEntry = { q: string; a: string; link?: { href: string; label: string } };
type Props = { items: FaqEntry[]; className?: string };

export default function Faq({ items, className }: Props) {
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();

  return (
    <div className={clsx("divide-y divide-white/[0.07] border-y border-white/[0.07]", className)}>
      {items.map((item, i) => {
        const isOpen = open === i;
        const btnId = `${base}-q${i}`;
        const panelId = `${base}-a${i}`;
        return (
          <div key={item.q}>
            <h3>
              <button
                id={btnId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : i)}
                className="group/faq flex w-full items-center justify-between gap-6 py-6 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-2"
              >
                <span
                  className={clsx(
                    "font-display text-lg font-semibold tracking-[-0.015em] transition-colors sm:text-xl",
                    isOpen ? "text-text" : "text-text/85 group-hover/faq:text-text",
                  )}
                >
                  {item.q}
                </span>
                <span
                  aria-hidden="true"
                  className={clsx(
                    "grid size-10 shrink-0 place-items-center rounded-full border transition-[transform,background-color,border-color] duration-500 ease-expo",
                    isOpen ? "rotate-45 border-violet bg-violet text-white" : "border-white/15 text-muted group-hover/faq:border-white/30",
                  )}
                >
                  <PlusIcon size={18} />
                </span>
              </button>
            </h3>
            <div id={panelId} role="region" aria-labelledby={btnId} className="accordion-panel" data-open={isOpen}>
              <div aria-hidden={!isOpen} inert={!isOpen}>
                <div
                  className={clsx(
                    "max-w-3xl pb-7 pr-14 transition-opacity duration-500 ease-expo motion-reduce:transition-none",
                    isOpen ? "opacity-100" : "opacity-0",
                  )}
                >
                  <p className="text-[15px] leading-relaxed text-muted">{item.a}</p>
                  {item.link && (
                    <Link
                      href={item.link.href}
                      className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-violet-3 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-2"
                    >
                      {item.link.label}
                      <ArrowRightIcon size={15} />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
