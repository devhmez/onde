// SQLite connection (better-sqlite3 + drizzle-orm). One connection per server process, HMR-safe via globalThis.
// The connection is opened lazily on first use, so importing this module (e.g. while `next build` collects route
// modules) never touches the disk. The first open applies pending migrations and the idempotent seed.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import * as schema from "./schema";
import { applyMigrations } from "./migrate";
import { seedDatabase, type SeedResult } from "./seed";

export type DB = BetterSQLite3Database<typeof schema>;
/** The database or a transaction handle (`db.transaction((tx) => …)`) — both run queries synchronously. */
export type Executor = BaseSQLiteDatabase<"sync", Database.RunResult, typeof schema>;
export { schema };

type Holder = { sqlite: Database.Database; db: DB; ready: boolean; file: string };
const globalForDb = globalThis as unknown as { __ondeDb?: Holder; __ondeDbExitHook?: boolean };

/** Absolute DB file path: $DATABASE_PATH (default ./data/onde.db, relative to the working directory). */
export function databasePath(): string {
  const configured = process.env.DATABASE_PATH?.trim() || "./data/onde.db";
  // turbopackIgnore: a runtime-configured path must not make the file tracer copy the whole project into standalone.
  return configured === ":memory:" ? configured : path.resolve(/*turbopackIgnore: true*/ process.cwd(), configured);
}

function open(): Holder {
  const file = databasePath();
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  const db = drizzle(sqlite, { schema });
  if (!globalForDb.__ondeDbExitHook) {
    globalForDb.__ondeDbExitHook = true;
    process.once("exit", () => {
      try {
        globalForDb.__ondeDb?.sqlite.close();
      } catch {
        /* already closed */
      }
    });
  }
  return { sqlite, db, ready: false, file };
}

let lastSeed: SeedResult | null = null;

function holder(): Holder {
  let h = globalForDb.__ondeDb;
  if (!h) {
    h = open();
    globalForDb.__ondeDb = h;
  }
  if (!h.ready) {
    applyMigrations(h.db);
    lastSeed = seedDatabase(h.db);
    h.ready = true;
  }
  return h;
}

/** The drizzle database (migrated + seeded on first call). */
export function getDb(): DB {
  return holder().db;
}

/** Raw better-sqlite3 handle (for pragmas, backups, hand-written SQL). */
export function getSqlite(): Database.Database {
  return holder().sqlite;
}

/** Explicit boot step (src/instrumentation.ts): opens the DB, applies migrations, runs the idempotent seed. */
export function bootstrapDatabase(): { file: string; seed: SeedResult | null } {
  const h = holder();
  return { file: h.file, seed: lastSeed };
}

/**
 * Lazy proxy so modules can `import { db } from "../db"` without opening the database at import time.
 * Methods are bound to the real drizzle instance.
 */
export const db: DB = new Proxy({} as DB, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real) as unknown;
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(real) : value;
  },
  has(_target, prop) {
    return Reflect.has(getDb(), prop);
  },
});
