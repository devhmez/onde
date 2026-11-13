"use client";
// "Commander sur WhatsApp" — opens wa.me/<settings.whatsapp> with a clean multi-line order message
// (items × qty with line totals, subtotal, discount, delivery, total, customer fields when filled).
import clsx from "clsx";
import type { MouseEvent } from "react";
import { useCart } from "@/lib/cart";
import type { Locale } from "@/i18n/config";
import { getShopMessages, shopLocale } from "./messages";
import type { ShopSettings } from "./rules";
import { useShopSettings } from "./useShopSettings";
import { buildOrderMessage, waHref, type WaCustomer, type WaLine } from "./whatsapp";
import { WhatsAppIcon } from "./Icons";

type Props = {
  locale: Locale | string;
  /** Lines to order; defaults to the current cart. */
  items?: WaLine[];
  customer?: WaCustomer;
  returningDiscount?: boolean;
  /** Overrides the returning-discount % (e.g. the value returned by /api/discount). */
  discountPct?: number;
  /** Free-form message instead of an order (questions, follow-ups). */
  message?: string;
  label?: string;
  variant?: "outline" | "solid";
  settings?: ShopSettings | null;
  className?: string;
  /** Call e.preventDefault() to handle the click yourself (e.g. record the order first). */
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  /** Shows a spinner + this label while an async click handler runs. */
  busyLabel?: string | null;
};

export default function WhatsAppOrderButton({
  locale: rawLocale,
  items,
  customer,
  returningDiscount,
  discountPct,
  message,
  label,
  variant = "outline",
  settings: initialSettings,
  className,
  onClick,
  busyLabel,
}: Props) {
  const locale = shopLocale(rawLocale);
  const t = getShopMessages(locale);
  const settings = useShopSettings(initialSettings);
  const { items: cartItems } = useCart();
  const lines = items ?? cartItems;

  const rules =
    typeof discountPct === "number" ? { ...settings.rules, returningDiscountPct: discountPct } : settings.rules;
  const text =
    message ??
    (lines.length
      ? buildOrderMessage({ lines, locale, rules, t: t.whatsapp, returningDiscount, customer })
      : t.whatsapp.inquiry);
  const text2 = label ?? t.product.orderWhatsapp;

  return (
    <a
      href={waHref(settings.whatsapp, text)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      aria-label={`${busyLabel ?? text2} ${t.whatsapp.newTab}`}
      aria-busy={busyLabel ? true : undefined}
      className={clsx(
        "group/wa relative inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-full px-6 font-semibold",
        "transition-[background-color,border-color,transform] duration-300 ease-expo active:scale-[0.98]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366]",
        variant === "solid"
          ? "bg-[#25D366] text-[#05210f] shadow-[0_14px_40px_-16px_rgba(37,211,102,0.8)] hover:bg-[#2fe072]"
          : "border border-[#25D366]/35 bg-[#25D366]/[0.07] text-text hover:border-[#25D366]/60 hover:bg-[#25D366]/[0.14]",
        className ?? "h-12",
      )}
    >
      {busyLabel ? (
        <span aria-hidden="true" className="size-5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent" />
      ) : (
        <WhatsAppIcon
          size={20}
          className={clsx(
            "shrink-0 transition-transform duration-500 ease-expo group-hover/wa:-rotate-12 group-hover/wa:scale-110",
            variant === "solid" ? "text-[#05210f]" : "text-[#25D366]",
          )}
        />
      )}
      <span>{busyLabel ?? text2}</span>
    </a>
  );
}
