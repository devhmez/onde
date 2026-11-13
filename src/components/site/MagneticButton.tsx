"use client";
// Magnetic CTA: the button leans toward the pointer (label leans further for depth), a fill blooms from the
// entry point, label rolls on hover, springs back elastically. Renders <Link> (internal href), <a> (external,
// tel:, mailto:, wa.me) or <button>. Touch / reduced motion: static, still fully styled & accessible.
import Link from "next/link";
import { useRef, type MouseEventHandler, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import clsx from "clsx";
import { gsap, isFinePointer, prefersReducedMotion } from "@/lib/motion";

export type MagneticVariant = "primary" | "light" | "ghost" | "outline" | "whatsapp";
export type MagneticSize = "sm" | "md" | "lg";

type Props = {
  children: ReactNode;
  href?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  variant?: MagneticVariant;
  size?: MagneticSize;
  className?: string;
  /** 0..1 — how far the button follows the pointer */
  strength?: number;
  icon?: ReactNode;
  iconPosition?: "start" | "end";
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  target?: string;
  rel?: string;
  prefetch?: boolean;
  "aria-label"?: string;
  "data-cursor"?: string;
};

const VARIANTS: Record<MagneticVariant, { base: string; fill: string; hoverText: string }> = {
  primary: {
    base: "bg-violet text-white shadow-[0_10px_40px_-10px_rgb(70_28_247/0.75)]",
    fill: "bg-violet-2",
    hoverText: "",
  },
  light: { base: "bg-text text-ink", fill: "bg-white", hoverText: "" },
  ghost: {
    base: "bg-white/[0.04] text-text ring-1 ring-inset ring-white/12 backdrop-blur-md",
    fill: "bg-white/[0.09]",
    hoverText: "",
  },
  outline: { base: "bg-transparent text-text ring-1 ring-inset ring-line", fill: "bg-text", hoverText: "group-hover:text-ink" },
  whatsapp: {
    base: "bg-[#1fae53] text-white shadow-[0_10px_40px_-12px_rgb(37_211_102/0.6)]",
    fill: "bg-whatsapp",
    hoverText: "",
  },
};

const SIZES: Record<MagneticSize, string> = {
  sm: "h-10 px-4 text-sm gap-2",
  md: "h-12 px-6 text-[0.95rem] gap-2.5",
  lg: "h-14 px-7 text-base md:h-16 md:px-9 md:text-[1.05rem] gap-3",
};

function isExternal(href: string) {
  return /^(https?:|mailto:|tel:|sms:|\/\/)/.test(href);
}

export default function MagneticButton({
  children,
  href,
  onClick,
  variant = "primary",
  size = "md",
  className,
  strength = 0.35,
  icon,
  iconPosition = "end",
  type = "button",
  disabled,
  target,
  rel,
  prefetch,
  "aria-label": ariaLabel,
  "data-cursor": dataCursor,
}: Props) {
  const rootRef = useRef<HTMLElement | null>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const v = VARIANTS[variant];

  const active = () => typeof window !== "undefined" && isFinePointer() && !prefersReducedMotion();

  const onMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse" || !active() || disabled) return;
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    gsap.to(el, { x: dx * strength, y: dy * strength, duration: 0.6, ease: "power3.out", overwrite: "auto" });
    if (labelRef.current)
      gsap.to(labelRef.current, { x: dx * strength * 0.45, y: dy * strength * 0.45, duration: 0.6, ease: "power3.out", overwrite: "auto" });
  };

  const onEnter = (e: ReactPointerEvent<HTMLElement>) => {
    if (!active() || disabled) return;
    const el = rootRef.current;
    const fill = fillRef.current;
    if (!el || !fill) return;
    const r = el.getBoundingClientRect();
    const size = Math.hypot(r.width, r.height) * 2.1;
    gsap.set(fill, { width: size, height: size, left: e.clientX - r.left, top: e.clientY - r.top, xPercent: -50, yPercent: -50 });
    gsap.fromTo(fill, { scale: 0 }, { scale: 1, duration: 0.7, ease: "onde.expo", overwrite: "auto" });
  };

  const onLeave = (e: ReactPointerEvent<HTMLElement>) => {
    const el = rootRef.current;
    if (!el) return;
    gsap.to([el, labelRef.current], { x: 0, y: 0, duration: 1.1, ease: "elastic.out(1, 0.35)", overwrite: "auto" });
    const fill = fillRef.current;
    if (fill && active()) {
      const r = el.getBoundingClientRect();
      gsap.to(fill, {
        left: e.clientX - r.left,
        top: e.clientY - r.top,
        scale: 0,
        duration: 0.55,
        ease: "power3.inOut",
        overwrite: "auto",
      });
    }
  };

  const cls = clsx(
    "group relative isolate inline-flex select-none items-center justify-center overflow-hidden rounded-full font-semibold tracking-[-0.01em] whitespace-nowrap",
    "transition-[box-shadow,opacity] duration-300 will-change-transform focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-2",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    v.base,
    SIZES[size],
    className,
  );

  const inner = (
    <>
      <span
        ref={fillRef}
        aria-hidden="true"
        className={clsx("pointer-events-none absolute -z-10 rounded-full", v.fill)}
        style={{ transform: "scale(0)" }}
      />
      <span ref={labelRef} className={clsx("relative inline-flex items-center gap-[inherit] transition-colors duration-300", v.hoverText)}>
        {icon && iconPosition === "start" && <span className="inline-flex shrink-0">{icon}</span>}
        <span className="roll">
          <span>{children}</span>
          <span aria-hidden="true">{children}</span>
        </span>
        {icon && iconPosition === "end" && (
          <span className="inline-flex shrink-0 transition-transform duration-500 ease-expo group-hover:translate-x-0.5">
            {icon}
          </span>
        )}
      </span>
    </>
  );

  const shared = {
    className: cls,
    onPointerMove: onMove,
    onPointerEnter: onEnter,
    onPointerLeave: onLeave,
    "data-magnetic": "",
    "aria-label": ariaLabel,
    "data-cursor": dataCursor,
  };

  if (href) {
    if (isExternal(href)) {
      const ext = /^https?:|^\/\//.test(href);
      return (
        <a
          ref={(n) => {
            rootRef.current = n;
          }}
          href={href}
          target={target ?? (ext ? "_blank" : undefined)}
          rel={rel ?? (ext ? "noopener noreferrer" : undefined)}
          onClick={onClick}
          aria-disabled={disabled || undefined}
          {...shared}
        >
          {inner}
        </a>
      );
    }
    return (
      <Link
        ref={(n) => {
          rootRef.current = n;
        }}
        href={href}
        prefetch={prefetch}
        target={target}
        rel={rel}
        onClick={onClick}
        aria-disabled={disabled || undefined}
        {...shared}
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      ref={(n) => {
        rootRef.current = n;
      }}
      type={type}
      disabled={disabled}
      onClick={onClick}
      {...shared}
    >
      {inner}
    </button>
  );
}
