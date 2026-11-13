// Client page typefaces: the brand fonts, only the three weights the page uses (~66 KB, preloaded, no layout shift).
import localFont from "next/font/local";

export const portalSans = localFont({
  src: [
    { path: "../../fonts/Satoshi-500.woff2", weight: "500", style: "normal" },
    { path: "../../fonts/Satoshi-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--pf-sans",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

export const portalDisplay = localFont({
  src: [{ path: "../../fonts/ClashDisplay-600.woff2", weight: "600", style: "normal" }],
  variable: "--pf-display",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

export const portalFontVariables = `${portalSans.variable} ${portalDisplay.variable}`;
