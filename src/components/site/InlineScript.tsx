"use client";
// Inline script that runs synchronously during HTML parsing (before first paint) on hard loads.
// Pattern from node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md:
// the server emits an executable script; the client renders it inert (no dev warning, no re-run).

export default function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

