# New-order notifications on your iPhone

Every time someone orders on the website, your iPhone shows a pop-up — like a text message — even when the app is
closed and the phone is locked. Tap it and the order opens. The ONDE Admin icon also shows a red number: how many
orders are still **New**.

It works through **ONDE Admin**, the dashboard installed on your Home Screen like an app. There is nothing to buy,
no bot and no other app to install.

---

## Set it up on your iPhone (5 minutes, once)

You need **iOS 16.4 or later** (Settings → General → About → iOS Version). Any iPhone from the last few years is fine.

1. Open **Safari** and go to **admin.onde.tn**.
2. Tap the **Share** button (the square with an arrow, at the bottom of the screen; on iOS 26 tap **•••** first, then
   **Share**).
3. Scroll down and tap **Add to Home Screen** (if you see **Open as Web App**, leave it on), then **Add**. An
   **ONDE Admin** icon appears on your Home Screen.
4. Open **ONDE Admin from the Home Screen icon** (not from Safari) and **sign in**.
   The app has its own sign-in: being signed in in Safari does not count. You stay signed in for 7 days.
5. Go to **Settings** (menu ☰ → Settings). In the **Phone notifications** card, tap
   **Enable notifications on this device**.
6. Your iPhone asks “ONDE Admin would like to send you notifications”. Tap **Allow**.
7. Tap **Send test**. A notification “ONDE Admin — Test alert” should pop up within a few seconds.

That’s it. You can close the app: alerts keep coming.

> Use the Home Screen icon every time you open the dashboard on your iPhone. Each time it opens, it quietly checks
> that notifications are still connected and repairs them if needed.

## If you don’t see notifications

- **Focus / Do Not Disturb** is on (moon icon in Control Center) → turn it off, or add ONDE Admin to the apps allowed
  in that Focus (Settings → Focus → your Focus → Apps).
- **Notifications are off for the app** → iPhone **Settings → Notifications → ONDE Admin** → turn on
  **Allow Notifications** (and choose Banners / Lock Screen as you like). Then open ONDE Admin → Settings: the card
  should say **“This device gets order alerts”**.
- The card says **“This device doesn’t get alerts yet”** → tap **Enable notifications on this device** again.
- In the **Devices** list, a red line explains the last failure. **“Expired — removed”** means Apple (or the browser)
  ended that device’s subscription (app deleted, notifications switched off, phone restored or reset): open ONDE Admin
  on that iPhone once. If notifications are still allowed there it signs back up by itself (Settings then says
  **“This device gets order alerts”**); otherwise tap **Enable notifications on this device**.
- You deleted the ONDE Admin icon → redo the setup above (steps 1–7).
- Still nothing → in Settings tap **Send test to all devices** and look at the result next to each device.

## Turn it off

- **On one device:** open ONDE Admin on it → Settings → **Turn off on this device**.
- **For a device you don’t have any more** (old phone): Settings → Devices → **Remove**. (If that device opens
  ONDE Admin again with notifications allowed, it signs itself back up.)

## Add your Mac (or another computer, or a second iPhone)

- **Second iPhone / iPad:** same steps as above on that device.
- **Mac — Safari:** open **https://admin.onde.tn**, sign in, Settings → **Enable notifications on this device** →
  **Allow**. (Optional: Safari → File → **Add to Dock** to get an app with its own icon, then enable it inside that app.)
- **Mac or PC — Chrome / Edge / Firefox:** open **https://admin.onde.tn**, sign in, Settings → **Enable** → **Allow**.
  The browser must be running (in the background is fine) to show the pop-up.
- If you clicked **Block** by mistake: click the icon at the left of the address bar → Notifications → Allow
  (Safari: Safari → Settings → Websites → Notifications), reload, and enable again.

Every device is listed under **Settings → Phone notifications → Devices**.

---

## Technical notes (for whoever maintains the server)

**How it works.** Standard Web Push (RFC 8030 / 8291 encryption / 8292 VAPID) with the `web-push` library — no
third-party service account. Each browser gives the app a *push endpoint* on its vendor’s push service (Apple, Google,
Mozilla, Microsoft). When an order is created (`src/server/orders.ts` → `notifyNewOrder()` in `src/server/notify.ts`),
the server encrypts a small JSON message for each registered device and posts it to that endpoint
(`src/server/push.ts`). This happens after the order is committed, in the background (`setImmediate` +
`Promise.allSettled`): a slow or broken push service never delays or fails an order.

**Message format.** Declarative Web Push (`{"web_push": 8030, "notification": {title, body, navigate, app_badge, …}}`),
which iOS/iPadOS/macOS 18.4+ display without running JavaScript; `public/admin-sw.js` (service worker, scope
`/admin`, no fetch handler, no caching) displays the same message on older iOS and other browsers and sets the app
badge. Every push always ends in a visible notification (iOS cancels subscriptions that receive silent pushes).
Payloads stay under 3 KB; links point to the origin the device subscribed from (`/admin/orders/<id>`).
Options: `TTL` 24 h, `Urgency: high`, `aes128gcm`, 10 s timeout, no `Topic`.

**One admin address.** Every origin is a separate Home Screen app with its own push identity and its own cookies, so
the dashboard lives on one origin. `src/proxy.ts` sends GET/HEAD page loads of `/admin/**` arriving on another public
host (e.g. `onde.tn/admin`) to `https://admin.onde.tn/…` with a 308 (`src/server/admin-host.ts`). Never redirected:
`/api/**`, server actions (POST), `localhost` / IP hosts (health checks, SSH tunnel on `127.0.0.1:8080`), requests
already on the admin host. The admin host is `ADMIN_HOST` if set (`ADMIN_HOST=off` or empty disables the redirect),
otherwise `admin.` + the host of `PUBLIC_BASE_URL` when that is a real domain. During phase 1 (plain HTTP by IP) nothing
is redirected; if you ever open the dashboard by domain over plain HTTP before certificates exist, set `ADMIN_HOST=off`.
On `admin.onde.tn`, `/` is a real redirect to `/admin` (Caddyfile `redir`, plus the same rule in `src/proxy.ts`) so the
address bar is always inside the app's scope (`/admin`) when the owner taps “Add to Home Screen”. `scripts/deploy.sh`
does not reload Caddy: after deploying a Caddyfile change run
`docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`.

**VAPID keys.** Generated once on first use and stored in the `vapid_keys` table (single row, insert-or-ignore, so
two processes can never create two different pairs). They must never change: every subscription is tied to the public
key. Optional `.env` overrides: `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` (both, base64url; ignored with a warning if
they are not a valid pair) and `VAPID_SUBJECT` (`mailto:` or `https:` on a real domain; default
`mailto:contact@onde.tn`). Switching keys later breaks existing subscriptions: each device then re-subscribes the next
time ONDE Admin is opened (the app compares the key), or press Enable again. The private key never leaves the server:
it is not in CSV exports, settings, the audit log or logs — but it **is** in the database file, so keep backups private.

**Subscriptions.** Table `push_subscriptions` (endpoint, browser keys, origin, label, user agent, created / last seen /
last success, failure count, last error). Saved by server actions in `src/app/(admin)/admin/push-actions.ts`
(admin session required, zod-validated, origin taken from the request and required to be https). The panel
(`src/components/admin/push/PushBootstrap.tsx` → `push/sync.ts`) compares this browser's subscription with the devices
the server has every time the app opens. Permission granted but no subscription, a subscription the server no longer
has (deleted after a 404/410, or removed in the list) or one made with another VAPID key → the browser unsubscribes and
subscribes **afresh** (never re-saves the old endpoint, which may be dead at the push service). WebKit never fires
`pushsubscriptionchange`, so this is the repair path. A registered one is re-saved at most once a day (last seen).
“Enable notifications on this device” also always creates a new subscription. If saving fails (too many devices,
non-https origin, network), the new subscription is dropped again: the card only says “This device gets order alerts”
when the server really has the device.
Audit log: `push.subscribe`, `push.remove`, `push.test`, `push.keys_created` (never keys or full endpoints).

**Allowed endpoints (SSRF guard, checked when saving and when sending).** `https://` only, default port, host
`web.push.apple.com` / `*.push.apple.com`, `fcm.googleapis.com`, `updates.push.services.mozilla.com` /
`*.push.services.mozilla.com`, `*.notify.windows.com`. The raw endpoint must read `https://<plain DNS name>/…`
(letters, digits, dots, hyphens; no user info, `\`, `%`, `;` …): `web-push` connects using Node’s legacy `url.parse()`,
which reads hosts such as `evil.com;.push.apple.com` as `evil.com`, so both parsers must agree before the allowlist
applies. `PUSH_TEST_ENDPOINT_ORIGIN` (one exact origin) is for the
automated tests only — never set it in production.

**Push service answers.**

| Status | Meaning | What the app does |
|---|---|---|
| 201 (2xx) | accepted | `last_success_at` = now, failures reset |
| 404 / 410 | subscription gone (app deleted, permission removed) | subscription deleted |
| 400 / 403 / 413 | our request/keys are wrong (e.g. Apple `BadJwtToken`, `VapidPkHashMismatch`) | kept, `last_error` recorded |
| 429 / 5xx / network | temporary | kept, `failures + 1`, `last_error` recorded |

Logs: one line per order (`[onde] push: order OND-1042 → 1 delivered, 0 removed, 0 failed`) and a warning per
failure (push-service host only).
