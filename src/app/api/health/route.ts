// GET /api/health — liveness + database probe used by the Docker HEALTHCHECK, docker-compose.yml and
// scripts/deploy.sh. Healthy → 200 { ok: true, db: true, time }. If SQLite cannot answer `SELECT 1` → 503
// { ok: false, db: false, time } so Docker marks the container unhealthy. Never cached, no cookies, no PII.
import { getSqlite } from "@/db";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function databaseAnswers(): boolean {
  try {
    const row = getSqlite().prepare("SELECT 1 AS ok").get() as { ok?: number } | undefined;
    return row?.ok === 1;
  } catch (err) {
    console.error("[onde] health check: database unavailable —", err instanceof Error ? err.message : err);
    return false;
  }
}

export async function GET() {
  const db = databaseAnswers();
  const time = new Date().toISOString();
  return Response.json({ ok: db, db, time }, { status: db ? 200 : 503, headers: NO_STORE });
}
