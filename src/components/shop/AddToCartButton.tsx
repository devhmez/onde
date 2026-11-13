"use client";
// Magnetic "Ajouter au panier" button: follows the cursor slightly, press ripple, success morph "Ajouté ✓".
// Calls cart.add(item, sourceEl) — the cart store dispatches "onde:add-to-cart" so CartButton runs the fly-to-cart.
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import clsx from "clsx";
import { cart } from "@/lib/cart";
import type { Locale } from "@/i18n/config";
import { localizedName, resolveProductImage, type CartProductInput } from "./catalog";
import { fmt, getShopMessages, shopLocale } from "./messages";
import { BagIcon, PlusIcon } from "./Icons";

type Props = {
  product: CartProductInput;
  locale: Locale | string;
  label: string;
  className?: string;
  qty?: number;
  businessName?: string;
  destinationUrl?: string;
  /** Element the flying thumbnail starts from (falls back to the button when it is off-screen). */
  flyFrom?: () => Element | null;
  /** Return false to cancel the add (e.g. invalid personalization field). */
  beforeAdd?: () => boolean;
  onAdded?: () => void;
  size?: "sm" | "md" | "lg";
  icon?: "bag" | "plus" | "none";
  ariaLabel?: string;
  disabled?: boolean;
};

type Ripple = { id: number; x: number; y: number; size: number };

function inViewport(el: Element | null | undefined): el is Element {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
}

export default function AddToCartButton({
  product,
  locale: rawLocale,
  label,
  className,
  qty = 1,
  businessName,
  destinationUrl,
  flyFrom,
  beforeAdd,
  onAdded,
  size = "md",
  icon = "bag",
  ariaLabel,
  disabled,
}: Props) {
  const locale = shopLocale(rawLocale);
  const t = getShopMessages(locale);
  const reduce = useReducedMotion();
  const ref = useRef<HTMLButtonElement>(null);
  const [added, setAdded] = useState(false);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [announce, setAnnounce] = useState("");
  const timer = useRef<number | undefined>(undefined);

  // magnetic pull
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 260, damping: 18, mass: 0.6 });
  const y = useSpring(my, { stiffness: 260, damping: 18, mass: 0.6 });
  const innerX = useTransform(x, (v) => v * 0.45);
  const innerY = useTransform(y, (v) => v * 0.45);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (reduce || e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const strength = size === "sm" ? 0.22 : 0.18;
    mx.set(Math.max(-14, Math.min(14, dx * strength)));
    my.set(Math.max(-10, Math.min(10, dy * strength * 1.4)));
  };
  const onLeave = () => {
    mx.set(0);
    my.set(0);
  };

  const onDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const sizePx = Math.max(r.width, r.height) * 2.2;
    const id = performance.now();
    setRipples((rs) => [...rs.slice(-3), { id, x: e.clientX - r.left, y: e.clientY - r.top, size: sizePx }]);
  };

  const onClick = () => {
    if (disabled) return;
    if (beforeAdd && !beforeAdd()) return;
    const name = localizedName(product, locale);
    const source = flyFrom?.();
    cart.add(
      {
        productId: product.id,
        slug: product.slug,
        name,
        image: resolveProductImage(product.image, product.slug, product.kind),
        unitPrice: product.price,
        qty: Math.max(1, Math.min(99, Math.round(qty))),
        businessName: businessName?.trim() || undefined,
        destinationUrl: destinationUrl?.trim() || undefined,
      },
      inViewport(source) ? source : ref.current,
    );
    // Haptic tick only after a real user gesture (Chrome logs an intervention for programmatic/synthetic clicks).
    if (typeof navigator !== "undefined" && "vibrate" in navigator && (navigator.userActivation?.hasBeenActive ?? true)) {
      try {
        navigator.vibrate(12);
      } catch {
        /* vibration unsupported */
      }
    }
    setAdded(true);
    setAnnounce(fmt(t.add.addedAria, { name }));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAdded(false), 1700);
    onAdded?.();
  };

  const sizes = {
    sm: "h-10 px-4 text-sm gap-1.5",
    md: "h-12 px-6 text-[15px] gap-2",
    lg: "h-14 px-8 text-base gap-2.5",
  }[size];
  const iconSize = size === "sm" ? 16 : 19;

  return (
    <>
      <motion.button
        ref={ref}
        type="button"
        onClick={onClick}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        onPointerDown={onDown}
        disabled={disabled}
        aria-label={ariaLabel}
        style={{ x, y }}
        whileTap={reduce ? undefined : { scale: 0.96 }}
        className={clsx(
          "group/atc relative isolate inline-flex select-none items-center justify-center overflow-hidden rounded-full font-semibold",
          "transition-[background-color,box-shadow,color] duration-500 ease-expo",
          "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-violet-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          added
            ? "bg-ok text-ink shadow-[0_12px_40px_-12px_rgba(43,212,138,0.75)]"
            : "bg-violet text-white shadow-[0_14px_44px_-14px_rgba(70,28,247,0.95),inset_0_1px_0_rgba(255,255,255,0.22)] hover:bg-[#5530ff]",
          sizes,
          className,
        )}
      >
        {/* sheen */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(255,255,255,0.22),transparent_60%)]"
        />
        {ripples.map((r) => (
          <motion.span
            key={r.id}
            aria-hidden="true"
            className="pointer-events-none absolute -z-10 rounded-full bg-white/35"
            style={{ left: r.x - r.size / 2, top: r.y - r.size / 2, width: r.size, height: r.size }}
            initial={{ scale: 0, opacity: 0.55 }}
            animate={{ scale: 1, opacity: 0 }}
            transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
            onAnimationComplete={() => setRipples((rs) => rs.filter((x2) => x2.id !== r.id))}
          />
        ))}
        <motion.span className="relative inline-flex items-center gap-[inherit]" style={{ x: innerX, y: innerY }}>
          <AnimatePresence mode="popLayout" initial={false}>
            {added ? (
              <motion.span
                key="added"
                className="inline-flex items-center gap-[inherit]"
                initial={reduce ? { opacity: 0 } : { y: 18, opacity: 0, filter: "blur(4px)" }}
                animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                exit={reduce ? { opacity: 0 } : { y: -18, opacity: 0, filter: "blur(4px)" }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              >
                <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" aria-hidden="true" fill="none">
                  <motion.path
                    d="m5 12.5 4.2 4.2L19 7"
                    stroke="currentColor"
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: reduce ? 1 : 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.4, delay: 0.08, ease: "easeOut" }}
                  />
                </svg>
                <span>{t.add.added}</span>
              </motion.span>
            ) : (
              <motion.span
                key="idle"
                className="inline-flex items-center gap-[inherit]"
                initial={reduce ? { opacity: 0 } : { y: 18, opacity: 0, filter: "blur(4px)" }}
                animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                exit={reduce ? { opacity: 0 } : { y: -18, opacity: 0, filter: "blur(4px)" }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              >
                {icon === "bag" && <BagIcon size={iconSize} />}
                {icon === "plus" && <PlusIcon size={iconSize} />}
                <span>{label}</span>
              </motion.span>
            )}
          </AnimatePresence>
        </motion.span>
      </motion.button>
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
    </>
  );
}
