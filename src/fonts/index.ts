// Self-hosted brand typefaces (next/font/local → preloaded, hashed, no layout shift).
//  - Clash Display (Indian Type Foundry, Fontshare ITF FFL) — headlines
//  - Satoshi (Indian Type Foundry, Fontshare ITF FFL) — body / UI
//  - Instrument Serif (Instrument, SIL OFL) — italic accent words
import localFont from "next/font/local";

export const clash = localFont({
  src: [
    { path: "./ClashDisplay-400.woff2", weight: "400", style: "normal" },
    { path: "./ClashDisplay-500.woff2", weight: "500", style: "normal" },
    { path: "./ClashDisplay-600.woff2", weight: "600", style: "normal" },
    { path: "./ClashDisplay-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-clash",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

export const satoshi = localFont({
  src: [
    { path: "./Satoshi-400.woff2", weight: "400", style: "normal" },
    { path: "./Satoshi-500.woff2", weight: "500", style: "normal" },
    { path: "./Satoshi-700.woff2", weight: "700", style: "normal" },
    { path: "./Satoshi-900.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-satoshi",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

export const instrument = localFont({
  src: [
    { path: "./InstrumentSerif-400.woff2", weight: "400", style: "normal" },
    { path: "./InstrumentSerif-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-instrument",
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

/** Class string that defines the three CSS variables — put it on <html>. */
export const fontVariables = `${clash.variable} ${satoshi.variable} ${instrument.variable}`;
