# ONDE — deployment runbook (OVHcloud VPS, Ubuntu 24.04, Docker)

This guide takes you from a brand-new OVHcloud VPS to `https://onde.tn` running the shop, the smart links and the
dashboard, then covers backups, updates, passwords and writing the NFC chips. You do not need to be a sysadmin:
copy each command, paste it, press Enter, and check the result before going to the next step.

Conventions used below:

- `SERVER_IP` is your VPS IPv4 address (in the OVHcloud email and in the control panel → *Bare Metal Cloud → VPS*).
- Commands in a block that starts with **Mac** run in the Terminal app on your Mac, in the project folder
  (`cd` into the `onde-web` folder first). Blocks that start with **Server** run on the VPS after `ssh onde@SERVER_IP`.
- When you paste into Terminal use `Cmd+V`. Lines starting with `#` inside a block are comments — they are harmless.

---

## 1. How it fits together

```
 Visitors / NFC taps ──► ports 80 + 443 ──► [ caddy ]  automatic HTTPS (Let's Encrypt), compression, security headers
                                               │
                                               ▼  (private Docker network, port 3000 — never exposed publicly)
                                            [ web ]    Next.js app: website + shop + /t/CODE smart links + /admin
                                               │
                                               ▼
                                      volume "onde-data" → /app/data/onde.db  (SQLite: orders, customers, tags, taps…)
```

| Piece | File | What it does |
|---|---|---|
| App image | `Dockerfile` | Builds the site into a small Node 22 image that runs as a non-root user |
| Stack | `docker-compose.yml` | Starts `web` + `caddy`, restarts them after a crash or reboot |
| Proxy | `Caddyfile` | HTTPS, `www` → apex redirect, `admin.onde.tn` → dashboard, cache headers |
| Settings | `.env` (from `.env.example`) | Secrets and the one-line HTTPS switch (`DOMAIN`) |
| Scripts | `scripts/deploy.sh`, `scripts/backup.sh` | One-command updates; consistent database backups and restore |

Two phases, because the domain arrives a couple of days after the server:

- **Phase 1 — no domain yet.** The site answers at `http://SERVER_IP` (plain HTTP). You can check everything and fill
  the catalog/settings through a secure SSH tunnel (§9).
- **Phase 2 — domain ready.** You add one line to `.env` (`DOMAIN=onde.tn`) and run one command: Caddy gets the
  certificates and serves `https://onde.tn`, redirects `www.onde.tn`, and opens the dashboard on `admin.onde.tn` (§10).

---

## 2. Before you start (checklist)

- [ ] An OVHcloud VPS with **Ubuntu 24.04** (any UK/EU region). 4 GB RAM or more is comfortable; with 2 GB, add swap (§4.6).
- [ ] The VPS IPv4 address and the first login (OVHcloud emails it: user `ubuntu` + a password, or your SSH key if you
      added one when ordering).
- [ ] Your Mac with the project folder `onde-web` (and Node.js, already used to develop it).
- [ ] Later: the domain `onde.tn` and access to its DNS settings at the registrar.

---

## 3. The domain (do this as soon as you buy it — DNS needs time to spread)

A `.tn` domain is sold by registrars accredited by the ATI (Agence Tunisienne d'Internet); a `.com` can be bought at
any registrar. Whichever you use, open the domain's **DNS zone** in the registrar's dashboard and create these records
(replace `SERVER_IP` by your VPS IPv4):

| Type | Name / Host | Value | TTL |
|---|---|---|---|
| A | `@` (the bare domain, sometimes written `onde.tn.` or left empty) | `SERVER_IP` | 3600 (or "1 hour") |
| A | `www` | `SERVER_IP` | 3600 |
| A | `admin` | `SERVER_IP` | 3600 |

**IPv6 (optional).** OVHcloud VPS also have an IPv6. Only add `AAAA` records (same three names, value = the IPv6) if
the server really has it configured — check on the server with `ip -6 addr show scope global`: if a line with
`inet6 2001:…` appears, use that address. A wrong `AAAA` record breaks HTTPS for every visitor on IPv6; with no
`AAAA` record at all, IPv4 works for everyone. When in doubt, skip IPv6.

Delete any old `A`/`AAAA`/`CNAME` records for `@`, `www` or `admin` that point elsewhere (registrars often add a
"parking" record).

Check that the DNS is live (from the Mac or the server). Each command must print `SERVER_IP`:

```bash
# Mac or Server
dig +short onde.tn A
dig +short www.onde.tn A
dig +short admin.onde.tn A
```

It usually takes a few minutes, sometimes a few hours. Do not switch to phase 2 (§10) before all three answer correctly.

---

## 4. Prepare the server (security first)

### 4.1 Create an SSH key on the Mac (once)

```bash
# Mac — press Enter to accept the default file; choose a passphrase you will remember
ls ~/.ssh/id_ed25519.pub 2>/dev/null || ssh-keygen -t ed25519 -C "onde-mac"
```

### 4.2 First login and copy the key to the server

```bash
# Mac — answer "yes" to the fingerprint question, then type the password from the OVHcloud email
ssh-copy-id ubuntu@SERVER_IP
ssh ubuntu@SERVER_IP
```

If `ssh-copy-id` is missing: `cat ~/.ssh/id_ed25519.pub | ssh ubuntu@SERVER_IP 'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys'`.
If OVHcloud asks you to change the password at first login, do it.

### 4.3 Create your own admin user `onde`

```bash
# Server (logged in as ubuntu) — choose a strong password when asked (it is used for sudo); other questions: Enter
sudo adduser onde
sudo usermod -aG sudo onde
sudo mkdir -p /home/onde/.ssh
sudo cp ~/.ssh/authorized_keys /home/onde/.ssh/authorized_keys
sudo chown -R onde:onde /home/onde/.ssh
sudo chmod 700 /home/onde/.ssh && sudo chmod 600 /home/onde/.ssh/authorized_keys
```

**Keep this window open.** In a **new** Mac Terminal window, check that the new user works:

```bash
# Mac
ssh onde@SERVER_IP
sudo whoami        # must print: root
```

### 4.4 Key-only SSH (no passwords, no root login)

```bash
# Server (as onde)
sudo tee /etc/ssh/sshd_config.d/00-onde-hardening.conf >/dev/null <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
sudo sshd -t && sudo systemctl restart ssh
```

The `00-` prefix matters: SSH keeps the *first* value it reads, and Ubuntu cloud images may contain
`50-cloud-init.conf` with `PasswordAuthentication yes`, which would otherwise win. Test once more in a new window (`ssh onde@SERVER_IP` must work
without the server password) before closing the old one. From now on, always log in as `onde`.

### 4.5 Firewall, updates, time zone

```bash
# Server
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw --force enable
sudo ufw status            # should list OpenSSH, 80/tcp, 443/tcp, 443/udp

sudo apt update && sudo apt full-upgrade -y
sudo apt install -y unattended-upgrades rsync git curl dnsutils
sudo dpkg-reconfigure -plow unattended-upgrades      # choose "Yes": security updates install by themselves

# Reboot automatically at 04:30 when an update needs it (the site restarts by itself)
printf 'Unattended-Upgrade::Automatic-Reboot "true";\nUnattended-Upgrade::Automatic-Reboot-Time "04:30";\n' | \
  sudo tee /etc/apt/apt.conf.d/52onde-auto-reboot

sudo timedatectl set-timezone Africa/Tunis           # so 03:15 in cron means 03:15 in Tunis
```

> Note: ports published by Docker (here only 80 and 443) bypass `ufw`. That is why the app's port 3000 is never
> published publicly. Never add a public `ports:` line to the `web` service.

OVHcloud also has an optional network firewall in its control panel; it is off by default. If you ever turn it on,
allow TCP 22, 80, 443 and UDP 443.

### 4.6 Swap (only if the VPS has less than 4 GB of RAM)

Building the site needs memory. Check with `free -h`; if *Mem total* is under 4 GB and *Swap* is 0:

```bash
# Server
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h                    # Swap: 2.0Gi
```

---

## 5. Install Docker Engine + Compose (official Docker repository)

```bash
# Server
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Let "onde" use Docker without sudo, then log out and back in
sudo usermod -aG docker onde
exit
```

```bash
# Mac — log in again so the new group applies
ssh onde@SERVER_IP
docker compose version     # Docker Compose version v2.x (v2.20 or newer)
docker run --rm hello-world
```

Docker starts automatically at boot, and so do the ONDE containers (`restart: unless-stopped`).

---

## 6. Upload the project

### Option A — rsync from the Mac (simplest, no GitHub needed)

```bash
# Mac — in the onde-web folder. Copies everything except local junk, your local database and secrets.
rsync -az --delete \
  --exclude='/node_modules/' --exclude='/.next/' --exclude='/data/' --exclude='/backups/' \
  --exclude='/.env' --exclude='/.env.local' --exclude='/.env.*.local' --exclude='/.git/' \
  --exclude='/tsconfig.tsbuildinfo' --exclude='.DS_Store' \
  ./ onde@SERVER_IP:onde-web/
```

The trailing `./` and `onde-web/` matter (copy the *contents* of the folder). `--delete` keeps the server identical to
your Mac, but the excluded paths are never touched on the server — its `.env`, `backups/` and `data/` are safe.
Later, `scripts/deploy.sh --to onde@SERVER_IP` runs exactly this copy and then deploys (§13).

### Option B — git (if the project is in a private GitHub repository)

```bash
# Server
git clone git@github.com:YOUR_ACCOUNT/onde-web.git ~/onde-web   # needs a deploy key on GitHub, or use https + a token
```

Either way, the project now lives in `/home/onde/onde-web`.

---

## 7. Create the `.env` (secrets)

```bash
# Server
cd ~/onde-web
cp .env.example .env
chmod 600 .env
openssl rand -base64 48            # → copy this line: it is your SESSION_SECRET
```

**Hash the admin password** (the password itself is never stored). Either:

```bash
# Mac — in the project folder (fastest)
node scripts/hash-password.mjs
```

or, on the server (the first run builds the image, ~5–10 minutes):

```bash
# Server
cd ~/onde-web && docker compose run --rm --no-deps web node scripts/hash-password.mjs
```

Type the password twice (nothing shows while you type — normal). Use 12+ characters. The script prints a line
starting with `ADMIN_PASSWORD_HASH=base64:` — **copy that line** (the `# recommended…` comment at its end can stay or go).

> Why `base64:`? A bcrypt hash looks like `$2b$12$…`, and Docker Compose treats `$` in `.env` as a variable: a raw
> hash gets silently corrupted and the login never works. The `base64:` form contains no `$` and the app decodes it.
> (Alternatives that also work: the raw hash in single quotes `'$2b$12$…'`, or every `$` doubled `$$2b$$12$$…`.
> Double quotes do **not** protect it.)

Now edit the file:

```bash
# Server
nano .env
```

Fill in (arrows to move, `Cmd+V` to paste, `Ctrl+O` then Enter to save, `Ctrl+X` to quit):

| Line | Value |
|---|---|
| `ADMIN_EMAIL=` | the email you will type on the login page |
| `ADMIN_PASSWORD_HASH=` | the `base64:…` line from the script |
| `SESSION_SECRET=` | the `openssl rand -base64 48` output |
| `PUBLIC_BASE_URL=https://onde.tn` | keep the final domain **even now** — it is what the dashboard shows for NFC chips |
| `#DOMAIN=onde.tn` | leave commented during phase 1 |
| `ADMIN_HOST=` | optional — leave it out: the dashboard always opens on `admin.` + your domain (one address = one iPhone app). `ADMIN_HOST=off` turns that redirect off |
| `VAPID_PUBLIC_KEY=` / `VAPID_PRIVATE_KEY=` / `VAPID_SUBJECT=` | optional — leave them out: the app creates its notification keys by itself ([NOTIFICATIONS.md](NOTIFICATIONS.md)) |
| `GOOGLE_SITE_VERIFICATION=` / `BING_SITE_VERIFICATION=` | optional — only for the "HTML tag" ownership check of Google Search Console / Bing Webmaster Tools: paste the token from the `content="…"` of the tag they give you. Not needed with a DNS TXT record ([SEO.md](SEO.md)) |

Leave `NODE_ENV` and `DATABASE_PATH` as they are.

---

## 8. First start

```bash
# Server
cd ~/onde-web
bash scripts/deploy.sh
```

The first build takes 5–10 minutes. The script checks your `.env`, builds, starts, waits until the app answers its
health check and prints the addresses. Then check:

```bash
# Server
docker compose ps                  # web: Up … (healthy)   caddy: Up
docker compose logs --tail=30 web  # look for: [onde] database ready (/app/data/onde.db) · seeded 7 products …
curl -s http://localhost/api/health   # {"ok":true,"db":true,"time":"…"}
```

The database is created, migrated and seeded with the catalog and default settings automatically on the first start.

---

## 9. Phase 1 — open the site by IP

- Website: open `http://SERVER_IP` in any browser. Everything works (in plain HTTP for now).
- **Dashboard (recommended way before HTTPS): an SSH tunnel.** The admin session cookie is "secure only", so the
  browser refuses it on `http://SERVER_IP` — on purpose: a password typed over plain HTTP can be intercepted. The
  tunnel encrypts everything through SSH:

```bash
# Mac — leave this window open while you use the dashboard (Ctrl+C closes the tunnel)
ssh -N -L 8080:127.0.0.1:80 onde@SERVER_IP
```

  Then open **http://localhost:8080/admin** in **Chrome or Firefox** (Safari may refuse the login cookie on
  `localhost`). Log in with `ADMIN_EMAIL` and your password. Fill the catalog prices, settings (phone, WhatsApp…),
  and test an order end to end.

- Not recommended, but possible: add `COOKIE_SECURE=false` to `.env` and run `docker compose up -d` to log in on
  `http://SERVER_IP/admin` directly. Remove that line again as soon as HTTPS works.

---

## 10. Phase 2 — switch to the domain (HTTPS)

1. Check that the DNS answers (§3) — all three names must return `SERVER_IP`.
2. Edit `.env` and change **one line**:

   ```bash
   # Server
   cd ~/onde-web && nano .env
   #   #DOMAIN=onde.tn   →   DOMAIN=onde.tn        (also delete COOKIE_SECURE=false if you added it)
   docker compose up -d
   ```

3. Watch Caddy get the certificates (about 10–60 seconds):

   ```bash
   # Server — wait for "certificate obtained successfully" for onde.tn, www.onde.tn and admin.onde.tn, then Ctrl+C
   docker compose logs -f caddy
   ```

4. Test:
   - `https://onde.tn` → the site with a padlock.
   - `https://www.onde.tn` → redirects to `https://onde.tn`.
   - `http://onde.tn` → redirects to HTTPS.
   - `https://admin.onde.tn` → the dashboard login (`https://onde.tn/admin` redirects there).
5. In the dashboard → Settings, add the company email and the social links when you have them — the site shows
   them automatically (empty ones stay hidden).
6. On your iPhone: install **ONDE Admin** on the Home Screen and turn on new-order notifications —
   [NOTIFICATIONS.md](NOTIFICATIONS.md) (5 minutes).

Certificates renew automatically. They are stored in the `onde_caddy_data` volume — never delete that volume, or
Caddy has to ask for new certificates (rate-limited by Let's Encrypt).

To go back to phase 1 (e.g. while moving the domain): comment `DOMAIN` again and `docker compose up -d`.

---

## 11. Everyday commands

Run them in `~/onde-web` on the server.

| I want to… | Command |
|---|---|
| See if everything runs | `docker compose ps` |
| Follow the app logs | `docker compose logs -f web` (Ctrl+C to stop following) |
| See proxy / certificate logs | `docker compose logs -f caddy` |
| Restart the app | `docker compose restart web` |
| Apply a change made in `.env` | `docker compose up -d` (a plain `restart` does **not** reload `.env`) |
| Stop / start everything | `docker compose down` / `docker compose up -d` (data stays in the volumes) |
| Check the health endpoint | `curl -s http://localhost/api/health` (phase 2: `curl -s https://onde.tn/api/health`) |
| Disk usage | `df -h /` and `docker system df` |
| Free disk space (old build cache) | `docker builder prune -f && docker image prune -f` |

Never run `docker compose down -v` or `docker volume rm …`: `-v` deletes the volumes, i.e. **the database**.

---

## 12. Backups and restore

### Back up now

```bash
# Server
cd ~/onde-web && bash scripts/backup.sh
```

The script asks the running app to copy its database with SQLite's online-backup API (safe while customers order),
verifies the copy, and writes `backups/onde-YYYYmmdd-HHMM.db.gz`. Backups older than 14 days are deleted. A backup is
also taken automatically before every deploy.

### Every night, automatically

```bash
# Server
bash scripts/backup.sh cron        # prints the exact line for your server, e.g.:
# 15 3 * * * cd '/home/onde/onde-web' && ./scripts/backup.sh >> '/home/onde/onde-web/backups/backup.log' 2>&1
crontab -e                         # choose nano, paste the line at the bottom, save (Ctrl+O, Enter) and quit (Ctrl+X)
crontab -l                         # check it is there
```

Check it ran the next morning: `tail backups/backup.log` and `bash scripts/backup.sh list`.

### Keep a copy off the server (important)

A backup on the same machine does not protect against losing the machine. Once a week, pull them to the Mac:

```bash
# Mac
mkdir -p ~/ONDE-backups && rsync -a onde@SERVER_IP:onde-web/backups/ ~/ONDE-backups/
```

OVHcloud also sells automated VPS snapshots/backups as an option in the control panel — a good extra layer.

### Restore

```bash
# Server
cd ~/onde-web
bash scripts/backup.sh list
bash scripts/backup.sh restore backups/onde-20261012-0315.db.gz     # type RESTORE to confirm
```

It takes a safety copy of the current database first (`…-pre-restore.db.gz`), stops the app, swaps the database,
restarts and waits for the health check. Anything recorded after the chosen backup is lost.

**Moving to a new server:** set it up with §4–§8, copy a backup into its `~/onde-web/backups/` (e.g. with `rsync`
from the Mac), then `bash scripts/backup.sh restore backups/<file>`.

---

## 13. Updating the site

After changing the code on the Mac:

```bash
# Mac — in the project folder
bash scripts/deploy.sh --to onde@SERVER_IP
```

It copies the project (same rsync as §6), then on the server: checks `.env`, backs up the database, rebuilds,
restarts, waits for the health check (requests are held for a few seconds instead of failing), verifies through
Caddy and removes old images. If you use git on the server instead: `cd ~/onde-web && bash scripts/deploy.sh`
(it runs `git pull` first).

If an update misbehaves: deploy the previous version of the code the same way. If the problem is in the data
(rare — the app migrates the database on start), restore the backup taken just before the deploy (§12).

---

## 14. Admin password and secrets

**Change (or reset a forgotten) admin password** — there is no "forgot password" email; the server owner resets it:

```bash
# Mac (or on the server: docker compose run --rm --no-deps web node scripts/hash-password.mjs)
node scripts/hash-password.mjs
```

```bash
# Server — replace the ADMIN_PASSWORD_HASH line with the new base64: line, then apply
cd ~/onde-web && nano .env && docker compose up -d
```

Every open admin session is logged out automatically when the hash changes.

- **Change the login email:** edit `ADMIN_EMAIL` in `.env`, then `docker compose up -d`.
- **Rotate the session secret** (e.g. if `.env` may have leaked): `openssl rand -base64 48`, paste into
  `SESSION_SECRET`, `docker compose up -d` — everyone is logged out. If `.env` leaked, change the password too.
- **Phone notifications:** nothing to configure — see [NOTIFICATIONS.md](NOTIFICATIONS.md). Their keys live in the
  database, so database backups are as private as `.env`.

---

## 15. Troubleshooting

| Symptom | Likely cause → fix |
|---|---|
| `permission denied … docker.sock` | Your user is not in the `docker` group yet → `sudo usermod -aG docker onde`, then log out and back in. |
| `env file … .env not found` | Create it: `cp .env.example .env` and fill it (§7). |
| Build stops with `Killed`, exit code 137 or "heap out of memory" | Not enough RAM → add swap (§4.6) and run `bash scripts/deploy.sh` again. |
| Build fails while downloading fonts or packages | The VPS lost internet/DNS for a moment → run the deploy again; check `curl -I https://registry.npmjs.org`. |
| `web` shows `unhealthy` / keeps restarting | `docker compose logs --tail=100 web`. Look for `[onde] database bootstrap failed` (disk full? `df -h`) or a crash message. |
| Browser shows the dark "We'll be right back" page | Caddy runs but the app does not answer → `docker compose ps`, then the logs above. It reloads by itself once the app is up. |
| Nothing on `http://SERVER_IP` | `docker compose ps` (is caddy up?) · `sudo ufw status` · another web server holds port 80 → `sudo systemctl disable --now apache2 nginx 2>/dev/null`, then `docker compose up -d`. |
| Admin login always says wrong credentials | Raw `$2b$…` hash in `.env` (use the `base64:` line, §7) · email typo in `ADMIN_EMAIL` · `SESSION_SECRET` under 32 characters. `docker compose logs web \| grep onde` shows a warning when the config is incomplete. After fixing: `docker compose up -d`. |
| Login succeeds then sends me back to the login page | You are on plain `http://SERVER_IP` → use the SSH tunnel (§9) or HTTPS. |
| No HTTPS after setting `DOMAIN` | DNS not pointing yet (`dig +short onde.tn`) · `DOMAIN` must be bare (`onde.tn`, no `https://`, no `www`) · wrong `AAAA` record (delete it) · ports 80/443 closed in an OVHcloud network firewall. Read `docker compose logs caddy`. After fixing DNS, `docker compose restart caddy`. |
| `www` or `admin` has no certificate but the apex works | The `www`/`admin` A record is missing or wrong (§3). |
| `https://SERVER_IP` gives a certificate error | Normal: certificates are for the domain name, not the IP. |
| A change in `.env` did nothing | Use `docker compose up -d` — `restart` keeps the old settings. |
| Disk almost full | `docker builder prune -f && docker image prune -f`; check `du -sh ~/onde-web/backups`. |
| Nightly backup missing | `crontab -l` (line present?) · `tail ~/onde-web/backups/backup.log` · `journalctl -u cron --since yesterday`. |
| A chip opens the "inactive" page | The smart link is disabled or has no destination → set it in the dashboard (Products / smart links). Read the chip with NFC Tools → *Read* to confirm it holds the right `https://onde.tn/t/CODE`. |
| iPhone does not react to a chip | Screen on and unlocked; touch the **top edge** of the iPhone to the chip. iPhone 7–X: open Control Center → NFC reader first. |

Still stuck: `docker compose ps`, `docker compose logs --tail=200 web caddy` and the exact error message are what
anyone helping you will need.

---

## 16. NFC chips and QR codes

Every product has one permanent smart link, shown in the dashboard: `https://onde.tn/t/CODE`. It is written on the
chip **once**; later you only change where it redirects (Google review page, Instagram, menu…) in the dashboard —
the chip itself never needs rewriting.

**Chips:** NTAG213 (enough for these URLs), NTAG215 or NTAG216 all work with every NFC phone.

**Write a chip with the free app "NFC Tools" (by wakdev, Android and iPhone):**

1. In the dashboard, copy the product's smart link exactly (e.g. `https://onde.tn/t/K7M3QX`).
2. NFC Tools → **Write** → **Add a record** → **URL / URI** → paste the link (if the app shows a separate
   `https://` prefix selector, keep `https://` and paste the rest) → **OK**.
3. Tap **Write** and hold the chip against the phone (Android: middle of the back; iPhone: top edge) until it confirms.
4. Protect it against rewriting: **Other** → **Set password** → choose a password → hold the chip again. Use the same
   password for all chips and keep it in your password manager — you need it to ever rewrite a chip. Do **not** use
   *Lock tag*: that is permanent and can never be undone. (If *Set password* is not offered on your phone, do this
   step with an Android phone.)

**Test every chip before shipping it:**

- **iPhone (XS and newer):** screen on, touch the chip with the top edge → a notification appears → tap it → the
  destination opens.
- **Android:** NFC on (Settings → Connections/Connected devices → NFC) → touch the chip → the browser opens directly.
- In the dashboard, the smart link's tap counter increases and the tap is counted as **NFC**.

**QR codes:** the dashboard's QR page generates them (SVG for print, PNG). A QR code holds the **same link with
`?s=qr`** at the end (`https://onde.tn/t/K7M3QX?s=qr`), so the statistics can tell QR scans from NFC taps. Print it on
the stand/card next to the chip for phones without NFC.

---

## 17. Cheat sheet

| Where | What |
|---|---|
| Server folder | `/home/onde/onde-web` |
| Settings & secrets | `/home/onde/onde-web/.env` (never share it) |
| Database | Docker volume `onde_onde-data` → `/app/data/onde.db` inside the `web` container |
| Certificates | Docker volume `onde_caddy_data` |
| Backups | `/home/onde/onde-web/backups/` (+ your Mac copy in `~/ONDE-backups`) |
| Deploy from the Mac | `bash scripts/deploy.sh --to onde@SERVER_IP` |
| Back up / restore | `bash scripts/backup.sh` · `bash scripts/backup.sh restore backups/<file>` |
| HTTPS switch | `DOMAIN=onde.tn` in `.env`, then `docker compose up -d` |
| Health | `GET /api/health` → `{"ok":true,"db":true,"time":"…"}` |
