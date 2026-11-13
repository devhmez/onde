"use client";
// Privacy-friendly page-view beacon: POST /api/track { path, locale, referrer } on every pathname change.
// No cookies, no identifiers. Failures are ignored (never affects the page).
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export default function PageViewTracker({ locale }: { locale: string }) {
  const pathname = usePathname();
  const prev = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || prev.current === pathname) return;
    const referrer = prev.current ? window.location.origin + prev.current : document.referrer || "";
    prev.current = pathname;
    const body = JSON.stringify({ path: pathname, locale, referrer });
    try {
      void fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
        credentials: "omit",
      }).catch(() => undefined);
    } catch {
      /* ignore */
    }
  }, [pathname, locale]);

  return null;
}
