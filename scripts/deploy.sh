#!/usr/bin/env bash
# ONDE — deploy / update the site.
#
# From your Mac, in the project folder (copies the code with rsync, then deploys on the server):
#   scripts/deploy.sh --to onde@SERVER_IP
#
# On the server, in the project folder (e.g. after `git pull`, or to simply rebuild/restart):
#   scripts/deploy.sh
#
# What a deploy does: checks .env → updates the code (git pull, if this folder is a git clone) → backs up the
# database → rebuilds the image → restarts with zero data loss → waits until /api/health is green → cleans old images.
#
# Options:
#   --to USER@HOST   run from the Mac: rsync the project to HOST, then deploy there
#   --dir DIR        folder on the server for --to (default: onde-web, i.e. ~/onde-web)
#   --no-backup      skip the pre-deploy database backup
#   --no-pull        skip `git pull` on the server
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TARGET=""
REMOTE_DIR="onde-web"
DO_BACKUP=1
DO_PULL=1

die() { echo "deploy.sh: $*" >&2; exit 1; }
step() { printf '\n\033[1;35m▸ %s\033[0m\n' "$*"; }
ok() { printf '\033[32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*" >&2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --to) [ $# -ge 2 ] || die "--to needs USER@HOST"; TARGET="$2"; shift 2 ;;
    --to=*) TARGET="${1#--to=}"; shift ;;
    --dir) [ $# -ge 2 ] || die "--dir needs a folder"; REMOTE_DIR="$2"; shift 2 ;;
    --dir=*) REMOTE_DIR="${1#--dir=}"; shift ;;
    --no-backup) DO_BACKUP=0; shift ;;
    --no-pull) DO_PULL=0; shift ;;
    -h | --help) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown option '$1' (see scripts/deploy.sh --help)" ;;
  esac
done

# ====================================================================================================================
# Mode 1 — from the Mac: rsync the project, then run this script on the server.
# ====================================================================================================================
if [ -n "$TARGET" ]; then
  command -v rsync >/dev/null 2>&1 || die "rsync is not installed on this computer."
  command -v ssh >/dev/null 2>&1 || die "ssh is not installed on this computer."
  [ -f "$ROOT/package.json" ] && grep -q '"name": "onde-web"' "$ROOT/package.json" ||
    die "run this from the ONDE project folder."
  case "$REMOTE_DIR" in "" | /) die "refusing to deploy into '$REMOTE_DIR'." ;; esac

  step "Copying the project to $TARGET:$REMOTE_DIR"
  ssh "$TARGET" "mkdir -p '$REMOTE_DIR'"
  # --delete keeps the server copy identical to this folder, EXCEPT the excluded paths, which are never touched there:
  # the server's own .env (secrets), its backups/ and data/, and heavy build folders that are rebuilt in Docker.
  rsync -az --delete \
    --exclude='/node_modules/' \
    --exclude='/.next/' \
    --exclude='/data/' \
    --exclude='/backups/' \
    --exclude='/.env' \
    --exclude='/.env.local' \
    --exclude='/.env.*.local' \
    --exclude='/.git/' \
    --exclude='/tsconfig.tsbuildinfo' \
    --exclude='.DS_Store' \
    "$ROOT/" "$TARGET:$REMOTE_DIR/"
  ok "files copied"

  step "Deploying on the server"
  args=(--no-pull)
  [ "$DO_BACKUP" = 1 ] || args+=(--no-backup)
  exec ssh -t "$TARGET" "cd '$REMOTE_DIR' && bash scripts/deploy.sh ${args[*]}"
fi

# ====================================================================================================================
# Mode 2 — on the server.
# ====================================================================================================================

# Read KEY from .env without executing it (values may contain "$"). Handles quotes and inline " # comments".
env_get() {
  local v
  v="$(grep -E "^[[:space:]]*$1=" .env 2>/dev/null | tail -n 1 | sed -E "s/^[[:space:]]*$1=//")" || true
  case "$v" in
    \"*) v="${v#\"}"; v="${v%%\"*}" ;;
    \'*) v="${v#\'}"; v="${v%%\'*}" ;;
    *) v="$(printf '%s' "$v" | sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//')" ;; # drop "  # comment"
  esac
  printf '%s' "$v"
}

wait_healthy() {
  local id status="starting" i
  for i in $(seq 1 60); do
    id="$(docker compose ps -q web 2>/dev/null || true)"
    if [ -n "$id" ]; then
      status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo starting)"
    fi
    case "$status" in
      healthy) return 0 ;;
      unhealthy | exited | dead) return 1 ;;
    esac
    printf '.'
    sleep 3
  done
  return 1
}

step "Checking the server"
command -v docker >/dev/null 2>&1 || die "Docker is not installed — follow docs/DEPLOY.md §5."
docker compose version >/dev/null 2>&1 || die "the docker compose plugin is missing — follow docs/DEPLOY.md §5."
docker info >/dev/null 2>&1 || die "cannot talk to Docker. Is your user in the 'docker' group? (log out and back in after adding it)"
[ -f docker-compose.yml ] && [ -f Dockerfile ] && [ -f Caddyfile ] || die "run this inside the project folder."
[ -f .env ] || die ".env is missing — create it: cp .env.example .env && nano .env   (docs/DEPLOY.md §7)"

secret="$(env_get SESSION_SECRET)"
[ "${#secret}" -ge 32 ] || warn "SESSION_SECRET is empty or shorter than 32 characters → admin login is disabled. Generate one: openssl rand -base64 48"
[ -n "$(env_get ADMIN_EMAIL)" ] || warn "ADMIN_EMAIL is empty → admin login is disabled."
hash_line="$(grep -E '^[[:space:]]*ADMIN_PASSWORD_HASH=' .env | tail -n 1 || true)"
hash_val="$(env_get ADMIN_PASSWORD_HASH)"
if [ -z "$hash_val" ]; then
  warn "ADMIN_PASSWORD_HASH is empty → admin login is disabled. See docs/DEPLOY.md §7."
else
  case "$hash_line" in
    *"='"* | *'$$'*) ;; # single-quoted or $$-escaped raw hash: fine
    *'$2'*) warn "ADMIN_PASSWORD_HASH is a raw bcrypt hash: docker compose will mangle its \$ signs and login will fail. Use the base64: form (docs/DEPLOY.md §7)." ;;
  esac
fi
domain="$(env_get DOMAIN)"
case "$domain" in
  "") ok "phase 1: no DOMAIN set — the site answers on http://<server IP>" ;;
  *://* | */* | www.*) die "DOMAIN must be the bare domain, e.g. DOMAIN=onde.tn (no https://, no www, no slash)." ;;
  *) ok "phase 2: HTTPS for $domain, www.$domain and admin.$domain" ;;
esac
base_url="$(env_get PUBLIC_BASE_URL)"
case "$base_url" in
  https://*) ;;
  "") warn "PUBLIC_BASE_URL is empty — smart links will default to https://onde.tn" ;;
  *) warn "PUBLIC_BASE_URL should start with https:// (it is what gets written on the NFC chips)." ;;
esac
if command -v free >/dev/null 2>&1; then
  mem_mb="$(free -m | awk '/^Mem:/ {print $2}')"
  swap_mb="$(free -m | awk '/^Swap:/ {print $2}')"
  if [ "${mem_mb:-0}" -lt 3500 ] && [ "${swap_mb:-0}" -lt 1024 ]; then
    warn "only ${mem_mb} MB RAM and no swap: the build may run out of memory. Add swap first (docs/DEPLOY.md §4)."
  fi
fi
ok "configuration looks fine"

if [ "$DO_PULL" = 1 ] && [ -d .git ] && git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  step "Updating the code (git pull)"
  git pull --ff-only || die "git pull failed (local changes on the server?). Fix it, or deploy with --no-pull."
  ok "code is at $(git log -1 --format='%h %s')"
fi

if [ "$DO_BACKUP" = 1 ] && [ -n "$(docker compose ps --status running -q web 2>/dev/null)" ]; then
  step "Backing up the database"
  # "| cat": not a terminal for backup.sh, so it skips its crontab hint here.
  bash scripts/backup.sh | cat || die "backup failed — nothing was changed. Fix it or deploy with --no-backup."
fi

step "Building the new version (first time: 5–10 minutes)"
docker compose pull --quiet caddy
docker compose build --pull web

step "Starting it"
docker compose up -d --remove-orphans
printf 'waiting for the app to be healthy'
if wait_healthy; then
  echo
  ok "the app is healthy"
else
  echo
  warn "the app did not become healthy. Last log lines:"
  docker compose logs --tail=60 web || true
  die "deploy finished but the app is NOT healthy — see the logs above and docs/DEPLOY.md §15 (troubleshooting)."
fi

step "Checking through Caddy"
if [ -z "$domain" ]; then
  if curl -fsS --max-time 10 -o /dev/null http://127.0.0.1/api/health; then ok "http://<server IP> answers"; else warn "Caddy does not answer on port 80 yet — docker compose logs caddy"; fi
else
  if curl -fsS --max-time 15 -o /dev/null --resolve "$domain:443:127.0.0.1" "https://$domain/api/health"; then
    ok "https://$domain answers with a valid certificate"
  else
    warn "https://$domain does not answer yet. Right after setting DOMAIN, Caddy needs ~1 minute to get the certificate;"
    warn "check the DNS (dig +short $domain) and: docker compose logs --tail=50 caddy"
  fi
fi

step "Cleaning up old images"
docker image prune -f >/dev/null || true
docker builder prune -f --filter until=168h >/dev/null 2>&1 || true
ok "done"

echo
if [ -n "$domain" ]; then
  echo "  Site       https://$domain"
  echo "  Dashboard  https://admin.$domain   (or https://$domain/admin)"
else
  ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}' || true)"
  echo "  Site       http://${ip:-<server IP>}"
  echo "  Dashboard  via the SSH tunnel: http://localhost:8080/admin   (docs/DEPLOY.md §9)"
fi
echo "  Logs       docker compose logs -f web"
