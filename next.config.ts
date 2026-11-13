import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker: self-contained server in .next/standalone
  output: "standalone",
  // Classic caching model (Cache Components off) — pages that read the DB opt into dynamic rendering explicitly.
  cacheComponents: false,
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  images: { formats: ["image/avif", "image/webp"] },
  // One 404 document for URLs that match no route (the app has two root layouts: (site)/[locale] and (admin)).
  experimental: { globalNotFound: true },
  turbopack: {
    rules: {
      // Tailwind v4 for global stylesheets only. `as: "*.css"` re-types the output as plain global CSS, so it must not
      // touch *.module.css files: they would lose their CSS-module semantics (no hashed classes, `styles.x` undefined).
      "*.css": {
        condition: { not: { path: /\.module\.css$/ } },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
