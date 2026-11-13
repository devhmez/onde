"use client";
// "Find a stand": one search box on every admin page (sidebar button on desktop, magnifier in the iPhone top bar,
// "/" or ⌘K). Type the code printed under the QR (case, spaces and dashes don't matter, look-alikes are read when only
// one code fits), a client name, business or phone. A code opens that stand's page directly.
// The overlay stays mounted (hidden + inert) so opening it can focus the input inside the tap itself — iOS only shows
// the keyboard for a focus that happens during the user's gesture.
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { flushSync } from "react-dom";
import { contactPrefix, customerDisplay, fmtPhone } from "./format";
import { IconDashboard, IconSearch, IconX } from "./icons";
import { standHref } from "./meta";
import type { FindResponse, StandHit } from "./types";
import { ChipPill, Pill, TagStatusPill } from "./ui";

export type FinderHandle = { open: () => void };

/** A search result with the (trimmed) text it answers: Enter and the result list never act on an earlier query. */
type Result = FindResponse & { q: string };

/** "2 stands", "2 stands · 4 other", "4 products": a client's review stands, counted apart from stickers and cards. */
function productsLabel(list: { kind: string }[]): string {
  const stands = list.filter((s) => s.kind === "stand").length;
  const other = list.length - stands;
  if (!other) return `${stands} stand${stands === 1 ? "" : "s"}`;
  if (!stands) return `${other} product${other === 1 ? "" : "s"}`;
  return `${stands} stand${stands === 1 ? "" : "s"} · ${other} other`;
}

function Hit({ s, exact, onOpen }: { s: StandHit; exact?: boolean; onOpen: (code: string) => void }) {
  return (
    <button type="button" className={`fr-item${exact ? " fr-exact" : ""}`} data-fr onClick={() => onOpen(s.code)}>
      <span className="fr-code">{s.code}</span>
      <span className="fr-meta">
        <b>{s.stock ? "In stock — not sold" : (s.customerName ?? "No customer")}</b>
        <small>
          {s.product}
          {s.tapCount ? ` · ${s.tapCount} tap${s.tapCount === 1 ? "" : "s"}` : ""}
          {s.destinationUrl ? ` · ${s.destinationUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}` : ""}
        </small>
      </span>
      <span className="fr-pills">
        <TagStatusPill status={s.status} stock={s.stock} url={s.destinationUrl} />
        {s.kind === "stand" || s.chipStatus !== "none" ? <ChipPill status={s.chipStatus} short /> : null}
      </span>
    </button>
  );
}

export default function StandFinder({ ref }: { ref?: Ref<FinderHandle> }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);
  const entering = useRef(false);

  const show = useCallback(() => {
    // Synchronous render + focus inside the tap/click: keeps the iPhone keyboard.
    flushSync(() => setOpen(true));
    input.current?.focus();
    input.current?.select();
  }, []);
  const close = useCallback(() => setOpen(false), []);
  useImperativeHandle(ref, () => ({ open: show }), [show]);

  // Close on navigation.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  // Shortcuts: "/" or ⌘K / Ctrl+K anywhere (not while typing elsewhere); Escape closes.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing && !document.querySelector("[role=dialog][aria-modal=true]:not(.finder)"))) {
        e.preventDefault();
        show();
      } else if (e.key === "Escape" && open) close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, show, close]);

  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);

  // Debounced search (the empty query lists the latest stands).
  useEffect(() => {
    if (!open) return;
    const id = ++reqId.current;
    const ctrl = new AbortController();
    const term = q.trim();
    const t = window.setTimeout(
      async () => {
        setBusy(true);
        try {
          const r = await fetch(`/api/admin/find?q=${encodeURIComponent(term)}`, { signal: ctrl.signal, cache: "no-store" });
          if (!r.ok) throw new Error(String(r.status));
          const data = (await r.json()) as FindResponse;
          if (id === reqId.current) {
            setRes({ ...data, q: term });
            setFailed(false);
          }
        } catch (err) {
          if ((err as Error).name !== "AbortError" && id === reqId.current) setFailed(true);
        } finally {
          if (id === reqId.current) setBusy(false);
        }
      },
      q.trim() ? 160 : 0,
    );
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const openStand = (code: string) => go(standHref(code));

  /** Enter before the debounced search answered: search this exact text now, and open its stand if there is one. */
  async function searchNow(term: string) {
    if (entering.current) return;
    entering.current = true;
    const id = ++reqId.current;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/find?q=${encodeURIComponent(term)}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const data = (await r.json()) as FindResponse;
      if (id !== reqId.current) return; // typed on meanwhile
      setRes({ ...data, q: term });
      setFailed(false);
      if (data.exact) openStand(data.exact.code);
    } catch {
      if (id === reqId.current) setFailed(true);
    } finally {
      entering.current = false;
      if (id === reqId.current) setBusy(false);
    }
  }

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (res && res.q === q.trim()) {
        if (res.exact) openStand(res.exact.code);
        else body.current?.querySelector<HTMLElement>("[data-fr]")?.click();
      } else void searchNow(q.trim());
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      body.current?.querySelector<HTMLElement>("[data-fr]")?.focus();
    }
  };
  const onBodyKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = [...(body.current?.querySelectorAll<HTMLElement>("[data-fr]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    if (e.key === "ArrowUp" && i === 0) input.current?.focus();
    else items[Math.min(items.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
  };

  const typed = q.trim();
  // Results of an earlier query stay visible (no jumping list while typing) but dimmed and inert until this one answers.
  const stale = Boolean(res && res.q !== typed);
  const empty =
    res && !stale && typed && !res.exact && !res.suggestions.length && !res.partial.length && !res.customers.length && !busy;

  return (
    <div className={`finder${open ? " open" : ""}`} role="dialog" aria-modal="true" aria-label="Find a stand" aria-hidden={!open} inert={!open}>
      <div className="finder-scrim" onClick={close} aria-hidden />
      <div className="finder-panel">
        <div className="finder-bar">
          <IconSearch />
          <label htmlFor="stand-finder-q" className="sr-only">
            Find a stand: code under the QR, client name, business or phone
          </label>
          <input
            ref={input}
            id="stand-finder-q"
            type="search"
            enterKeyHint="go"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="Code under the QR, client, phone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
          />
          {busy ? <span className="busy" aria-hidden /> : null}
          <button type="button" className="x" aria-label="Close search" onClick={close}>
            <IconX />
          </button>
        </div>
        <div className={`finder-body${stale ? " stale" : ""}`} ref={body} onKeyDown={onBodyKey} aria-live="polite" aria-busy={stale} inert={stale}>
          {failed ? <div className="fr-empty">Search failed — check the connection and try again.</div> : null}
          {!typed && res?.recent.length ? (
            <>
              <div className="fr-sec">Recently changed</div>
              {res.recent.map((s) => (
                <Hit key={s.id} s={s} onOpen={openStand} />
              ))}
              <p className="fr-hint">
                Type the 6-character code printed under the QR (or tap the stand with a phone: the page shows it), a client name or a phone
                number. <kbd>Enter</kbd> opens the stand.
              </p>
            </>
          ) : null}
          {!typed && res && !res.recent.length ? <div className="fr-empty">No stands yet — create stock in Products → + Add stock.</div> : null}

          {typed && res?.exact ? (
            <>
              <div className="fr-sec">Stand</div>
              <Hit s={res.exact} exact onOpen={openStand} />
              {res.readAs && res.readAs !== res.code ? (
                <p className="fr-note vio">
                  You typed <b className="mono">{res.code}</b> — read as <b className="mono">{res.readAs}</b> (0/O, 1/I, 5/S, 8/B are never used in
                  codes).
                </p>
              ) : null}
              {res.lookalikes.length ? (
                <>
                  <p className="fr-note">
                    <b>Check the print:</b> {res.lookalikes.length === 1 ? "another code looks almost the same" : "other codes look almost the same"} (C/G/Q,
                    U/V, M/N…). Compare the letters under the QR — or tap the stand: the page shows its code.
                  </p>
                  {res.lookalikes.map((s) => (
                    <Hit key={s.id} s={s} onOpen={openStand} />
                  ))}
                </>
              ) : null}
            </>
          ) : null}

          {typed && res && !res.exact && res.noSuchCode ? (
            <p className="fr-note">
              <b>No stand with the code {res.code}.</b>{" "}
              {res.suggestions.length ? "Did you mean one of these? Check the print, or tap the stand: the page shows its code." : "Check the code printed under the QR, or tap the stand with a phone: the page shows its code."}
            </p>
          ) : null}
          {typed && res && !res.exact && res.suggestions.length ? (
            <>
              <div className="fr-sec">{res.noSuchCode ? "Close codes" : "Did you mean"}</div>
              {res.suggestions.map((s) => (
                <Hit key={s.id} s={s} onOpen={openStand} />
              ))}
            </>
          ) : null}

          {typed && res?.partial.length ? (
            <>
              <div className="fr-sec">Codes containing {res.code}</div>
              {res.partial.map((s) => (
                <Hit key={s.id} s={s} onOpen={openStand} />
              ))}
            </>
          ) : null}

          {typed && res?.customers.length ? (
            <>
              <div className="fr-sec">Clients</div>
              {res.customers.map((c) => (
                <div key={c.id}>
                  <div className="fr-cust">
                    <button type="button" className="fr-item" data-fr onClick={() => go(`/admin/customers/${c.id}`)}>
                      <span className="avatar" aria-hidden style={{ width: 30, height: 30 }}>
                        {customerDisplay(c).slice(0, 1).toUpperCase()}
                      </span>
                      <span className="fr-meta">
                        <b>{customerDisplay(c)}</b>
                        <small>
                          {contactPrefix(c)}+216 {fmtPhone(c.phone)}
                        </small>
                      </span>
                      <span className="fr-pills">
                        <Pill tone={c.stands.length ? "vio" : "gray"}>{productsLabel(c.stands)}</Pill>
                      </span>
                    </button>
                    {/* Their client dashboard, as they see it (a separate document: a full page load). */}
                    <a className="fr-dash" data-fr href={`/admin/customers/${c.id}/dashboard`} aria-label={`View ${customerDisplay(c)}’s dashboard`}>
                      <IconDashboard />
                      <span>Dashboard</span>
                    </a>
                  </div>
                  {c.stands.length ? (
                    <div className="fr-codes">
                      {c.stands.map((s) => (
                        <a
                          key={s.id}
                          href={standHref(s.code)}
                          className={s.status === "active" ? undefined : "off"}
                          title={`${s.product}${s.status === "active" ? "" : " · disabled"}`}
                          aria-label={`${s.code} · ${s.product}${s.status === "active" ? "" : " · disabled"}`}
                          onClick={(e) => {
                            e.preventDefault();
                            openStand(s.code);
                          }}
                        >
                          {s.code}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </>
          ) : null}

          {empty ? (
            <div className="fr-empty">
              Nothing matches “{typed}”.
              <br />
              Try the 6-character code under the QR, a business name or 3+ digits of a phone number.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
