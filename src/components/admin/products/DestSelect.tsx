"use client";
// "New destination" selector — the violet-ringed .sel.new box from the film, as an accessible listbox
// (button opens it, focus moves into the list, arrows/Home/End/Enter/Escape work).
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { DEST_META, DEST_TYPES } from "../meta";
import type { DestinationType } from "../types";
import { Swatch } from "../ui";

export default function DestSelect({
  value,
  onChange,
  labelledBy,
  highlight = true,
}: {
  value: DestinationType;
  onChange: (v: DestinationType) => void;
  labelledBy?: string;
  highlight?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, DEST_TYPES.indexOf(value)));
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const openList = () => {
    setActive(Math.max(0, DEST_TYPES.indexOf(value)));
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  };
  const choose = (i: number) => {
    onChange(DEST_TYPES[i]);
    close();
  };

  const onButtonKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openList();
    }
  };
  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const n = DEST_TYPES.length;
    if (e.key === "ArrowDown") setActive((a) => (a + 1) % n);
    else if (e.key === "ArrowUp") setActive((a) => (a - 1 + n) % n);
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(n - 1);
    else if (e.key === "Enter" || e.key === " ") choose(active);
    else if (e.key === "Escape") close();
    else if (e.key === "Tab") {
      close(false);
      return;
    } else return;
    e.preventDefault();
  };

  return (
    <div className="dd" ref={wrap}>
      <button
        ref={btn}
        type="button"
        className={`sel${highlight ? " new" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={labelledBy ? `${labelledBy} ${listId}-value` : undefined}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onButtonKey}
      >
        <Swatch type={value} />
        <span className="grow" id={`${listId}-value`}>
          {DEST_META[value].label}
        </span>
        <span className="caret" aria-hidden>
          ▾
        </span>
      </button>
      <AnimatePresence>
        {open ? (
          <motion.ul
            ref={list}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-labelledby={labelledBy}
            aria-activedescendant={`${listId}-${active}`}
            className="dd-list"
            onKeyDown={onListKey}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            {DEST_TYPES.map((t, i) => (
              <li
                key={t}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={t === value}
                className={i === active ? "act" : undefined}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
              >
                <Swatch type={t} />
                {DEST_META[t].label}
                {t === value ? (
                  <span className="tick" aria-hidden>
                    ✓
                  </span>
                ) : null}
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
