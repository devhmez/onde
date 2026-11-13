// The brand typefaces again, for the global 404 only (src/app/global-not-found.tsx) — with preload: false.
// global-not-found is bundled with every route, so the fonts its module declares are listed for every route in
// next-font-manifest.json: with the preloading instances of ./index.ts, every page (client page, admin, site) would
// preload all ten files. Here nothing is preloaded; the 404 page downloads only the faces it actually renders
// (display: swap). The public site keeps its own preloaded instances (src/app/(site)/[locale]/layout.tsx → ./index.ts).
import localFont from "next/font/local";

const clash404 = localFont({
  src: [
    { path: "./ClashDisplay-400.woff2", weight: "400", style: "normal" },
    { path: "./ClashDisplay-500.woff2", weight: "500", style: "normal" },
    { path: "./ClashDisplay-600.woff2", weight: "600", style: "normal" },
    { path: "./ClashDisplay-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-clash",
  display: "swap",
  preload: false,
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

const satoshi404 = localFont({
  src: [
    { path: "./Satoshi-400.woff2", weight: "400", style: "normal" },
    { path: "./Satoshi-500.woff2", weight: "500", style: "normal" },
    { path: "./Satoshi-700.woff2", weight: "700", style: "normal" },
    { path: "./Satoshi-900.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-satoshi",
  display: "swap",
  preload: false,
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

const instrument404 = localFont({
  src: [
    { path: "./InstrumentSerif-400.woff2", weight: "400", style: "normal" },
    { path: "./InstrumentSerif-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-instrument",
  display: "swap",
  preload: false,
  fallback: ["Georgia", "Times New Roman", "serif"],
});

/** Same three CSS variables as ./index.ts `fontVariables` — put it on the 404's <html>. */
export const notFoundFontVariables = `${clash404.variable} ${satoshi404.variable} ${instrument404.variable}`;
