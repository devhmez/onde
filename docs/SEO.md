# ONDE — SEO: what is in place, the keyword map, and the owner checklist

Last update: 2026-10-14 (branch `feat/seo`).

## Why "onde" finds nothing on Google yet

onde.tn went live on 2026-10-13. Google has not crawled it yet. The site itself does not block indexing (audit of
the live build: every public page answers 200, is crawlable and canonical, and is listed in the sitemap). What is
missing is discovery and trust:

1. **Search Console + sitemap**: tells Google the site exists. The first pages usually appear within a few days to
   two weeks.
2. **A Google Business Profile for ONDE and links from other sites**: tell Google that "ONDE" is a brand and not
   only the French word for "wave". Results like "onde de choc" will always rank for the word alone. The realistic
   targets are **"onde.tn", "ONDE NFC", "ONDE avis Google", "ONDE Tunisie"** and the product searches below.

Everything that can be done in code is done in this branch. The rest is in the [owner checklist](#owner-checklist).

## What was done in the code

| Area | Change | Where |
|---|---|---|
| Brand entity | One `Organization` + `WebSite` JSON-LD graph on every page: name **ONDE**, alternate names `onde.tn` / `ONDE Tunisie` / `ONDE NFC`, square logo on a solid background (`/brand/onde-logo-512.png`), `sameAs` Instagram / TikTok / Facebook (admin settings, official profiles as fallback), phone, email, contact points, country TN. Every other block points to it by `@id`. | `src/components/pages/seo.ts` (`siteGraph`), `src/app/(site)/[locale]/layout.tsx` |
| Site name | `WebSite.name = "ONDE"` with alternate names, so Google can show "ONDE" as the site name. Every title ends with `\| ONDE`, except the home page, which leads with the brand (`ONDE · Plaque & présentoir avis Google NFC en Tunisie`) for brand searches ("onde tunisie", "onde nfc"): "onde" alone is a common French word. | same |
| Titles, descriptions, H1 | Rewritten per page in FR and EN from the keyword map below. Each H1 now starts with a small visible label that says what the page is about ("Plaques & présentoirs avis Google NFC · Tunisie", "Plaque avis Google NFC · 12 × 12 cm"…), followed by the existing headline. The design is unchanged. | `messages/{fr,en}/{home,shop,about,contact,legal,seo}.json`, `Hero.tsx`, `SplitHeading.tsx` (`kicker`), `AboutHero.tsx`, `ContactView.tsx` |
| Product pages | Per-product title, description, H1 label and an intro paragraph (`messages/*/seo.json → products[slug]`, generic template for products added later). `Product` + `Offer` JSON-LD: price in TND, strikethrough price + `priceValidUntil` only while a real sale runs, availability, seller, shipping to Tunisia (fee or free from the threshold in settings, 0–1 day handling + 1–2 days transit), return policy (10 days, as in the terms of sale), category, colour. **No `aggregateRating` or `review`**: add them only once real reviews exist on the site. `BreadcrumbList` (Accueil › Boutique › product) matching the visible breadcrumb. Share image = the product still. | `src/app/(site)/[locale]/shop/[slug]/page.tsx` |
| Shop | Visible buying FAQ (prices from the live catalog, no subscription, which product to choose, nothing to program, QR fallback…), `FAQPage` + `ItemList` + `BreadcrumbList`. | `shop/page.tsx`, `messages/*/seo.json → shop` |
| Home | FAQ extended (what an NFC Google review plaque is, how to find the review link, how to get more reviews) with links to the guides; `FAQPage` mirrors the visible list. Description includes the live "from" price. | `page.tsx`, `messages/*/home.json` |
| FAQ markup | Every FAQ answer is now in the server HTML (closed answers used to be missing from the product-page HTML). | `src/components/shop/Faq.tsx`, `src/components/site/home/FaqList.tsx` |
| New pages (FR + EN) | `/guides/google-review-link`, `/guides/get-more-google-reviews`, `/restaurants`: helpful long-form pages (steps, Google's own rules, the 68 % BrightLocal stat only, live product tiles, FAQ, CTA to the shop and WhatsApp). `Article` (guides), `BreadcrumbList`, `FAQPage`, own 1200 × 630 share images in `public/og/`. `/restaurants` is a landing page, not an article: no date / reading time / byline, an offer line with live catalog prices (cheapest stand, Café Pack) and two buttons right under the highlights (Pack Café, WhatsApp with a prefilled message). Linked from the footer ("Guides"), the home and shop FAQs, every product page ("Guides pratiques") and the review-link helper of the buy box. | `src/app/(site)/[locale]/guides/*`, `restaurants/`, `src/components/pages/guides/*`, `messages/*/guides.json` |
| About / Contact | `AboutPage` + breadcrumb, film `VideoObject` published by the ONDE organization; `ContactPage` points to the organization. "ONDE (onde.tn) est une startup tunisienne…" is visible on About and in the footer of every page. | `about/page.tsx`, `contact/page.tsx`, `messages/*/{about,common}.json` |
| Sitemap | All 34 indexable URLs (17 per language: home, shop, 7 products, 3 guide pages, about, contact, 3 legal pages) with `lastmod`, hreflang (fr / en / x-default) and images. Checkout, order, inactive and 404 are left out on purpose (noindex). | `src/app/sitemap.ts` |
| robots.txt | Per host: `onde.tn` allows everything public and blocks `/admin`, `/api`, `/t/`, `/c/`; **`admin.onde.tn` disallows everything** (Caddy also sends `X-Robots-Tag: noindex` there). | `src/app/robots.ts` |
| Real 404s | `[locale]/loading.tsx` removed: unknown products and orders now answer **HTTP 404** (they were "soft 404s" with status 200), and the page content comes before the footer in the HTML for crawlers that do not run JavaScript. `/fr/legal` → terms is now a permanent 308. Because `notFound()` is thrown before anything has streamed, Next 16 answers with its error shell (`<html id="__next_error__">`) and the in-site 404 scene renders on the client; that response carries the localized 404 title from `[locale]/not-found.tsx` (`generateMetadata`). Fine for SEO (404 + noindex). | `[locale]/not-found.tsx` |
| Core Web Vitals | The hero stand and the product still are the LCP images: they no longer fade in from opacity 0 (transform-only entrance), so they count as painted as soon as they load. The guide and landing pages (`/guides/*`, `/restaurants`), where people arrive from a search, skip the brand intro like `/inactive`, and their H1 (the LCP element) uses `CharRise paint="visible"`: letters are opaque from the first frame (blur + rise only) instead of fading in one by one, so LCP = FCP (lab, mobile 4× CPU / 1.6 Mbps: ~1.6 s, was 3.8–4.9 s). The shop poster is one eager, high-priority `<picture>`. | `globals.css` (`.hero-zoom`), `Hero.tsx`, `shop/[slug]/page.tsx`, `boot-script.ts`, `pages/motion.tsx` + `PagesStyles.tsx` (`.op-char-v`), `CinematicBackdrop.tsx` |
| Images | Product cards carry the product name as `alt` (the duplicate link stays hidden from screen readers). | `ProductCard.tsx` |
| Verification hooks | `GOOGLE_SITE_VERIFICATION` / `BING_SITE_VERIFICATION` env vars → `<meta name="google-site-verification">` / `<meta name="msvalidate.01">`. Nothing is committed. Only needed for the "HTML tag" method; a DNS TXT record works without them. | `layout.tsx`, `docs/DEPLOY.md` |
| IndexNow | Key file `public/4093828be7d10d67f7e6c762d679875b.txt` + `scripts/indexnow.mjs` (see below). | — |

### Rich results to expect (and not expect)

- **Site name "ONDE" + logo**: from `WebSite` and `Organization`. Google decides when to show them.
- **Product snippets / merchant listings**: price, shipping and returns can appear on product results.
- **Breadcrumbs** instead of raw URLs.
- **FAQ**: since 2023 Google shows FAQ rich results only for government and health sites. The `FAQPage` markup stays
  because Bing and AI answers use it, and the visible FAQs answer real searches.
- **HowTo**: retired by Google, so it is not used.

## Keyword map

Method and limits: Tunisian Google Autocomplete (`gl=tn`, fr/en/ar) plus a review of the pages that rank today. There
were no search volumes, so priorities are qualitative. Re-rank after 2–4 weeks of Search Console data.

| Cluster (intent) | Main searches | Page | Priority |
|---|---|---|---|
| Core product (buy) | plaque avis google (nfc), plaque nfc avis google tunisie, plaque avis google tunisie / prix, présentoir avis google (nfc), support / chevalet nfc avis google, avis google nfc, carte avis google tunisie | Home (category head term), `/shop/stand-white` (main product page: "plaque avis Google NFC", price), `/shop` | High |
| Black variant | présentoir avis google noir, plaque avis google bar / lounge / restaurant | `/shop/stand-black` (own title, so the two stand pages don't compete) | Medium |
| Review link + QR (how-to) | lien avis google (my business / direct), obtenir / trouver / créer lien avis google, qr code avis google (gratuit / restaurant), google review link / qr code | `/guides/google-review-link` | High |
| More reviews (how-to) | comment avoir / obtenir plus d'avis google, demander un avis google à un client, booster avis google, pourquoi les avis google sont importants, apparaître sur google maps; how to get more google reviews | `/guides/get-more-google-reviews` | Medium |
| NFC cards | carte nfc tunisie (prix), carte de visite nfc (tunisie / prix), carte de visite digitale / connectée, carte nfc avis google / instagram / restaurant; nfc business card | `/shop/card`, `/shop/pack-team` | High |
| Brand | onde.tn, ONDE NFC, ONDE avis Google, ONDE Tunisie | Home, About, Contact + the site-wide Organization | High |
| Restaurants & cafés | plaque avis google restaurant, qr code avis google restaurant, carte avis google restaurant, plaque qr code table; menu only as a destination (not "menu qr code tunisie") | `/restaurants`, `/shop/pack-cafe` | Medium |
| Stickers, keychains, social | sticker nfc (avis google / instagram / tunisie), autocollant avis google nfc, porte clé nfc (tunisie / personnalisé), plaque nfc instagram / whatsapp / tiktok | `/shop/sticker` ("not a blank tag"), `/shop/keychain` | Medium |
| English / NFC how-to | nfc card tunisia, google review stand / nfc review stand, tap to review card; nfc c'est quoi, comment fonctionne une carte nfc | EN twins of every page; product FAQs and the "QR code or NFC?" section | Low |

Rules kept everywhere: "plaque avis Google" is used where it is the accurate generic term (title + one mention), always
with the local facts competitors lack (prices in DT, delivery in 3 days anywhere in Tunisia, cash on delivery, no
subscription). No keyword stuffing, no hidden text, no invented statistics (only BrightLocal's 68 %), no fake reviews
or ratings, and nothing that suggests buying or incentivising reviews.

### Page titles (FR · EN)

| Page | FR title | EN title |
|---|---|---|
| Home | ONDE · Plaque & présentoir avis Google NFC en Tunisie | ONDE · Google Review NFC Stands & Cards in Tunisia |
| Shop | Boutique : présentoirs avis Google & cartes NFC \| ONDE | Shop: Google Review Stands & NFC Cards \| ONDE |
| Stand white | Plaque avis Google NFC – Présentoir blanc 12×12 \| ONDE | Google Review NFC Stand – White, 12×12 cm \| ONDE |
| Stand black | Présentoir avis Google NFC noir – Bars & lounges \| ONDE | Black Google Review NFC Stand for Bars & Lounges \| ONDE |
| Card | Carte NFC avis Google & carte de visite NFC \| ONDE | NFC Business Card & Google Review Card \| ONDE |
| Keychain | Porte-clés NFC : avis Google, Instagram, WhatsApp \| ONDE | NFC Keychain for Google Reviews, Instagram & WhatsApp \| ONDE |
| Sticker | Sticker NFC avis Google, menu ou Instagram \| ONDE | NFC Sticker for Google Reviews, Menus & Instagram \| ONDE |
| Café Pack | Pack Café : 2 présentoirs avis Google + 4 stickers \| ONDE | Café Pack: 2 Google Review Stands + 4 NFC Stickers \| ONDE |
| Team Pack | Pack Équipe : 5 cartes NFC avis Google \| ONDE | Team Pack: 5 NFC Google Review Cards \| ONDE |
| Guide 1 | Trouver son lien d'avis Google (+ QR code gratuit) \| ONDE | How to Find Your Google Review Link (+ Free QR Code) \| ONDE |
| Guide 2 | Comment obtenir plus d'avis Google : 7 méthodes \| ONDE | How to Get More Google Reviews: 7 Simple Methods \| ONDE |
| Restaurants | Plaque avis Google restaurant & café en Tunisie \| ONDE | Restaurant & Café Google Review Stands in Tunisia \| ONDE |
| About | À propos d'ONDE, startup tunisienne · Le film \| ONDE | About ONDE, a Tunisian startup · The film \| ONDE |
| Contact | Contact : WhatsApp, téléphone, commandes pro \| ONDE | Contact: WhatsApp, phone, business orders \| ONDE |

## Owner checklist

In order of impact. Each step takes 5–20 minutes.

1. **Google Search Console** (being set up separately)
   - Add a **Domain** property `onde.tn` and verify it with the DNS TXT record at OVHcloud. To use the "HTML tag"
     method instead, put the token in `.env` as `GOOGLE_SITE_VERIFICATION=…`, then redeploy.
   - Sitemaps → submit `https://onde.tn/sitemap.xml`.
   - URL inspection → "Request indexing" for `https://onde.tn/fr`, `/en`, `/fr/shop`, `/fr/shop/stand-white`,
     `/fr/guides/google-review-link`, `/fr/restaurants` (a few per day).
   - After 2–4 weeks: Performance → Queries. Re-rank the keyword map with real impressions.
2. **Google Business Profile for ONDE itself.** This is the strongest brand signal, and it is separate from Search Console.
   - business.google.com → add "ONDE". Set it up as a **service-area business** (deliveries everywhere in
     Tunisia, address hidden). Pick the closest category Google offers for a store or supplier of signs / marketing
     products, and choose the one that really fits.
   - Website `https://onde.tn`, phone `+216 25 875 529`, short description using the same words as the site
     ("présentoirs, cartes et stickers NFC pour recevoir des avis Google, livrés partout en Tunisie"), real product
     photos, opening hours.
   - Once verified, ask your first real customers for a review with its own review link. ONDE is a reviews brand,
     so this one matters. Never offer anything in exchange.
3. **Bing Webmaster Tools** (also feeds DuckDuckGo, Yahoo, ChatGPT search, Copilot)
   - Sign in at bing.com/webmasters → "Import from Google Search Console" (fastest), or add the site and verify by DNS
     or with `BING_SITE_VERIFICATION=…` in `.env`.
   - Submit the sitemap, then run IndexNow (below) after each deploy that adds pages.
4. **Social profiles** (Instagram, TikTok, Facebook, WhatsApp Business)
   - Display name "ONDE · onde.tn", link in bio `https://onde.tn` (or a page such as `/fr/shop`), same phone and email
     everywhere: `+216 25 875 529`, `contact@onde.tn`.
   - Keep the three profile URLs filled in admin → Settings: they go into the `sameAs` of the structured data.
5. **First backlinks** (quality over quantity, never bought link packages)
   - Tunisian business directories with a real listing (company name, onde.tn, phone, category). For example
     Pages Jaunes Tunisie and the other annuaires d'entreprises tunisiens you trust.
   - Startup ecosystem: incubators or programmes you are part of, and the Startup Act label page if ONDE gets it.
   - Partners: point-of-sale and payment-terminal resellers, web or social-media agencies, accountants, menu-platform
     providers, printers. Offer them a short "partner" mention and ask for a link to onde.tn.
   - Customers: some venues have a website. A short "NFC reviews by ONDE (onde.tn)" credit is natural and helps a lot.
   - Local press and blogs about Tunisian startups, restaurants and commerce. A launch story with the film is a
     good angle.
6. **IndexNow** (Bing, Yandex, Seznam, Naver…; Google does not use it). Run it on the Mac, in the project folder
   (Node 18+, no dependencies); the script is not part of the Docker image.
   ```bash
   node scripts/indexnow.mjs --dry-run      # shows the URLs from https://onde.tn/sitemap.xml
   node scripts/indexnow.mjs                # submits them (after the deploy, once the key file is live)
   node scripts/indexnow.mjs https://onde.tn/fr/restaurants https://onde.tn/en/restaurants   # only some URLs
   ```
   Check first that `https://onde.tn/4093828be7d10d67f7e6c762d679875b.txt` answers the key. Only resubmit pages that
   changed.

## Maintenance rules

- **Product SEO copy** lives in `messages/{fr,en}/seo.json → products[slug]` (`{price}` = live price). A new
  product in admin works without it (generic title template). Write its entry when it should rank.
- **Guide content** lives in `messages/{fr,en}/guides.json`. Inline links are written `[label](/path)`, which becomes
  `/fr/path` or `/en/path`. When a page's copy changes, bump `modified` in `src/components/pages/guides/registry.ts`
  (sitemap `lastmod`, `dateModified`, the "Mis à jour le" line). For the other pages, bump `CONTENT_UPDATED` in
  `src/app/sitemap.ts`.
- **FAQ markup must match the visible FAQ**: the `FAQPage` blocks are built from the same arrays as the lists, so edit
  the JSON, never the markup.
- **Return policy in `Product` JSON-LD** (10 days, return costs paid by the customer for a withdrawal) mirrors the terms
  of sale. Change both together (`shop/[slug]/page.tsx`, `productLd`).
- **Reviews and ratings**: no `aggregateRating` until there are real customer reviews on the site. Never ask for "5 stars" anywhere (Google forbids influencing the rating, and the guides say so): migration `drizzle/0006_stand_tagline.sql` replaces the white stand's old seed tagline ("Un tap. Un avis Google 5 étoiles de plus.") on deploy; if it was already edited in admin → Catalog, check it there.
- **Lengths**: titles ≤ 60 characters, meta descriptions ≤ 155 characters once `{price}` is filled in, with the price and "3 jours" before the cut.
- FR/EN parity is checked by `tsc` (`src/i18n/contracts.ts` now covers `guides` and `seo`).

## Not changed here (follow-ups)

- **Security (not SEO):** `/{locale}/order/OND-<n>` shows any order to anyone who guesses the sequential number. These
  pages are noindex, but they should require a token.
- The Caddy blocks on the shared server are unchanged; `admin.onde.tn` already sends `X-Robots-Tag: noindex`.
