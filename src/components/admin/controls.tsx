"use client";
// Interactive primitives: switch, modal, copy button, URL-driven search box, clickable table rows.
import { AnimatePresence, motion } from "motion/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconCheck, IconCopy, IconSearch, IconX } from "./icons";

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  tone,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  tone?: "ok";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`sw${tone ? ` ${tone}` : ""}`}
      onClick={() => onChange(!checked)}
    />
  );
}

const noopSubscribe = () => () => {};

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab" && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('button:not([disabled]),[href],input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => {
      const root = ref.current;
      const el =
        root?.querySelector<HTMLElement>("[data-autofocus]") ??
        root?.querySelector<HTMLElement>(".modal-b input:not([type=hidden]):not([disabled]), .modal-b select, .modal-b textarea") ??
        root?.querySelector<HTMLElement>(".modal-f button");
      el?.focus();
    }, 60);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      window.clearTimeout(t);
      prev?.focus?.();
    };
  }, [open]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={`modal${size ? ` ${size}` : ""}`}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          >
            <div className="modal-h">
              <div>
                <h3 id={titleId}>{title}</h3>
                {subtitle ? <p>{subtitle}</p> : null}
              </div>
              <button type="button" className="x" onClick={onClose} aria-label="Close">
                <IconX />
              </button>
            </div>
            <div className="modal-b">{children}</div>
            {footer ? <div className="modal-f">{footer}</div> : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

export function CopyButton({ text, label = "Copy link", onCopied }: { text: string; label?: string; onCopied?: () => void }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setDone(true);
        onCopied?.();
        window.setTimeout(() => setDone(false), 1400);
      }}
    >
      {done ? <IconCheck style={{ color: "var(--ok)" }} /> : <IconCopy />}
    </button>
  );
}

/** Search input bound to `?q=` (debounced, resets pagination). */
export function SearchBox({ placeholder, param = "q" }: { placeholder: string; param?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [value, setValue] = useState(sp.get(param) ?? "");
  const [pending, startTransition] = useTransition();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      const next = new URLSearchParams(sp.toString());
      if (value.trim()) next.set(param, value.trim());
      else next.delete(param);
      next.delete("page");
      const qs = next.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    }, 280);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <label className={`search${pending ? " busy" : ""}`}>
      <span className="sr-only">{placeholder}</span>
      <IconSearch />
      <input type="search" value={value} placeholder={placeholder} onChange={(e) => setValue(e.target.value)} />
    </label>
  );
}

/** A table row that navigates on click (the first cell should also hold a real <Link> for keyboard users). */
export function ClickRow({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const router = useRouter();
  return (
    <tr
      className={`click${className ? ` ${className}` : ""}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button,input,label")) return;
        if (e.metaKey || e.ctrlKey) window.open(href, "_blank");
        else router.push(href);
      }}
      onMouseEnter={() => router.prefetch(href)}
    >
      {children}
    </tr>
  );
}
