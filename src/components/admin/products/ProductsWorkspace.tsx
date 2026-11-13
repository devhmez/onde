"use client";
// Products = smart links. Left: "All products" table (+ taps chart, like the film). Right: "Edit destination" panel.
// Row click selects instantly (local state) and loads history via ?tag=. Mutations are optimistic (useOptimistic).
// "Stock" view (?stock=1): links made in advance with no customer and no destination — print files + chip how-to.
// Print files default to "not printed yet": a code printed twice would put one link on two stands.
// On a phone (≤ 640 px) the table becomes a two-line list (code + client, destination + taps + status), and ?tag=
// opens the panel straight away (links from search, customer and order pages land on the stand, not on the list).
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useOptimistic, useState, useTransition, type ReactNode } from "react";
import { setTagsStatusAction, updateTagAction } from "@/app/(admin)/admin/actions";
import { standVariant } from "@/lib/business";
import { AreaChart } from "../charts";
import { Modal, SearchBox } from "../controls";
import { displayLink, fmtInt } from "../format";
import { IconDownload } from "../icons";
import { isStock, KIND_LABEL, NO_BLACK_DESIGN, printZipHref, productLabel, standHref, TAG_KINDS } from "../meta";
import { useToast } from "../toast";
import type { ActionResult, CustomerOption, TagDetail, TagKind, TagRow, TagStatus } from "../types";
import { ChipPill, Dest, EmptyState, PageHeader, Pager, Pill, TagStatusPill } from "../ui";
import AddTagModal from "./AddTagModal";
import ChipHelp from "./ChipHelp";
import EditPanel, { type TagPatch } from "./EditPanel";
import StockModal from "./StockModal";

type Opt =
  | { type: "patch"; id: number; patch: Partial<TagRow> }
  | { type: "bulk"; ids: number[]; status: TagStatus };

function reducer(rows: TagRow[], a: Opt): TagRow[] {
  if (a.type === "patch") return rows.map((r) => (r.id === a.id ? { ...r, ...a.patch } : r));
  const set = new Set(a.ids);
  return rows.map((r) => (set.has(r.id) ? { ...r, status: a.status } : r));
}

export default function ProductsWorkspace({
  rows,
  total,
  totalAll,
  stockTotal,
  page,
  pageSize,
  filters,
  selectedId: selectedFromServer,
  detail,
  customers,
  chart,
  openNew,
  kpis,
  blackDesign,
  printSummary,
  stockByKind,
  elsewhere,
}: {
  rows: TagRow[];
  total: number;
  totalAll: number;
  /** Links in stock (no customer, no destination) — for the Stock tab badge and "print all stock". */
  stockTotal: number;
  /** The black stand's print design is installed (until then black stands get no print files). */
  blackDesign: boolean;
  /** Stock print status for the kind filter (Stock view only). */
  printSummary: { unprinted: number; printed: number; missingDesign: number } | null;
  page: number;
  pageSize: number;
  filters: { q: string; status: "" | TagStatus; kind: "" | TagKind; stock: boolean };
  selectedId: number | null;
  detail: TagDetail | null;
  customers: CustomerOption[];
  chart: { labels: string[]; values: number[] };
  openNew: boolean;
  kpis: ReactNode;
  /** Stock links per kind (Add product warns before minting a code while printed stock waits). */
  stockByKind: Partial<Record<TagKind, number>>;
  /** Stock search with no result: the same search over every link ("GJUHPR is sold to Café Lumière"). */
  elsewhere: TagRow[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const toast = useToast();
  const [optRows, applyOpt] = useOptimistic(rows, reducer);
  const [, startTransition] = useTransition();
  const [navPending, startNav] = useTransition();
  const [selectedId, setSelectedId] = useState<number | null>(selectedFromServer);
  // ?tag= (a link to one stand) opens the panel at once — on a phone it is the drawer.
  const [drawer, setDrawer] = useState(() => Boolean(sp.get("tag")));
  const [manage, setManage] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [addOpen, setAddOpen] = useState(openNew);
  const [stockOpen, setStockOpen] = useState(false);
  const [bleed, setBleed] = useState(false);
  const [reprint, setReprint] = useState(false);

  // Follow the server's selection when it changes (new navigation), without an effect.
  const [serverSel, setServerSel] = useState(selectedFromServer);
  if (serverSel !== selectedFromServer) {
    setServerSel(selectedFromServer);
    setSelectedId(selectedFromServer);
  }

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[role=dialog]")) setDrawer(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer]);

  const href = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const select = (id: number) => {
    setSelectedId(id);
    setDrawer(true);
    startNav(() => router.replace(href({ tag: String(id), new: null }), { scroll: false }));
  };

  const selectedRow =
    optRows.find((r) => r.id === selectedId) ?? (detail && detail.row.id === selectedId ? detail.row : null);
  const selectedDetail = detail && detail.row.id === selectedId && !navPending ? detail : null;

  const onUpdate = (id: number, patch: TagPatch, display: Partial<TagRow>) =>
    new Promise<ActionResult<{ tag: TagRow }>>((resolve) => {
      startTransition(async () => {
        applyOpt({ type: "patch", id, patch: display });
        const res = await updateTagAction({ id, ...patch });
        resolve(res);
      });
    });

  const bulk = (status: TagStatus) => {
    const ids = [...checked];
    if (!ids.length) return;
    startTransition(async () => {
      applyOpt({ type: "bulk", ids, status });
      const res = await setTagsStatusAction({ ids, status });
      if (res.ok) {
        toast.ok(`${res.data.count} product${res.data.count > 1 ? "s" : ""} ${status === "active" ? "enabled" : "disabled"}`);
        setChecked(new Set());
      } else toast.err("Bulk update failed", res.error);
    });
  };

  const pageIds = optRows.map((r) => r.id);
  // A selected black stand cannot be printed yet (the server refuses it rather than use the white design).
  const blackChecked = blackDesign ? 0 : optRows.filter((r) => checked.has(r.id) && standVariant(r) === "black").length;
  const allChecked = pageIds.length > 0 && pageIds.every((id) => checked.has(id));
  const filtered = Boolean(filters.q || filters.status || filters.kind || filters.stock);
  const pagerParams: Record<string, string | undefined> = {
    q: filters.q || undefined,
    status: filters.status || undefined,
    kind: filters.kind || undefined,
    stock: filters.stock ? "1" : undefined,
    tag: selectedId ? String(selectedId) : undefined,
  };
  const view = filters.stock ? "stock" : filters.status;
  const showStock = () => startNav(() => router.replace(href({ stock: "1", status: null, page: null, q: null }), { scroll: false }));

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Every chip, every link, one place."
        actions={
          <>
            <a className="btn" href="/api/admin/export/register" download title="Stand register (CSV): code, product, status, chip, client, destination, taps, printed">
              Export register
            </a>
            <button
              type="button"
              className="btn"
              aria-pressed={manage}
              disabled={totalAll === 0}
              onClick={() => {
                setManage((m) => !m);
                setChecked(new Set());
              }}
            >
              {manage ? "Done managing" : "Manage products"}
            </button>
            <button type="button" className="btn" onClick={() => setAddOpen(true)}>
              + Add product
            </button>
            <button type="button" className="btn p" onClick={() => setStockOpen(true)}>
              + Add stock
            </button>
          </>
        }
      />
      {kpis}

      <div className="ws">
        <motion.section
          className="card"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
          aria-labelledby="all-products"
        >
          <div className="card-h">
            <div>
              <h3 id="all-products">{filters.stock ? "Stock" : "All products"}</h3>
              <div className="sub">
                {filters.stock
                  ? "Made in advance — no customer, no destination yet. Print them, write the chips, assign each one when you sell it."
                  : "Change any destination instantly — no chip rewriting."}
              </div>
            </div>
            {totalAll > 0 ? (
              <div className="toolbar">
                <SearchBox placeholder="Search code, customer, link…" />
                <nav className="seg" aria-label="Status filter">
                  {(["", "stock", "active", "disabled"] as const).map((s) => (
                    <Link
                      key={s || "all"}
                      href={href(s === "stock" ? { stock: "1", status: null, page: null } : { status: s || null, stock: null, page: null })}
                      className={view === s ? "on" : undefined}
                      aria-current={view === s ? "true" : undefined}
                      scroll={false}
                    >
                      {s === "" ? "All" : s === "stock" ? `Stock · ${fmtInt(stockTotal)}` : s === "active" ? "Active" : "Disabled"}
                    </Link>
                  ))}
                </nav>
                <label className="sr-only" htmlFor="kind-filter">
                  Product type
                </label>
                <select
                  id="kind-filter"
                  className="select sm"
                  style={{ width: 150 }}
                  value={filters.kind}
                  onChange={(e) => startNav(() => router.replace(href({ kind: e.target.value || null, page: null }), { scroll: false }))}
                >
                  <option value="">All types</option>
                  {TAG_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          {filters.stock && stockTotal > 0 ? (
            <div className="stockbar">
              <span className="grow">
                <b>{fmtInt(stockTotal)}</b> {filters.kind ? KIND_LABEL[filters.kind].toLowerCase() : "link"}
                {stockTotal === 1 ? "" : "s"} in stock — taps show the “not activated yet” page until you assign them.
                {printSummary?.printed ? <> {fmtInt(printSummary.printed)} already in print files.</> : null}
                {printSummary?.missingDesign ? (
                  <>
                    {" "}
                    {fmtInt(printSummary.missingDesign)} black stand{printSummary.missingDesign === 1 ? "" : "s"}: {NO_BLACK_DESIGN.toLowerCase()}.
                  </>
                ) : null}
              </span>
              <label className="check" style={{ fontSize: 12.5 }}>
                <input type="checkbox" className="chk" checked={bleed} onChange={(e) => setBleed(e.target.checked)} />
                3 mm bleed PDFs
              </label>
              {printSummary && printSummary.unprinted > 0 ? (
                <a className="btn sm p" href={printZipHref({ stock: true, unprinted: true, kind: filters.kind, bleed })} download>
                  <IconDownload /> Print files · not printed yet ({fmtInt(printSummary.unprinted)})
                </a>
              ) : (
                <button type="button" className="btn sm p" disabled title="Every stock link is already in a print download">
                  <IconDownload /> Print files · all printed
                </button>
              )}
              {printSummary && printSummary.printed > 0 ? (
                <button type="button" className="btn sm" onClick={() => setReprint(true)}>
                  All stock…
                </button>
              ) : null}
            </div>
          ) : null}

          {totalAll === 0 ? (
            <EmptyState
              title="No smart links yet"
              actions={
                <>
                  <button type="button" className="btn p" onClick={() => setAddOpen(true)}>
                    + Add product
                  </button>
                  <Link className="btn" href="/admin/orders">
                    Go to orders
                  </Link>
                </>
              }
            >
              Create one or generate them from an order — every chip gets a permanent onde.tn/t/CODE link whose destination you can change anytime.
            </EmptyState>
          ) : optRows.length === 0 && filters.stock && !filters.q ? (
            <EmptyState
              title="No stock links"
              actions={
                <button type="button" className="btn p" onClick={() => setStockOpen(true)}>
                  + Add stock
                </button>
              }
            >
              Create codes in advance (e.g. 20 white stands): you get the print files with each QR and a chip sheet, and you assign each link to a
              customer the day you sell it.
            </EmptyState>
          ) : optRows.length === 0 && filters.stock && elsewhere.length ? (
            <div className="notice mt16" role="note">
              <div>
                <b>Not in stock.</b>{" "}
                {elsewhere.map((t, i) => (
                  <span key={t.id}>
                    {i ? " · " : ""}
                    <Link className="vio3 mono" href={standHref(t.code)}>
                      {t.code}
                    </Link>{" "}
                    {t.customerName ? `is sold to ${t.customerName}` : t.destinationUrl ? `points to ${displayLink(t.destinationUrl)} (no customer)` : "is in stock"}
                    {t.status === "disabled" ? " (disabled)" : ""}
                  </span>
                ))}
                .{" "}
                <Link className="linkbtn" href={href({ stock: null, page: null })} scroll={false}>
                  Search all products →
                </Link>
              </div>
            </div>
          ) : optRows.length === 0 ? (
            <EmptyState
              title="Nothing matches these filters"
              actions={
                <Link className="btn" href={pathname} scroll={false}>
                  Clear filters
                </Link>
              }
            >
              {filtered ? "Try another code, customer name or phone number." : "No products on this page."}
            </EmptyState>
          ) : (
            <>
              <div className="tbl-wrap stands">
                <table>
                  <thead>
                    <tr>
                      {manage ? (
                        <th style={{ width: 34 }}>
                          <input
                            type="checkbox"
                            className="chk"
                            aria-label="Select all on this page"
                            checked={allChecked}
                            onChange={() => setChecked(allChecked ? new Set() : new Set(pageIds))}
                          />
                        </th>
                      ) : null}
                      <th>Code</th>
                      <th>Customer</th>
                      <th>Product</th>
                      <th>Destination</th>
                      <th>Status</th>
                      <th>Chip</th>
                      <th className="num">Taps</th>
                    </tr>
                  </thead>
                  <tbody>
                    {optRows.map((r, i) => (
                      <motion.tr
                        key={r.id}
                        className={`click${r.id === selectedId ? " hl" : ""}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.4, delay: Math.min(i * 0.025, 0.3) }}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest("input,a,button,label")) return;
                          if (manage) {
                            setChecked((c) => {
                              const n = new Set(c);
                              if (n.has(r.id)) n.delete(r.id);
                              else n.add(r.id);
                              return n;
                            });
                          } else select(r.id);
                        }}
                      >
                        {manage ? (
                          <td>
                            <input
                              type="checkbox"
                              className="chk"
                              aria-label={`Select ${r.code}`}
                              checked={checked.has(r.id)}
                              onChange={() =>
                                setChecked((c) => {
                                  const n = new Set(c);
                                  if (n.has(r.id)) n.delete(r.id);
                                  else n.add(r.id);
                                  return n;
                                })
                              }
                            />
                          </td>
                        ) : null}
                        <td className="code">
                          <button type="button" className="rowlink" onClick={() => select(r.id)} aria-label={`Edit ${r.code}`} aria-current={r.id === selectedId ? "true" : undefined}>
                            {r.code}
                          </button>
                        </td>
                        <td className="clip" title={r.label}>
                          {r.customerName ?? (isStock(r) ? <Pill tone="vio">In stock</Pill> : <span className="muted">Unassigned</span>)}
                        </td>
                        <td className="nowrap">{productLabel(r)}</td>
                        <td>
                          <Dest type={r.destinationType} url={r.destinationUrl} />
                        </td>
                        <td>
                          <TagStatusPill status={r.status} stock={isStock(r)} url={r.destinationUrl} />
                        </td>
                        <td>
                          <ChipPill status={r.chipStatus} short />
                        </td>
                        <td className="num">{fmtInt(r.tapCount)}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="mlist" aria-label={filters.stock ? "Stock" : "All products"}>
                {optRows.map((r) => (
                  <li key={r.id}>
                    {manage ? (
                      <label className="mrow">
                        <span className="l1">
                          <input
                            type="checkbox"
                            className="chk"
                            checked={checked.has(r.id)}
                            onChange={() =>
                              setChecked((c) => {
                                const n = new Set(c);
                                if (n.has(r.id)) n.delete(r.id);
                                else n.add(r.id);
                                return n;
                              })
                            }
                          />
                          <span className="code">{r.code}</span>
                          <span className="who">{r.customerName ?? (isStock(r) ? "In stock" : "Unassigned")}</span>
                        </span>
                      </label>
                    ) : (
                      <button
                        type="button"
                        className={`mrow${r.id === selectedId && drawer ? " hl" : ""}`}
                        onClick={() => select(r.id)}
                        aria-label={`${r.code} — ${r.customerName ?? (isStock(r) ? "in stock" : "unassigned")}`}
                      >
                        <span className="l1">
                          <span className="code">{r.code}</span>
                          <span className="who">{r.customerName ?? (isStock(r) ? <Pill tone="vio">In stock</Pill> : <span className="muted">Unassigned</span>)}</span>
                          <ChipPill status={r.chipStatus} short />
                        </span>
                        <span className="l2">
                          <span className="dest">
                            {r.destinationUrl ? displayLink(r.destinationUrl) : `${productLabel(r)} · no destination`}
                          </span>
                          <span className="taps">{fmtInt(r.tapCount)} taps</span>
                          <TagStatusPill status={r.status} stock={isStock(r)} url={r.destinationUrl} />
                        </span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <Pager basePath={pathname} params={pagerParams} page={page} pageSize={pageSize} total={total} />
              <AnimatePresence>
                {manage ? (
                  <motion.div
                    className="bulkbar"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  >
                    <span>
                      <b>{checked.size}</b> selected
                    </span>
                    <span className="grow" />
                    {blackChecked ? (
                      <button type="button" className="btn sm" disabled title={`${NO_BLACK_DESIGN} — unselect the black stands`}>
                        <IconDownload /> Print files · {blackChecked} black
                      </button>
                    ) : (
                      <a
                        className="btn sm"
                        href={printZipHref({ ids: [...checked] })}
                        aria-disabled={!checked.size}
                        tabIndex={checked.size ? undefined : -1}
                        download
                        title="Stand prints (PNG + PDF with each QR) and a chip sheet"
                      >
                        <IconDownload /> Print files
                      </a>
                    )}
                    <button type="button" className="btn sm okb" disabled={!checked.size} onClick={() => bulk("active")}>
                      Enable
                    </button>
                    <button type="button" className="btn sm danger" disabled={!checked.size} onClick={() => bulk("disabled")}>
                      Disable
                    </button>
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => {
                        setManage(false);
                        setChecked(new Set());
                      }}
                    >
                      Done
                    </button>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </>
          )}

          {filters.stock ? <ChipHelp inset defaultOpen={stockTotal > 0} /> : null}

          {totalAll > 0 ? (
            <>
              <div className="row between mt22">
                <span className="lbl" style={{ margin: 0 }}>
                  NFC + QR taps · last 30 days
                </span>
                <span className="hint">{fmtInt(chart.values.reduce((s, v) => s + v, 0))} taps</span>
              </div>
              <AreaChart
                labels={chart.labels}
                series={[{ key: "taps", label: "taps", color: "#8C74FF", values: chart.values }]}
                ariaLabel="Taps per day over the last 30 days"
                emptyText="No taps yet — the curve starts with the first tap on a chip."
                marginTop={10}
              />
            </>
          ) : null}
        </motion.section>

        <div className={`edit-scrim${drawer ? " open" : ""}`} onClick={() => setDrawer(false)} aria-hidden />
        <aside className={`edit-col${drawer ? " open" : ""}`} aria-label="Edit destination">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            style={{ minHeight: "100%" }}
          >
          {selectedRow ? (
            <EditPanel
              // A fresh panel when the stand is sold or returned to stock (its form changes completely).
              key={`${selectedRow.id}:${isStock(selectedRow) ? "stock" : "sold"}`}
              row={selectedRow}
              detail={selectedDetail}
              customers={customers}
              blackDesign={blackDesign}
              onClose={() => setDrawer(false)}
              onUpdate={(patch) => {
                const display: Partial<TagRow> = {};
                if (patch.destinationType) display.destinationType = patch.destinationType;
                if (patch.destinationUrl !== undefined) display.destinationUrl = patch.destinationUrl;
                if (patch.status) display.status = patch.status;
                if (patch.label !== undefined) display.label = patch.label;
                if (patch.chipStatus) {
                  display.chipStatus = patch.chipStatus;
                  display.chipAt = Date.now();
                }
                if (patch.customerId !== undefined) {
                  const c = customers.find((x) => x.id === patch.customerId);
                  display.customerId = patch.customerId ?? null;
                  display.customerName = c ? c.businessName?.trim() || c.name : null;
                }
                return onUpdate(selectedRow.id, patch, display);
              }}
              onDeleted={() => {
                setSelectedId(null);
                setDrawer(false);
                startNav(() => router.replace(href({ tag: null }), { scroll: false }));
              }}
            />
          ) : (
            <div className="card edit">
              <h3>Edit destination</h3>
              <div className="sub">Select a product in the table.</div>
              <ol className="hint" style={{ margin: "16px 0 0", paddingLeft: 18, lineHeight: 1.8 }}>
                <li>Create a smart link (or generate them from an order).</li>
                <li>Write its permanent link onde.tn/t/CODE to the chip — once.</li>
                <li>Change where it points anytime from here. The chip never changes.</li>
              </ol>
            </div>
          )}
          </motion.div>
        </aside>
      </div>

      <StockModal open={stockOpen} onClose={() => setStockOpen(false)} onCreated={showStock} blackDesign={blackDesign} />

      <Modal
        open={reprint}
        onClose={() => setReprint(false)}
        title="Print all stock again?"
        subtitle={`Includes ${fmtInt(printSummary?.printed ?? 0)} link${printSummary?.printed === 1 ? "" : "s"} already downloaded in print files.`}
        size="sm"
        footer={
          <>
            <button type="button" className="btn" onClick={() => setReprint(false)} data-autofocus>
              Cancel
            </button>
            <a className="btn danger" href={printZipHref({ stock: true, kind: filters.kind, bleed })} download onClick={() => setReprint(false)}>
              <IconDownload /> Download all stock
            </a>
          </>
        }
      >
        <p className="hint">
          Each code must be on one stand only: if two stands share a code, the second customer’s taps open the first customer’s page. Use this
          only to replace a lost or damaged print — and throw the old one away.
        </p>
      </Modal>

      <AddTagModal
        open={addOpen}
        customers={customers}
        stockByKind={stockByKind}
        onUseStock={() => {
          setAddOpen(false);
          showStock();
        }}
        onClose={() => {
          setAddOpen(false);
          if (sp.get("new")) startNav(() => router.replace(href({ new: null }), { scroll: false }));
        }}
        onCreated={(row) => {
          setSelectedId(row.id);
          startNav(() => router.replace(href({ tag: String(row.id), new: null, page: null, q: null, status: null, kind: null }), { scroll: false }));
        }}
      />
    </>
  );
}
