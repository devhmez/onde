"use client";
// Nav cart icon + count badge. Listens to the window event "onde:add-to-cart" ({ image, rect }) dispatched by
// cart.add(): a clone of the product thumbnail flies on a curved bezier into this icon (scale-down, spin, motion blur,
// ghost trail), then the icon bounces, a violet ripple ring pulses, the count rolls and a mini "peek" card drops in.
import { animate, AnimatePresence, motion, useAnimate, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { cart, cartCount, useCart } from "@/lib/cart";
import { formatDT, priceOrder } from "@/lib/business";
import { fmt, getShopMessages, shopLocale } from "./messages";
import { useShopSettings } from "./useShopSettings";
import { ArrowRightIcon, BagIcon, CheckIcon, CloseIcon } from "./Icons";

type FlyDetail = { image?: string; rect?: { x: number; y: number; w: number; h: number } | null };

// Several CartButtons may exist (desktop + mobile nav): the first visible one handles each event.
const handledEvents = new WeakSet<Event>();
const noopSubscribe = () => () => {};

function isVisible(el: HTMLElement | null): el is HTMLElement {
  if (!el || el.getClientRects().length === 0) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none";
}

export default function CartButton() {
  const params = useParams();
  const locale = shopLocale(params?.locale);
  const t = getShopMessages(locale);
  const state = useCart();
  const count = cartCount(state);
  const settings = useShopSettings();
  const reduce = useReducedMotion();
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const btnRef = useRef<HTMLButtonElement>(null);
  const [iconScope, animateIcon] = useAnimate<HTMLSpanElement>();
  const layers = useRef(new Set<HTMLElement>());
  const pending = useRef(0);
  const lastShown = useRef(0);
  const [held, setHeld] = useState<number | null>(null);
  const [bump, setBump] = useState(0);
  const [peek, setPeek] = useState<{ image: string; key: number; top: number; right: number } | null>(null);
  const [peekHover, setPeekHover] = useState(false);

  const shown = held ?? count;
  useEffect(() => {
    lastShown.current = shown;
  }, [shown]);

  // ---- landing: bounce + ripple + count roll + peek ------------------------------------------------------------
  function land(image: string) {
    pending.current = Math.max(0, pending.current - 1);
    if (pending.current === 0) setHeld(null);
    setBump((b) => b + 1);
    if (!reduce && iconScope.current) {
      animateIcon(
        iconScope.current,
        { scale: [1, 1.34, 0.88, 1.08, 1], rotate: [0, -14, 9, -4, 0] },
        { duration: 0.62, ease: "easeOut" },
      );
    }
    const btn = btnRef.current;
    if (btn && !cart.get().open) {
      const r = btn.getBoundingClientRect();
      setPeek({
        image,
        key: Date.now(),
        top: Math.max(12, r.bottom + 12),
        right: Math.max(12, document.documentElement.clientWidth - r.right),
      });
    }
  }

  // ---- the flight ------------------------------------------------------------------------------------------------
  const onFly = useEffectEvent((detail: FlyDetail) => {
    const btn = btnRef.current;
    const image = detail.image || "/products/stand_white.webp";
    if (!btn) return;
    pending.current += 1;
    const snapshot = lastShown.current;
    setHeld((h) => h ?? snapshot);

    if (reduce) {
      land(image);
      return;
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const target = btn.getBoundingClientRect();
    const ex = Math.min(vw - 16, Math.max(16, target.left + target.width / 2));
    const ey = Math.min(vh - 16, Math.max(16, target.top + target.height / 2));
    const r = detail.rect && detail.rect.w > 0 ? detail.rect : { x: vw / 2 - 60, y: vh / 2 - 60, w: 120, h: 120 };
    const size = Math.max(72, Math.min(200, Math.min(r.w, r.h)));
    const sx = r.x + r.w / 2;
    const sy = r.y + r.h / 2;
    // control point: lift up and drift toward the cart for a natural throw arc
    const cx = sx + (ex - sx) * 0.22;
    const cy = Math.max(-40, Math.min(sy, ey) - Math.max(110, Math.abs(ex - sx) * 0.28));
    const dir = ex >= sx ? 1 : -1;
    const at = (k: number) => {
      const u = 1 - k;
      return { x: u * u * sx + 2 * u * k * cx + k * k * ex, y: u * u * sy + 2 * u * k * cy + k * k * ey };
    };
    const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
    const scaleAt = (k: number) => (k < 0.14 ? 1 + 0.12 * (k / 0.14) : 1.12 - 0.98 * Math.pow((k - 0.14) / 0.86, 1.5));

    const layer = document.createElement("div");
    layer.setAttribute("aria-hidden", "true");
    layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:120;overflow:hidden;";
    const glow = document.createElement("div");
    glow.style.cssText = `position:absolute;left:0;top:0;width:${size * 1.5}px;height:${size * 1.5}px;border-radius:9999px;background:radial-gradient(closest-side,rgba(123,92,255,.55),rgba(70,28,247,.18) 55%,transparent);will-change:transform,opacity;`;
    layer.appendChild(glow);
    const makeImg = (opacity: number) => {
      const img = document.createElement("img");
      img.src = image;
      img.alt = "";
      img.decoding = "async";
      img.style.cssText = `position:absolute;left:0;top:0;width:${size}px;height:${size}px;object-fit:contain;opacity:${opacity};will-change:transform,filter;`;
      layer.appendChild(img);
      return img;
    };
    const ghosts = [makeImg(0.32), makeImg(0.18), makeImg(0.09)];
    const main = makeImg(1);
    document.body.appendChild(layer);
    layers.current.add(layer);

    const place = (el: HTMLElement, k: number, extraBlur: number, prev?: { x: number; y: number }) => {
      const kk = Math.max(0, k);
      const p = at(ease(kk));
      const s = scaleAt(kk);
      const speed = prev ? Math.hypot(p.x - prev.x, p.y - prev.y) : 0;
      el.style.transform = `translate3d(${p.x - size / 2}px, ${p.y - size / 2}px, 0) scale(${s}) rotate(${dir * 32 * ease(kk)}deg)`;
      el.style.filter = `blur(${Math.min(5, speed * 0.09 + extraBlur).toFixed(2)}px)`;
      return p;
    };

    let prev: { x: number; y: number } | undefined;
    place(main, 0, 0);
    ghosts.forEach((g) => place(g, 0, 0));
    animate(0, 1, {
      duration: 0.88,
      ease: "linear",
      onUpdate: (k) => {
        const before = prev;
        prev = place(main, k, 0, before);
        ghosts.forEach((g, i) => place(g, k - (i + 1) * 0.045, 1 + i, before));
        const gp = at(ease(k));
        glow.style.transform = `translate3d(${gp.x - size * 0.75}px, ${gp.y - size * 0.75}px, 0) scale(${scaleAt(k)})`;
        glow.style.opacity = String(Math.max(0, 1 - k * 0.6));
        if (k > 0.86) main.style.opacity = String(Math.max(0, (1 - k) / 0.14));
      },
      onComplete: () => {
        layer.remove();
        layers.current.delete(layer);
        land(image);
      },
    });
  });

  useEffect(() => {
    const onAdd = (e: Event) => {
      if (handledEvents.has(e) || !isVisible(btnRef.current)) return;
      handledEvents.add(e);
      onFly(((e as CustomEvent<FlyDetail>).detail ?? {}) as FlyDetail);
    };
    window.addEventListener("onde:add-to-cart", onAdd);
    const set = layers.current;
    return () => {
      window.removeEventListener("onde:add-to-cart", onAdd);
      set.forEach((l) => l.remove());
      set.clear();
    };
  }, []);

  // ---- peek lifecycle ---------------------------------------------------------------------------------------------
  useEffect(() => {
    if (!peek || peekHover) return;
    const id = window.setTimeout(() => setPeek(null), 3800);
    return () => window.clearTimeout(id);
  }, [peek, peekHover]);
  const peekVisible = !!peek && !state.open;

  const priced = priceOrder(state.items, { rules: settings.rules });
  const label = shown > 0 ? fmt(t.cartButton.labelCount, { count: shown }) : t.cartButton.label;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          setPeek(null);
          cart.open(true);
        }}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={state.open}
        aria-controls={state.open ? "onde-cart-drawer" : undefined}
        className="group/cart relative grid size-11 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-text backdrop-blur-md transition-colors duration-300 hover:border-white/20 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-2"
      >
        <AnimatePresence>
          {bump > 0 && !reduce && (
            <motion.span
              key={bump}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-full border-2 border-violet-2"
              initial={{ scale: 0.7, opacity: 0.95 }}
              animate={{ scale: 2.5, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {bump > 0 && !reduce && (
            <motion.span
              key={`glow-${bump}`}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-full bg-violet/50 blur-md"
              initial={{ opacity: 0.9, scale: 0.9 }}
              animate={{ opacity: 0, scale: 1.6 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7 }}
            />
          )}
        </AnimatePresence>
        <span ref={iconScope} className="relative grid place-items-center">
          <BagIcon size={21} />
        </span>
        <AnimatePresence initial={false}>
          {shown > 0 && (
            <motion.span
              key="badge"
              aria-hidden="true"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 26 }}
              className="absolute -right-1 -top-1 grid h-5 min-w-5 overflow-hidden rounded-full bg-violet px-1 text-[11px] font-bold leading-5 text-white shadow-[0_0_0_2px_var(--color-ink),0_4px_14px_rgba(70,28,247,0.6)]"
            >
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={shown}
                  className="col-start-1 row-start-1 text-center tabular-nums"
                  initial={reduce ? { opacity: 0 } : { y: 14, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { y: -14, opacity: 0 }}
                  transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                >
                  {shown > 99 ? "99+" : shown}
                </motion.span>
              </AnimatePresence>
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {isClient &&
        createPortal(
          <AnimatePresence>
            {peekVisible && peek && (
              <motion.div
                key={peek.key}
                role="status"
                aria-live="polite"
                onMouseEnter={() => setPeekHover(true)}
                onMouseLeave={() => setPeekHover(false)}
                onFocus={() => setPeekHover(true)}
                onBlur={() => setPeekHover(false)}
                onKeyDown={(e) => e.key === "Escape" && setPeek(null)}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.96, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.97, filter: "blur(4px)" }}
                transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                style={{ top: peek.top, right: peek.right }}
                className="fixed z-[95] w-[min(340px,calc(100vw-24px))] origin-top-right overflow-hidden rounded-2xl border border-white/10 bg-ink-2/90 p-3 text-text shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8),0_0_0_1px_rgba(123,92,255,0.12)] backdrop-blur-xl"
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-10 -top-16 size-40 rounded-full bg-violet/30 blur-3xl"
                />
                <div className="relative flex items-center gap-3">
                  <div className="relative grid size-14 shrink-0 place-items-center rounded-xl bg-white/[0.04]">
                    {/* eslint-disable-next-line @next/next/no-img-element -- tiny transient thumbnail, already in cache */}
                    <img src={peek.image} alt="" className="size-12 object-contain" />
                    <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-ok text-ink">
                      <CheckIcon size={12} strokeWidth={3} />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{t.cartButton.added}</p>
                    <p className={priced.freeDelivery ? "text-xs text-ok" : "text-xs text-muted"}>
                      {priced.freeDelivery
                        ? t.freeDelivery.unlocked
                        : fmt(t.freeDelivery.remaining, { amount: formatDT(priced.remainingForFree, locale) })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPeek(null)}
                    aria-label={t.cartButton.dismiss}
                    className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-white/10 hover:text-text focus-visible:outline-2 focus-visible:outline-violet-2"
                  >
                    <CloseIcon size={16} />
                  </button>
                </div>
                <div className="relative mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPeek(null);
                      cart.open(true);
                    }}
                    className="h-10 rounded-full border border-white/12 bg-white/[0.04] text-sm font-medium transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-violet-2"
                  >
                    {t.cartButton.view}
                  </button>
                  <Link
                    href={`/${locale}/checkout`}
                    onClick={() => setPeek(null)}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-violet text-sm font-semibold text-white transition-colors hover:bg-[#5530ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-2"
                  >
                    {t.cartButton.checkout}
                    <ArrowRightIcon size={15} />
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
