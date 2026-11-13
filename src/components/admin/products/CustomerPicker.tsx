"use client";
// Search-as-you-type customer picker (name, business or phone), with an explicit "no customer" state.
// Typed text is never a customer by itself: until one is picked, a note says so (and `onPendingText` lets the form
// refuse to save); `onCreate` adds a "+ New client “…”" row that hands the text to the caller's new-client form.
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { customerDisplay, fmtPhone, initials } from "../format";
import type { CustomerOption } from "../types";

export default function CustomerPicker({
  customers,
  value,
  onChange,
  id,
  onPendingText,
  onCreate,
}: {
  customers: CustomerOption[];
  value: number | null;
  onChange: (id: number | null) => void;
  id?: string;
  /** Text typed in the box while no customer is picked ("" once picked or cleared). */
  onPendingText?: (text: string) => void;
  /** Offer "+ New client “text”" at the end of the list. */
  onCreate?: (text: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const selected = value != null ? customers.find((c) => c.id === value) ?? null : null;
  const setText = (v: string) => {
    setQ(v);
    onPendingText?.(v.trim());
  };

  const matches = useMemo(() => {
    // Accents and case never matter ("lumiere" finds "Café Lumière"), like Find a stand.
    const fold = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const term = fold(q.trim());
    const digits = q.replace(/\D/g, "");
    const list = term
      ? customers.filter(
          (c) =>
            fold(c.name).includes(term) ||
            fold(c.businessName ?? "").includes(term) ||
            (digits.length >= 2 && c.phone.includes(digits)),
        )
      : customers;
    return list.slice(0, 8);
  }, [customers, q]);

  if (selected) {
    return (
      <div className="picked">
        <span className="avatar" aria-hidden>
          {initials(customerDisplay(selected))}
        </span>
        <span className="grow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {customerDisplay(selected)} <small>· {fmtPhone(selected.phone)}</small>
        </span>
        <button
          type="button"
          className="btn xs ghost"
          onClick={() => {
            onChange(null);
            setText("");
            window.setTimeout(() => input.current?.focus(), 0);
          }}
        >
          Change
        </button>
      </div>
    );
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(matches.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && open && matches[active]) {
      e.preventDefault();
      onChange(matches[active].id);
      onPendingText?.("");
      setOpen(false);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="picker">
      <input
        ref={input}
        id={id}
        className="input"
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${matches[active].id}` : undefined}
        placeholder={customers.length ? "Search by name, business or phone" : onCreate ? "No clients yet — type a name to create one" : "No customers yet — leave empty"}
        value={q}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKey}
        autoComplete="off"
      />
      {q.trim() && !open ? (
        <span className="hint" role="note" style={{ display: "block", marginTop: 6, color: "var(--gold)" }}>
          Not saved — “{q.trim()}” isn’t picked. Choose a client from the list{onCreate ? " or create a new one" : ""}.
        </span>
      ) : null}
      {open && (matches.length > 0 || (onCreate && q.trim())) ? (
        <ul className="picker-list" role="listbox" id={listId}>
          {matches.map((c, i) => (
            <li
              key={c.id}
              id={`${listId}-${c.id}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "act" : undefined}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(c.id);
                onPendingText?.("");
                setOpen(false);
              }}
            >
              <span>{customerDisplay(c)}</span>
              <small>{fmtPhone(c.phone)}</small>
            </li>
          ))}
          {onCreate && q.trim() ? (
            <li
              role="option"
              aria-selected={false}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onCreate(q.trim());
                setText("");
                setOpen(false);
              }}
            >
              <span className="vio3">+ New client “{q.trim()}”</span>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
