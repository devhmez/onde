// Inline text with links written as [label](/path) (internal, locale-prefixed) or [label](https://…) (new tab).
// Server component: plain <a>/<Link>, no client JS.
import { Fragment } from "react";
import Link from "next/link";
import type { Locale } from "@/i18n/config";

const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g;

export const LINK_CLASS =
  "font-medium text-violet-3 underline decoration-violet-3/40 underline-offset-4 transition-colors hover:text-white hover:decoration-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-2";

/** Localize an internal path ("/shop" → "/fr/shop"); external URLs are returned as is. */
export function localHref(locale: Locale, href: string): string {
  return href.startsWith("/") ? `/${locale}${href}` : href;
}

/** The same text without link markup (for meta tags and structured data). */
export function plainText(text: string): string {
  return text.replace(LINK_RE, "$1");
}

export default function RichText({ text, locale, newTab }: { text: string; locale: Locale; newTab: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK_RE)) {
    const [whole, label, href] = m;
    const at = m.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    if (href.startsWith("/")) {
      parts.push(
        <Link key={at} href={localHref(locale, href)} className={LINK_CLASS}>
          {label}
        </Link>,
      );
    } else if (/^https:\/\//.test(href)) {
      parts.push(
        <a key={at} href={href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
          {label}
          <span className="sr-only"> {newTab}</span>
        </a>,
      );
    } else {
      parts.push(label);
    }
    last = at + whole.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>{p}</Fragment>
      ))}
    </>
  );
}
