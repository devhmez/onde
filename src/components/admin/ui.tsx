// Stateless building blocks (server- and client-safe): header, pills, destination badge, empty state, pager.
import Link from "next/link";
import type { ReactNode } from "react";
import { CHIP_META, DEST_META, ORDER_STATUS_META, type Tone } from "./meta";
import type { ChipStatus, DestinationType, OrderStatus, TagStatus } from "./types";

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="h">
      <div style={{ minWidth: 0 }}>
        {back ? (
          <Link href={back.href} className="crumb no-print">
            <span aria-hidden>←</span> {back.label}
          </Link>
        ) : null}
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="btns no-print">{actions}</div> : null}
    </header>
  );
}

export function Pill({ tone, children, live }: { tone: Tone; children: ReactNode; live?: boolean }) {
  return (
    <span className={`pill ${tone}${live ? " live" : ""}`}>
      <i />
      {children}
    </span>
  );
}

/**
 * Live / Disabled — a stock link (not sold yet) that is active shows "Not sold", and a sold one without a destination
 * (pass `url`) "No link yet": both open the "not activated" page when tapped.
 */
export function TagStatusPill({ status, stock, url }: { status: TagStatus; stock?: boolean; url?: string }) {
  if (status !== "active") return <Pill tone="off">Disabled</Pill>;
  if (stock) return <Pill tone="gray">Not sold</Pill>;
  return url === "" ? <Pill tone="gold">No link yet</Pill> : <Pill tone="on">Live</Pill>;
}

/** Physical chip state (not written / written / tested / locked). */
export function ChipPill({ status, short }: { status: ChipStatus; short?: boolean }) {
  const m = CHIP_META[status];
  return (
    <span title={`Chip: ${m.label}`}>
      <Pill tone={m.tone}>{short ? m.short : `Chip · ${m.label.toLowerCase()}`}</Pill>
    </span>
  );
}

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  const m = ORDER_STATUS_META[status];
  return <Pill tone={m.tone}>{m.label}</Pill>;
}

export function Swatch({ type, unset, size }: { type: DestinationType; unset?: boolean; size?: number }) {
  const style = size ? { ...DEST_META[type].swatch, width: size, height: size, borderRadius: Math.round(size * 0.3) } : DEST_META[type].swatch;
  return <i className={`sw20${unset ? " sw-unset" : ""}`} style={unset ? undefined : style} aria-hidden />;
}

export function Dest({ type, url }: { type: DestinationType; url: string }) {
  const unset = !url;
  return (
    <span className={`dest${unset ? " unset" : ""}`} title={url || "No destination yet"}>
      <Swatch type={type} unset={unset} />
      {unset ? "Not set yet" : DEST_META[type].label}
    </span>
  );
}

export function EmptyState({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="empty">
      <div className="rings" aria-hidden>
        <span />
        <span />
        <span />
        <i />
      </div>
      <h4>{title}</h4>
      {children ? <p>{children}</p> : null}
      {actions ? <div className="btns">{actions}</div> : null}
    </div>
  );
}

/** Prev/next pager driven by URL search params. */
export function Pager({
  basePath,
  params,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    else sp.delete("page");
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  return (
    <div className="tbl-foot">
      <span>
        {total === 0 ? "No results" : `Showing ${from.toLocaleString("en-US")}–${to.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`}
      </span>
      {pages > 1 ? (
        <nav className="pager" aria-label="Pagination">
          <Link className="btn sm" href={href(page - 1)} aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined} scroll={false}>
            ← Prev
          </Link>
          <span className="muted">
            {page} / {pages}
          </span>
          <Link className="btn sm" href={href(page + 1)} aria-disabled={page >= pages} tabIndex={page >= pages ? -1 : undefined} scroll={false}>
            Next →
          </Link>
        </nav>
      ) : null}
    </div>
  );
}

export function SrTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
