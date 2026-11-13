# ONDE

The storefront, smart-link platform and back office behind [onde.tn](https://onde.tn): NFC review stands, cards,
keychains and stickers that send a customer to a business's Google review page with one tap.

![An ONDE review stand](public/og.jpg)

## What it does

ONDE sells NFC products to cafés, restaurants, salons and shops in Tunisia. Each product carries a permanent link,
`onde.tn/t/CODE`, written to its chip once. The server decides where that link leads, so the destination can change
at any time without touching the chip.

- **Public site (French and English):** animated home page with a real-time 3D product scene, shop, product pages
  with a 3D viewer, cart, checkout (cash on delivery, or the same order sent over WhatsApp), order status page,
  two long-form guides, a restaurants landing page and the legal pages.
- **Smart links:** `/t/CODE` redirects to the tag's current destination (Google review, Instagram, menu, website,
  WhatsApp, contact) and records the tap, split by NFC vs QR and by device.
- **Admin dashboard** (`/admin`): orders, customers, every smart link and its destination history, tap and traffic
  analytics, catalog and prices, settings, CSV exports, QR codes and print-ready files. It installs as a Home Screen
  app and receives new-order alerts by Web Push.
- **Client page** (`/c/<token>`): a private link a customer opens to see taps on their products and change where
  they lead, either instantly or subject to the owner's approval.

## Engineering highlights

- **A redirect that never waits on analytics.** `src/app/t/[code]/route.ts` always answers `302` with `no-store`
  (never `301`, because destinations change) and logs the tap in `after()`, once the response is sent. A second read
  of the same chip within five seconds is collapsed. Codes use a 25-character alphabet with no look-alikes
  (`0/O`, `1/I/L`, `2/Z`, `5/S`, `8/B`).
- **One pricing function, authoritative on the server.** Money is stored as integer millimes. `priceOrder()` in
  `src/lib/business.ts` drives the live cart total in the browser and the server's own calculation; the server
  re-prices every order from the database inside a single transaction and never trusts a client price. The one-time
  returning-customer discount is granted on delivery, consumed on the next order and restored if that order is
  cancelled.
- **Single-owner auth that fails closed.** Credentials come from the environment (bcrypt hash), sessions are HS256
  JWTs in an httpOnly cookie, and each token embeds a fingerprint of the password hash, so changing the password
  logs every device out. Without a `SESSION_SECRET` of 32+ characters, production disables the admin instead of
  falling back to a default. The proxy gates `/admin` and `/api/admin`, and every server action and route handler
  checks the session again. Login compares against a dummy hash on a wrong email and is rate-limited per IP.
- **Capability links for clients.** A client page is opened by a 192-bit random token and nothing else. Responses
  are `no-referrer`, `noindex` and uncached; unknown, disabled and regenerated tokens all get the same answer. Each
  change re-checks the token, the product's owner and its status, counts against a rolling daily limit, and in
  approval mode a partial unique index guarantees one pending request per product.
- **Web Push without a third-party service.** `src/server/push.ts` generates the VAPID key pair once and keeps it
  in SQLite, only accepts subscriptions whose endpoint belongs to a real push service (an SSRF guard applied on save
  and on send), and builds each notification for the origin the device subscribed from.
- **Print files generated on the server.** For every stand the server finds the empty QR box in the print design by
  scanning its pixels, draws the QR on whole-pixel modules, and exports PNG and PDF at 12 x 12 cm. The PDF writer
  (`export-pdf.ts`) and the streaming ZIP writer (`export-zip.ts`) are written by hand, so a pack of print files
  streams to the browser while the next file renders.

Also worth a look: `src/components/three/device.ts` sorts devices into three GPU tiers without a network benchmark
(full scene, lighter scene, or video and still fallbacks) and `warmup.ts` links shader programs in the background
before the first frame; `src/i18n/contracts.ts` makes a missing translation key a TypeScript error;
`src/server/retention.ts` anonymizes customers three years after their last order while keeping order totals;
page-view and tap analytics use a daily-salted hash instead of cookies.

## Tech stack

- **Framework:** Next.js 16 (App Router, standalone output), React 19, TypeScript (strict)
- **Data:** SQLite through better-sqlite3 and Drizzle ORM, SQL migrations in `drizzle/`, WAL mode
- **Validation and auth:** zod, jose, bcryptjs
- **UI and motion:** Tailwind CSS v4, GSAP, Lenis, Motion
- **3D:** three.js, React Three Fiber, drei, postprocessing
- **Other:** web-push, qrcode
- **Deployment:** Docker (multi-stage, non-root), Docker Compose, Caddy

## Project structure

```
src/app/(site)/[locale]/   public site: home, shop, checkout, order, guides, legal
src/app/(admin)/admin/     dashboard pages and server actions
src/app/(portal)/c/        client page
src/app/t/[code]/          smart-link redirect
src/app/api/               public JSON API (orders, products, tracking) and admin API
src/server/                data layer: orders, tags, customers, stats, push, portal, exports
src/lib/                   business rules, auth, rate limiting
src/db/                    schema, connection, migrations runner, catalog seed
src/components/            site, shop, three (3D), admin, portal
src/proxy.ts               admin gate, admin host, locale routing
messages/{fr,en}/          translations, type-checked against each other
drizzle/                   generated SQL migrations
docs/                      deployment, NFC chips, notifications and SEO notes
```

## Getting started

Requires Node.js 22 (the version used by the Docker image).

Two of the three typefaces are not redistributable and are not in this repository; add them first as described in
[`src/fonts/README.md`](src/fonts/README.md).

```bash
npm install
npm run dev          # http://localhost:3000
```

The SQLite database is created at `./data/onde.db` on first start; migrations and the product catalog seed run
automatically. To sign in at `/admin/login`, put these in `.env.local`:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD_HASH`, generated with `node scripts/hash-password.mjs`
- `SESSION_SECRET`, at least 32 characters

Optional variables: `DATABASE_PATH`, `PUBLIC_BASE_URL`, `ADMIN_HOST`, `COOKIE_SECURE`, `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION`, `INDEXNOW_KEY`.

```bash
node scripts/seed-demo.mjs     # fictional customers, orders and taps for the dashboard (--clean removes them)
npm run lint
npm run build                  # production build (standalone output, the one the Docker image runs)
npx drizzle-kit generate       # after editing src/db/schema.ts
docker compose up -d --build   # app + Caddy; reads .env, see docs/DEPLOY.md
```

## Status

Live in production at [onde.tn](https://onde.tn) since October 2026, self-hosted on a single VPS. ONDE is my own
product, not client work. Payment is cash on delivery; online payment is not implemented. There is no automated
test suite in this repository.

Built by [Hamza Dellai](https://github.com/devhmez).
