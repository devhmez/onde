// drizzle-kit config — generates SQL migrations from src/db/schema.ts into ./drizzle.
//   npx drizzle-kit generate        (after editing the schema)
// Migrations are applied automatically on server start (src/instrumentation.ts → src/db).
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_PATH ?? "./data/onde.db" },
  strict: true,
  verbose: true,
});
