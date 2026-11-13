"use client";
// The film's sidebar: logo, "Find a stand" search, square-glyph nav with the violet active gradient, "Super Admin" badge.
// Below 900px it collapses into a sticky top bar (search + menu buttons) with a slide-in menu.
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IconMenu, IconSearch, IconX } from "./icons";
import { NAV } from "./meta";
import StandFinder, { type FinderHandle } from "./StandFinder";

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin" || pathname === "/admin/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavList({ pathname, newOrders, onNavigate }: { pathname: string; newOrders: number; onNavigate?: () => void }) {
  return (
    <nav className="nav" aria-label="Admin">
      {NAV.map((item) => {
        const on = isActive(pathname, item.href);
        return (
          <Link key={item.href} href={item.href} className={on ? "on" : undefined} aria-current={on ? "page" : undefined} onClick={onNavigate}>
            <i aria-hidden />
            {item.label}
            {item.href === "/admin/orders" && newOrders > 0 ? (
              <span className="count" aria-label={`${newOrders} new orders`}>
                {newOrders > 99 ? "99+" : newOrders}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function Badge({ siteUrl }: { siteUrl: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="badge">
      <b>Super Admin</b>
      Full control of every ONDE product.
      <div className="badge-links">
        <a href={siteUrl} target="_blank" rel="noreferrer">
          View site ↗
        </a>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await fetch("/api/admin/logout", { method: "POST" });
            } finally {
              router.replace("/admin/login");
              router.refresh();
            }
          }}
        >
          {busy ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </div>
  );
}

export default function Sidebar({ newOrders, siteUrl }: { newOrders: number; siteUrl: string }) {
  const pathname = usePathname() ?? "/admin";
  const [open, setOpen] = useState(false);
  const finder = useRef<FinderHandle>(null);
  const current = NAV.find((n) => isActive(pathname, n.href))?.label ?? (pathname.startsWith("/admin/stands/") ? "Stand" : "Admin");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <aside className="side">
        <Link href="/admin" className="side-logo" aria-label="ONDE admin home">
          <Image src="/brand/mark_white.png" alt="onde" width={118} height={44} priority />
        </Link>
        <button type="button" className="side-find" onClick={() => finder.current?.open()} aria-label="Find a stand (code, client or phone)">
          <IconSearch />
          Find a stand
          <kbd aria-hidden>/</kbd>
        </button>
        <NavList pathname={pathname} newOrders={newOrders} />
        <Badge siteUrl={siteUrl} />
      </aside>

      <div className="topbar">
        <Link href="/admin" aria-label="ONDE admin home">
          <Image src="/brand/mark_white.png" alt="onde" width={84} height={32} priority />
        </Link>
        <span className="where">{current}</span>
        <span className="tb-right">
          <button type="button" className="find-btn" aria-label="Find a stand (code, client or phone)" onClick={() => finder.current?.open()}>
            <IconSearch />
          </button>
          <button type="button" className="burger" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
            <IconMenu />
          </button>
        </span>
      </div>

      <StandFinder ref={finder} />

      <AnimatePresence>
        {open ? (
          <>
            <motion.div className="mnav-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.div
              className="mnav"
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
            >
              <div className="row between" style={{ marginBottom: 26 }}>
                <Image src="/brand/mark_white.png" alt="onde" width={104} height={39} />
                <button type="button" className="x" aria-label="Close menu" onClick={() => setOpen(false)}>
                  <IconX />
                </button>
              </div>
              <NavList pathname={pathname} newOrders={newOrders} onNavigate={() => setOpen(false)} />
              <Badge siteUrl={siteUrl} />
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
