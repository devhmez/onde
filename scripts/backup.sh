#!/usr/bin/env bash
# ONDE — consistent SQLite backups (and restore) for the Docker deployment. Run it on the server, in the project folder.
#
#   scripts/backup.sh                   back up now → backups/onde-YYYYmmdd-HHMM.db.gz, delete backups older than 14 days
#   scripts/backup.sh list              show the existing backups
#   scripts/backup.sh restore FILE      put FILE back as the live database (asks first; takes a safety backup)
#   scripts/backup.sh cron              print the crontab line for an automatic nightly backup
#
# How: the copy is made INSIDE the app container with SQLite's online backup API (better-sqlite3 .backup()), so it is
# consistent even while customers are ordering. The copy is integrity-checked, gzipped and stored on the host.
# Options (environment variables): BACKUP_DIR (default: ./backups)  KEEP_DAYS (default: 14)  ASSUME_YES=1 (no prompt)
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
SERVICE="web"

die() { echo "backup.sh: $*" >&2; exit 1; }
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2; }

command -v docker >/dev/null 2>&1 || die "docker is not installed (see docs/DEPLOY.md)."
docker compose version >/dev/null 2>&1 || die "the docker compose plugin is missing (see docs/DEPLOY.md)."
[ -f "$ROOT/docker-compose.yml" ] || die "docker-compose.yml not found next to scripts/ — run this from the project."
[ -f "$ROOT/.env" ] || die ".env not found — create it first (cp .env.example .env)."
case "$KEEP_DAYS" in '' | *[!0-9]*) die "KEEP_DAYS must be a whole number of days." ;; esac
[ "$KEEP_DAYS" -ge 1 ] || die "KEEP_DAYS must be at least 1."

# --------------------------------------------------------------------------------------------------------------------
# JavaScript run inside the container (Node 22 + better-sqlite3 are in the image). Logs go to stderr; stdout carries
# only the database bytes (backup) so it can be piped straight into gzip on the host.

read -r -d '' JS_BACKUP <<'JS' || true
const fs = require("fs"), os = require("os"), path = require("path");
const Database = require("better-sqlite3");
const src = path.resolve("/app", process.env.DATABASE_PATH || "/app/data/onde.db");
const tmp = path.join(os.tmpdir(), `onde-backup-${process.pid}-${Date.now()}.db`);
const cleanup = () => { for (const s of ["", "-wal", "-shm", "-journal"]) fs.rmSync(tmp + s, { force: true }); };
const count = (db, t) => { try { return db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n; } catch { return "?"; } };
if (!fs.existsSync(src)) { console.error(`no database at ${src} yet (start the site once first)`); process.exit(3); }
(async () => {
  const live = new Database(src, { fileMustExist: true, timeout: 15000 });
  try { await live.backup(tmp); } finally { live.close(); }
  const copy = new Database(tmp, { fileMustExist: true });
  const check = copy.pragma("quick_check", { simple: true });
  copy.pragma("journal_mode = DELETE"); // self-contained single file, no -wal needed
  const summary = ["orders", "customers", "tags", "taps"].map((t) => `${t}=${count(copy, t)}`).join(" ");
  copy.close();
  if (check !== "ok") throw new Error(`integrity check of the copy failed: ${check}`);
  console.error(`snapshot ok (${(fs.statSync(tmp).size / 1024).toFixed(0)} KiB · ${summary})`);
  const rs = fs.createReadStream(tmp);
  rs.on("error", (e) => { cleanup(); console.error(e.message); process.exit(1); });
  rs.on("close", cleanup);
  rs.pipe(process.stdout);
})().catch((e) => { cleanup(); console.error(e && e.message ? e.message : e); process.exit(1); });
JS

read -r -d '' JS_RESTORE <<'JS' || true
const fs = require("fs"), path = require("path");
const Database = require("better-sqlite3");
const dst = path.resolve("/app", process.env.DATABASE_PATH || "/app/data/onde.db");
const tmp = `${dst}.restore-${process.pid}`;
const rmSet = (base) => { for (const s of ["-wal", "-shm", "-journal"]) fs.rmSync(base + s, { force: true }); };
const fail = (e) => { fs.rmSync(tmp, { force: true }); rmSet(tmp); console.error(e && e.message ? e.message : e); process.exit(1); };
fs.mkdirSync(path.dirname(dst), { recursive: true });
const out = fs.createWriteStream(tmp, { mode: 0o600 });
out.on("error", fail);
process.stdin.on("error", fail);
out.on("finish", () => {
  try {
    const db = new Database(tmp, { fileMustExist: true });
    const check = db.pragma("quick_check", { simple: true });
    if (check !== "ok") throw new Error(`the backup failed its integrity check: ${check}`);
    db.pragma("journal_mode = DELETE");
    let orders = "?";
    try { orders = db.prepare('SELECT COUNT(*) AS n FROM "orders"').get().n; } catch {}
    db.close();
    rmSet(tmp);
    rmSet(dst); // a stale -wal from the old database must never be replayed onto the restored one
    fs.renameSync(tmp, dst);
    console.error(`restored ${dst} (orders=${orders})`);
  } catch (e) { fail(e); }
});
process.stdin.pipe(out);
JS

# --------------------------------------------------------------------------------------------------------------------

web_running() { [ -n "$(docker compose ps --status running -q "$SERVICE" 2>/dev/null)" ]; }

# Run a command in the app container: `exec` when it runs, otherwise a throwaway container on the same data volume.
in_web() {
  if web_running; then
    docker compose exec -T "$SERVICE" "$@"
  else
    docker compose run --rm --no-deps -T "$SERVICE" "$@"
  fi
}

lock() {
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  if command -v flock >/dev/null 2>&1; then
    exec 9>"$BACKUP_DIR/.lock"
    flock -w 120 9 || die "another backup/restore is still running."
  fi
}

# backup [label] → prints the created file path on stdout. Exit 3 = there is no database yet.
backup() {
  local label="${1:-}" stamp out tmp magic rc=0
  stamp="$(date +%Y%m%d-%H%M)"
  out="$BACKUP_DIR/onde-${stamp}${label:+-$label}.db.gz"
  [ -e "$out" ] && out="$BACKUP_DIR/onde-${stamp}$(date +%S)${label:+-$label}.db.gz"
  tmp="$out.partial"
  rm -f "$tmp"
  in_web node -e "$JS_BACKUP" | gzip -9 >"$tmp" || rc=$?
  if [ "$rc" -ne 0 ]; then
    rm -f "$tmp"
    # With pipefail, node's "no database yet" exit code (3) comes through as rc.
    [ "$rc" -eq 3 ] && return 3
    die "backup failed (exit $rc) — check: docker compose ps; docker compose logs --tail=50 web"
  fi
  gzip -t "$tmp" 2>/dev/null || { rm -f "$tmp"; die "the compressed backup is corrupt — nothing was kept."; }
  magic="$(gzip -dc "$tmp" 2>/dev/null | head -c 15 || true)"
  [ "$magic" = "SQLite format 3" ] || { rm -f "$tmp"; die "the backup is not a SQLite database — nothing was kept."; }
  chmod 600 "$tmp" && mv -f "$tmp" "$out" || { rm -f "$tmp"; die "could not write $out"; }
  echo "$out"
}

prune() {
  local n
  n="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'onde-*.db.gz' -mtime +"$((KEEP_DAYS - 1))" -print | wc -l | tr -d ' ')"
  if [ "$n" -gt 0 ]; then
    find "$BACKUP_DIR" -maxdepth 1 -type f -name 'onde-*.db.gz' -mtime +"$((KEEP_DAYS - 1))" -delete
    log "deleted $n backup(s) older than $KEEP_DAYS days"
  fi
  find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.partial' -mmin +60 -delete 2>/dev/null || true
}

cron_line() {
  echo "15 3 * * * cd '$ROOT' && ./scripts/backup.sh >> '$BACKUP_DIR/backup.log' 2>&1"
}

cmd_backup() {
  lock
  local file rc=0
  log "backing up the ONDE database…"
  file="$(backup)" || rc=$?
  if [ "$rc" -eq 3 ]; then
    log "nothing to back up yet: the database does not exist (start the site once: docker compose up -d)."
    exit 0
  fi
  [ "$rc" -eq 0 ] || exit "$rc"
  log "saved $file ($(du -h "$file" | cut -f1))"
  prune
  if [ -t 1 ]; then
    echo
    echo "Automatic nightly backup at 03:15 — run 'crontab -e' and add this line:"
    echo "  $(cron_line)"
    echo "Copy backups off the server regularly too (see docs/DEPLOY.md → Backups)."
  fi
}

cmd_list() {
  mkdir -p "$BACKUP_DIR"
  if ! ls "$BACKUP_DIR"/onde-*.db.gz >/dev/null 2>&1; then
    echo "No backups yet in $BACKUP_DIR"
    return 0
  fi
  ls -lh "$BACKUP_DIR"/onde-*.db.gz | awk '{print $5"\t"$6" "$7" "$8"\t"$9}'
}

wait_healthy() {
  local id status i
  for i in $(seq 1 60); do
    id="$(docker compose ps -q "$SERVICE" 2>/dev/null || true)"
    status="$([ -n "$id" ] && docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo starting)"
    [ "$status" = "healthy" ] && return 0
    sleep 3
  done
  return 1
}

cmd_restore() {
  local file="${1:-}" magic answer safety rc=0
  [ -n "$file" ] || die "usage: scripts/backup.sh restore backups/onde-YYYYmmdd-HHMM.db.gz"
  [ -f "$file" ] || die "file not found: $file"
  local -a reader
  case "$file" in
    *.gz)
      gzip -t "$file" 2>/dev/null || die "$file is not a valid .gz file."
      reader=(gzip -dc "$file")
      ;;
    *) reader=(cat "$file") ;;
  esac
  magic="$("${reader[@]}" 2>/dev/null | head -c 15 || true)"
  [ "$magic" = "SQLite format 3" ] || die "$file is not a SQLite database."

  echo "This REPLACES the live ONDE database with: $file"
  echo "Orders, customers and smart-link changes made after that backup will be lost (a safety copy is taken first)."
  if [ "${ASSUME_YES:-}" != "1" ]; then
    read -r -p "Type RESTORE to continue: " answer
    [ "$answer" = "RESTORE" ] || die "cancelled — nothing changed."
  fi

  lock
  log "safety backup of the current database…"
  safety="$(backup pre-restore)" || rc=$?
  case "$rc" in
    0) log "safety copy: $safety" ;;
    3) log "no current database — nothing to save first." ;;
    *) die "could not take the safety backup — restore cancelled." ;;
  esac

  log "stopping the site…"
  docker compose stop "$SERVICE" >/dev/null
  log "restoring…"
  if ! "${reader[@]}" | docker compose run --rm --no-deps -T "$SERVICE" node -e "$JS_RESTORE"; then
    log "restore FAILED — the previous database is untouched. Starting the site again…"
    docker compose up -d "$SERVICE" >/dev/null
    exit 1
  fi
  log "starting the site…"
  docker compose up -d "$SERVICE" >/dev/null
  if wait_healthy; then
    log "done — the site is healthy and runs on the restored data."
  else
    log "the site did not become healthy within 3 minutes — check: docker compose logs --tail=100 web"
    [ -n "$safety" ] && log "to go back: scripts/backup.sh restore $safety"
    exit 1
  fi
}

case "${1:-backup}" in
  backup | now) cmd_backup ;;
  list | ls) cmd_list ;;
  restore) shift; cmd_restore "${1:-}" ;;
  cron) cron_line ;;
  -h | --help | help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//' ;;
  *) die "unknown command '$1' (try: backup, list, restore FILE, cron)" ;;
esac
