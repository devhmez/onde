// Root layout of the super-admin (separate <html> from the public site). English-only, Inter, dark #0B0A10.
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import "./admin.css";
import "./push.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "ONDE Admin", template: "%s · ONDE Admin" },
  description: "ONDE super-admin — every chip, every link, one place.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "same-origin",
  // Installable as its own Home Screen app ("ONDE Admin", scope /admin) — required for notifications on iPhone.
  manifest: "/admin.webmanifest",
  icons: { apple: "/admin-icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "ONDE Admin", statusBarStyle: "black" },
};

export const viewport: Viewport = {
  themeColor: "#0B0A10",
  colorScheme: "dark",
};

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
