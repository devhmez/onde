"use client";
// Site navigation: glass bar that hides on scroll-down / returns on scroll-up, sliding hover pill, active dot,
// FR|EN switch (keeps the current path, sets the onde-locale cookie), cart button (shop module), order CTA,
// and a full-screen mobile menu (circular clip reveal + staggered masked links, focus-trapped, Esc to close).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import clsx from "clsx";
import CartButton from "@/components/shop/CartButton";
import type { Locale } from "@/i18n/config";
import Logo from "./Logo";
import MagneticButton from "./MagneticButton";
import { gsap, registerGsap, lockScroll, unlockScroll, prefersReducedMotion } from "@/lib/motion";
import { formatPhone, telHref, whatsappHref, type CommonDict, type SiteContact } from "./types";

type NavProps = { locale: Locale; dict: CommonDict; contact: SiteContact };

type NavLink = { href: string; label: string; active: boolean };

export default function Nav({ locale, dict, contact }: NavProps) {
  const pathname = usePathname() || `/${locale}`;
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [pill, setPill] = useState<{ x: number; w: number; on: boolean }>({ x: 0, w: 0, on: false });
  const groupRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  const base = `/${locale}`;
  const links: NavLink[] = [
    { href: base, label: dict.nav.home, active: pathname === base || pathname === `${base}/` },
    {
      href: `${base}/shop`,
      label: dict.nav.shop,
      active: /^\/(fr|en)\/(shop|checkout|order)(\/|$)/.test(pathname),
    },
    { href: `${base}/about`, label: dict.nav.about, active: pathname.startsWith(`${base}/about`) },
    { href: `${base}/contact`, label: dict.nav.contact, active: pathname.startsWith(`${base}/contact`) },
  ];

  const other: Locale = locale === "fr" ? "en" : "fr";
  const switchPath = pathname.replace(/^\/(fr|en)(?=\/|$)/, `/${other}`) || `/${other}`;
  const onSwitch = (e: ReactMouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    document.cookie = `onde-locale=${other}; path=/; max-age=31536000; samesite=lax`;
    window.location.assign(switchPath + window.location.search + window.location.hash);
  };

  // Scroll state: glass after 24px, hide when scrolling down past 160px.
  useEffect(() => {
    let lastY = window.scrollY;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        setScrolled(y > 24);
        if (Math.abs(y - lastY) > 8) {
          setHidden(y > lastY && y > 160);
          lastY = y;
        }
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Hover pill follows the hovered link, rests on the active one.
  const placePill = useCallback((el: HTMLElement | null) => {
    const group = groupRef.current;
    if (!group || !el) {
      setPill((p) => ({ ...p, on: false }));
      return;
    }
    const g = group.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setPill({ x: r.left - g.left, w: r.width, on: true });
  }, []);
  const restPill = useCallback(() => {
    const active = groupRef.current?.querySelector<HTMLElement>("[data-active='true']") ?? null;
    placePill(active);
  }, [placePill]);
  useEffect(() => {
    restPill();
    const onResize = () => restPill();
    window.addEventListener("resize", onResize);
    document.fonts?.ready.then(restPill).catch(() => undefined);
    return () => window.removeEventListener("resize", onResize);
  }, [pathname, restPill]);

  // Mobile menu timeline
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    registerGsap();
    const q = gsap.utils.selector(menu);
    const tl = gsap.timeline({ paused: true, defaults: { ease: "onde.expo" } });
    tl.set(menu, { autoAlpha: 1 })
      .fromTo(
        menu,
        { clipPath: "circle(0% at calc(100% - 2.4rem) 2rem)" },
        { clipPath: "circle(150% at calc(100% - 2.4rem) 2rem)", duration: 0.85, ease: "expo.inOut" },
        0,
      )
      .fromTo(q(".m-link"), { yPercent: 115, rotate: 5 }, { yPercent: 0, rotate: 0, duration: 0.9, stagger: 0.065 }, 0.28)
      .fromTo(q(".m-foot"), { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.06 }, 0.5);
    tlRef.current = tl;
    return () => {
      tl.kill();
      tlRef.current = null;
    };
  }, []);

  useEffect(() => {
    const tl = tlRef.current;
    const menu = menuRef.current;
    if (!tl || !menu) return;
    if (open) {
      lockScroll("menu");
      if (prefersReducedMotion()) tl.progress(1).pause();
      else tl.timeScale(1).play();
      const first = menu.querySelector<HTMLElement>("a, button");
      window.setTimeout(() => first?.focus({ preventScroll: true }), 120);
    } else {
      unlockScroll("menu");
      if (prefersReducedMotion() || tl.progress() === 0) tl.progress(0).pause();
      else tl.timeScale(1.6).reverse();
    }
  }, [open]);

  useEffect(() => () => unlockScroll("menu"), []);

  // Close on navigation (state adjustment during render — no effect needed)
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  // Esc + focus trap
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (e.key !== "Tab" || !menuRef.current) return;
      const focusables = [
        toggleRef.current,
        ...Array.from(menuRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")),
      ].filter((n): n is HTMLElement => Boolean(n));
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    const onResize = () => {
      if (window.innerWidth >= 1024) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const waHref = whatsappHref(contact.whatsapp, dict.whatsapp.message);

  return (
    <>
      <header
        className={clsx(
          "fixed inset-x-0 top-0 z-50 transition-transform duration-700 ease-expo",
          hidden && !open ? "-translate-y-full" : "translate-y-0",
        )}
      >
        <div
          aria-hidden="true"
          className={clsx(
            "glass absolute inset-0 border-b border-white/[0.06] transition-opacity duration-500",
            scrolled && !open ? "opacity-100" : "opacity-0",
          )}
        />
        <nav
          aria-label={dict.nav.primary}
          className="container-site relative flex h-16 items-center justify-between gap-4 md:h-[76px]"
        >
          <Link
            href={base}
            aria-label={dict.nav.homeLabel}
            className="group relative z-10 -m-2 flex items-center p-2 text-text"
          >
            <Logo navTarget className="h-[26px] w-auto transition-transform duration-500 ease-expo group-hover:scale-[1.04] md:h-[30px]" />
          </Link>

          {/* Desktop links */}
          <div
            ref={groupRef}
            onMouseLeave={restPill}
            className="absolute left-1/2 hidden -translate-x-1/2 items-center rounded-full border border-white/[0.07] bg-white/[0.03] p-1 backdrop-blur-md lg:flex"
          >
            <span
              aria-hidden="true"
              className={clsx(
                "absolute left-0 top-1 h-[calc(100%-0.5rem)] rounded-full bg-white/[0.07] transition-[transform,width,opacity] duration-500 ease-expo",
                pill.on ? "opacity-100" : "opacity-0",
              )}
              style={{ transform: `translateX(${pill.x}px)`, width: pill.w }}
            />
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                data-active={l.active}
                aria-current={l.active ? "page" : undefined}
                onMouseEnter={(e) => placePill(e.currentTarget)}
                onFocus={(e) => placePill(e.currentTarget)}
                className={clsx(
                  "group relative flex items-center gap-2 rounded-full px-4 py-2 text-[0.88rem] font-medium transition-colors lg:px-5",
                  l.active ? "text-text" : "text-muted hover:text-text",
                )}
              >
                <span
                  aria-hidden="true"
                  className={clsx(
                    "h-1.5 w-1.5 rounded-full bg-violet-2 shadow-[0_0_10px_2px_rgb(123_92_255/0.7)] transition-all duration-500 ease-expo",
                    l.active ? "scale-100 opacity-100" : "-ml-3.5 scale-0 opacity-0",
                  )}
                />
                <span className="roll">
                  <span>{l.label}</span>
                  <span aria-hidden="true">{l.label}</span>
                </span>
              </Link>
            ))}
          </div>

          <div className="relative z-10 flex items-center gap-1.5 md:gap-3">
            <div className="hidden items-center text-[0.78rem] font-semibold tracking-[0.14em] md:flex" aria-label={dict.nav.language}>
              <span className="px-1.5 text-text" aria-current="true">
                {locale.toUpperCase()}
              </span>
              <span className="text-line" aria-hidden="true">
                /
              </span>
              <a
                href={switchPath}
                hrefLang={other}
                lang={other}
                onClick={onSwitch}
                aria-label={dict.nav.switchLocale}
                className="px-1.5 text-muted transition-colors hover:text-text"
              >
                {other.toUpperCase()}
              </a>
            </div>

            <CartButton />

            <MagneticButton href={`${base}/shop`} size="sm" className="hidden md:inline-flex" strength={0.25}>
              {dict.cta.order}
            </MagneticButton>

            <button
              ref={toggleRef}
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="site-mobile-menu"
              aria-label={open ? dict.nav.closeMenu : dict.nav.openMenu}
              className="relative grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/[0.04] backdrop-blur lg:hidden"
            >
              <span className="relative block h-3 w-5" aria-hidden="true">
                <span
                  className={clsx(
                    "absolute left-0 top-0 h-[1.5px] w-full rounded bg-text transition-transform duration-500 ease-expo",
                    open && "translate-y-[5px] rotate-45",
                  )}
                />
                <span
                  className={clsx(
                    "absolute bottom-0 left-0 h-[1.5px] rounded bg-text transition-all duration-500 ease-expo",
                    open ? "w-full -translate-y-[5.5px] -rotate-45" : "w-3/5",
                  )}
                />
              </span>
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile full-screen menu */}
      <div
        ref={menuRef}
        id="site-mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label={dict.nav.menu}
        aria-hidden={!open}
        inert={!open}
        className="invisible fixed inset-0 z-40 flex flex-col overflow-y-auto bg-ink opacity-0 lg:hidden"
        data-lenis-prevent
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(80% 50% at 85% 0%, rgb(70 28 247 / 0.45), transparent 70%), radial-gradient(60% 40% at 0% 100%, rgb(123 92 255 / 0.18), transparent 70%)",
          }}
        />
        <div className="container-site relative flex min-h-full flex-1 flex-col pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-24">
          <ul className="flex flex-col gap-1">
            {links.map((l, i) => (
              <li key={l.href} className="overflow-hidden">
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  aria-current={l.active ? "page" : undefined}
                  className="m-link group flex items-baseline gap-4 py-1.5"
                >
                  <span className="font-mono text-xs text-violet-3">0{i + 1}</span>
                  <span
                    className={clsx(
                      "text-display text-[clamp(2.8rem,14vw,4.5rem)] transition-colors",
                      l.active ? "text-text" : "text-text/55 group-active:text-text",
                    )}
                  >
                    {l.label}
                  </span>
                  {l.active && <span className="mb-3 h-2 w-2 rounded-full bg-violet-2 shadow-[0_0_12px_3px_rgb(123_92_255/0.7)]" aria-hidden="true" />}
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-auto flex flex-col gap-5 pt-10">
            <div className="m-foot flex flex-wrap gap-3">
              <MagneticButton href={`${base}/shop`} size="md" onClick={() => setOpen(false)}>
                {dict.cta.order}
              </MagneticButton>
              <MagneticButton href={waHref} size="md" variant="ghost">
                {dict.cta.orderWhatsapp}
              </MagneticButton>
            </div>
            <div className="m-foot flex items-center justify-between border-t border-line pt-5 text-sm">
              <a href={telHref(contact.phone)} className="font-medium text-text">
                {formatPhone(contact.phone)}
              </a>
              <a
                href={switchPath}
                hrefLang={other}
                lang={other}
                onClick={onSwitch}
                aria-label={dict.nav.switchLocale}
                className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold tracking-[0.14em] text-muted"
              >
                {locale.toUpperCase()} <span className="text-line">/</span> <span className="text-text">{other.toUpperCase()}</span>
              </a>
            </div>
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="m-foot text-sm text-muted">
                {contact.email}
              </a>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
