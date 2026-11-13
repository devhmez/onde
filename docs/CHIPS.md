# Smart links, stock stands and NFC chips

How ONDE products are prepared in advance (printed + chip written), sold, and kept working forever.

## How a smart link works

```
NFC chip ── https://onde.tn/t/CODE ──────┐
                                          ├─► ONDE (302) ─► the destination set in the admin
printed QR ─ https://onde.tn/t/CODE?s=qr ─┘                 (Google review form, Instagram, menu…)
```

- **CODE** is 6 characters from `ACDEFGHJKMNPQRTUVWXY34679` (no 0/O, 1/I/L, 2/Z, 5/S, 8/B look-alikes). It never changes.
- The chip and the QR are written/printed **once**. Changing where they lead is done in the admin and is instant.
- `?s=qr` only marks the scan as "QR" in the stats. **Never write the `?s=qr` link to a chip** (NFC taps would be counted as QR scans).
- A link with **no destination yet** (stock) or **disabled** opens the branded page *"ONDE — Ce présentoir n'est pas encore activé / This stand isn't activated yet"* with a WhatsApp button (no brand intro on that page). Those taps are still logged.
- Taps on a **stock** link are chip tests: they show on the link, but not in the dashboard figures, and they are deleted when the link is sold, so the customer starts at 0. Stock links are not counted in *Products sold* (the card shows "N in stock" instead).

## 1. Create stock links (admin)

Admin → **Products** → **+ Add stock** → pick the product (white stand, black stand, card, keychain, sticker) → how many (e.g. 20) → *Create*.

They have no customer and no destination. The **Stock** tab lists them (with the count) and offers **Print files · not printed yet (N)**.

## 2. Download the print files

From the "Add stock" result, the Stock tab (*Print files · not printed yet*), Products → *Manage products* → select → *Print files*,
or QR codes → *Stand print files*. You get a ZIP:

| File | What it is |
|---|---|
| `ONDE-<CODE>.png` | The owner's 12 × 12 cm stand design with this link's QR in the QR box, the code printed under it (≈ 2.6 mm capitals, firm stroke — readable at a client's counter). 2000 × 2000 px = **423 dpi**, sRGB, DPI stored in the file. |
| `ONDE-<CODE>.pdf` | Same print as a 12 × 12 cm PDF page; QR and code are **vectors in 100 % black (K)** — the sharpest option for the printer. |
| `bleed-3mm/ONDE-<CODE>.pdf` | Optional (tick "3 mm bleed"): 12.6 × 12.6 cm page, white bleed, TrimBox = 12 × 12 cm. |
| `other-products/ONDE-<CODE>-qr.svg` | Plain vector QR for cards / keychains / stickers in the selection. |
| `chip-sheet.pdf` / `.csv` | A4 list: every code, the exact **chip link** to write, a small QR of that link, and Written / Tested / Locked boxes (optional — the admin keeps each chip's state, see §3–4). |

Print at **100 % (actual size)**, never "fit to page". One file per stand: each QR is unique.
A single stand's print is also on its page and in the edit panel (*Print PDF* / *Print PNG*), and on the client's page.

**Never print a code twice** — two stands with the same code send the second customer's taps to the first customer's page. Every
print download is remembered (audit log): the Stock tab's main button only exports links **never downloaded before**, and
*All stock…* (re-print everything) asks first and says how many were already downloaded. Use it only to replace a lost or
damaged print, and throw the old one away. A stand's *Print PDF / PNG* and the QR codes page (*Stand print files*, *Print A4
sheet*) also ask first when a code already went out, and every print download — including the plain QR PNG/SVG of cards and
stickers — is recorded (`print.zip`, `print.file`, `print.sheet` in the audit log), so "printed" is always right. The QR codes
page prints only the codes you **select** (tick the cards, or *Select* on a group), and *Print A4 sheet* always confirms how many
codes it records as printed — they count even if the print dialog is cancelled. A printed or chip-written stand can't be deleted
(return it to stock or disable it).

**Black stands**: the design above is the white stand's. Until the owner supplies the black stand's design
(`assets/print/stand12-design-black.png`), black stands get **no print files** (the buttons say *Black stand print design not
available yet*, the server refuses them, and stock packs list them as "not in this pack"). They are never printed on the white
design. Once the file is added, nothing else changes: links labelled "… (black)" use it automatically.

QR details: error correction **Q** (survives ~25 % damage/glare), 4-module quiet zone inside the box, every module an exact block of
pixels (no blur). The design file is `assets/print/stand12-design.png`; the empty QR box is detected automatically from its thin
grey outline, which is removed in the output (a design whose box cannot be detected can give it in `<design>.box.json`:
`{"left":…,"top":…,"right":…,"bottom":…}` in pixels). **Today that PNG is decoded from the owner's 58 KB WebP (lossy)**: the QR
itself is drawn clean on top, but compression artefacts around the headline, stars and logo can show on a close-up acrylic print.
Before a large run, ask the owner for the lossless export (PDF, SVG or a 2000 px+ PNG from the design tool), replace the PNG
(keep the thin grey placeholder square), and check a fresh pack with `scripts/verify-print.mjs`.

## 3. Write each chip — NFC Tools (free, iPhone & Android)

1. Install **NFC Tools** (wakdev) from the App Store / Google Play. Android: turn NFC on in Settings.
2. **Write** → **Add a record** → **URL / URI**.
3. Paste the chip link `https://onde.tn/t/CODE` (copy it from the admin edit panel, or from `chip-sheet.csv`) → **OK**.
4. **Write** → hold the chip against the phone — iPhone: the **top edge**; Android: the **middle of the back** — until "Write complete".
5. In the admin, open the stand (**Find a stand** → type its code) → **NFC chip → Written**. (The paper chip sheet is optional.)

Tip: write the chip of the stand whose printed code matches the line of the chip sheet, so print, chip and admin always agree.

## 4. Test, then (optionally) lock

1. Close NFC Tools. Tap the chip with a phone (screen unlocked): a stock link opens the ONDE *"not activated yet"* page showing the
   same CODE. The tap appears on the stand in the admin and its chip turns **Tested** by itself (a real NFC tap — a phone opening
   the chip's URL with no referrer; QR scans and link clicks don't count).
2. Scan the printed QR with the camera: same page, same CODE.
3. Optional, **only after the test**: NFC Tools → **Other** → **Lock tag**. It is **permanent** — the chip can never be rewritten
   (the destination still changes from the admin, that is the point). Alternative: **Other → Set password** (rewritable with the
   password). Set **NFC chip → Locked** on the stand.

Each stand's chip state (*Not written / Written / Tested / Locked*) shows in the Products list (Chip column), on the stand's page,
the client's page, the order's smart links, the QR codes page and the stand register export.

## 5. Sell a stock stand (assign it)

**Find a stand** is on every admin page (sidebar on a computer, magnifier in the iPhone top bar, or `/` / ⌘K): type the code
printed under the QR — case, spaces and dashes don't matter, and 0/O, 1/I, 5/S, 8/B (never used in codes) are read as the code
they can only be. A client name, business or phone number also works. The stand's page answers everything at once: client,
where it points, chip state, taps (30 days + total), when its print went out, and its print files. If another code differs only
by look-alike letters (C/G/Q, U/V, M/N…), the search says so — compare the print, or tap the stand: the page shows its code.

**At the client's counter (no order needed)** — the stand's page (or Products → Stock → the code) shows **Sell this stand**:

1. **Existing client** (search by name / business / phone) or **+ New client** (business name, optional contact name, phone).
   A phone that is already a customer links to that customer instead of creating a second one.
2. Paste their **Google review link** (optional — it can be added later; pre-filled when we already know the client's link).
3. **Sale**: *Paid in person now* (default: records a delivered order with no delivery fee and payment "Paid in person", at the
   product's current price, editable; no "new order" phone notification), *Hand over for order OND-…* (offered — and picked by
   default — when the client has an open order still waiting for that product: the stand becomes that order's smart link,
   nothing new is recorded; if the order already got a code from *Create smart links* that was never printed, tapped or written,
   the option says *replaces unprinted code …* and that code is deleted, so one stand never has two codes), or *Don't record a
   sale* (gift, trial, paid elsewhere). *Sell* waits until the client's orders are loaded.
4. **Sell**. One step, one transaction: the stand gets the client, the destination, the label "Business — Review stand (white)",
   it is switched on if it was disabled, and its test taps are cleared so the client starts at 0.

The client's page has the same form (**+ Sell a stock stand**: type the code under the QR) and lists every stand they own as a card
with its QR, product, Live/Disabled, chip, destination, taps (30 days + total) and *Change destination*, *Print PDF/PNG*,
*Disable/Enable*, *Open*.

**For an order** (bought online / on WhatsApp): Admin → Orders → the order → **Smart links** → **Use a stock stand** → type the
code → **Use**. The link gets the order's customer, the destination the customer gave on the order line and the label; a disabled
stock stand is switched on. *Create missing links* then skips that unit — no second code is created for it. Minting new codes
while printed stock waits asks first; a code minted for the order that was never printed, tapped or written can be **replaced**
by the stock stand (the minted code is deleted), so the order never keeps a code that is on no stand.

**Wrong stand or wrong client?** Open the stand → **Return to stock…** (on an order: **Not this stand? Undo** right after *Use*).
It removes the client, the order link and the destination, restores the product label, switches it on, and deletes the taps it
received while assigned (stock taps never count in the figures, so the dashboard and the client's numbers stay right). The chip
state and the print are unchanged; the order waits for a stand again. A stand sold with *Paid in person now* also offers **Also
cancel sale OND-…** (on by default): for the wrong client or a stand given back, the sale stops counting in revenue (and a
returning-customer discount it gave is withdrawn); untick it for a misread code — the same client's sale then waits for the right
stand (*Hand over for order*). Everything is kept in the destination history and audit log.

Then tap the stand: it opens the client's Google review form (302). Nothing on the chip or the print changed.

**Stand register**: Products → **Export register** (CSV, opens in Excel): one row per stand — code, product, status
(stock / live / no link yet / disabled), chip, client, business, phone, destination, taps 30 days, taps total, created, printed, order, label.
The QR codes page groups every QR by client (stock not printed / stock printed / each client / no client).

### How the client gets their Google review link

- **On a computer**: sign in with the Google account that manages the business, search the business name on Google → in the business
  panel click **Ask for reviews** (*Demander des avis*) → **Copy link**.
- **On a phone**: Google Maps app → profile picture → **Your Business Profile** → **Ask for reviews** / **Get more reviews** → copy / share.
- The link looks like `https://g.page/r/XXXXXXXX/review` and opens the 5-star review form directly. Paste it as is.
  (`g.page`, `maps.app.goo.gl` and `google.com/maps` links are all recognised as "Google Reviews".)

## Troubleshooting

| Symptom | Fix |
|---|---|
| iPhone does not write | iPhone 7 or newer; hold the chip at the very top edge; remove a thick or metal case. |
| "Tag is read-only" | The chip is locked. Use a new chip (or the password if you set one). |
| Tap opens "not activated yet" | Expected for stock. Assign the customer + destination in the admin. "Paused" = the link is disabled (switch *Product active* back on). |
| QR scans show as NFC taps | The chip was written with the `?s=qr` link — rewrite it with `https://onde.tn/t/CODE` (if not locked). |
| Wrong stand / wrong chip | Tap it: the page shows its CODE. Find a stand → that CODE → fix its destination, or **Return to stock** if it was sold to the wrong client. |

## For developers

- Stock = `customer_id IS NULL AND destination_url = ''` (`stockCondition()` in `src/server/tags.ts`), no extra column.
- Chip state = `tags.chip_status` (`none | written | tested | locked`) + `tags.chip_at` (migration `drizzle/0004_chip_status.sql`,
  which marks links that already had an NFC tap as `tested`). `recordTap()` moves `none/written → tested` on a referrer-less NFC tap.
- Stands: `src/server/stands.ts` — `findStands()` (Find a stand, `GET /api/admin/find?q=`), `sellStockTag()` (walk-in sale, new
  or existing customer, optional in-person order via `insertInPersonSale()` in `orders.ts`), `releaseToStock()` (undo),
  `standStats()`. One stand's page: `/admin/stands/CODE`. Register export: `GET /api/admin/export/register`.
- Print rendering: `src/server/qr-print.ts` (design + box detection, PNG/PDF), `src/server/qr-glyphs.ts` (vector code text, no fonts
  needed in the Docker image), `src/server/export-pdf.ts` (minimal PDF writer), `src/server/export-zip.ts` (streamed ZIP),
  `src/server/export-print.ts` (pack: chip sheet, CSV, README), `src/server/print-log.ts` (what was already printed, from the
  `print.zip` / `print.file` / `print.sheet` audit entries). Routes: `GET /api/admin/print?ids=…|stock=1[&unprinted=1][&kind=…][&bleed=1]`,
  `GET /api/admin/tags/[id]/print?format=png|pdf[&bleed=1]`. Stand colour = `standVariant()` in `src/lib/business.ts` ("(black)"
  in the label); a missing design → `400 {"error":"no_black_design"}`.
- Selling through an order: `assignStockTagToOrder()` / `assignStockTagTx()` in `src/server/orders.ts` (one transaction; test taps cleared by
  `clearTestTaps()` in `src/server/tags.ts`, which `updateTag()` also calls when a stock link gets a customer or a destination).
- Verify a pack (decodes every QR, checks sizes and DPI; the decoder is not a project dependency):

  ```bash
  npm i --prefix /tmp/onde-qr jsqr@1.4.0
  node scripts/verify-print.mjs ~/Downloads/onde-print-….zip --jsqr /tmp/onde-qr/node_modules/jsqr --render
  ```

  `--render` (macOS) also rasterises every PDF with Quick Look and decodes the rendered page.
