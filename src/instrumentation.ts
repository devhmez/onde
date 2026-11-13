// Runs once when a Next.js server instance starts: open the SQLite database, apply pending migrations and run the
// idempotent catalog/settings seed, so a fresh Docker volume is ready before the first request.
// `next build` may load instrumentation in its workers — never create or migrate a database during the image build.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { bootstrapDatabase } = await import("./db");
    try {
      const { file, seed } = bootstrapDatabase();
      const seeded =
        seed && (seed.productsInserted || seed.settingsInserted)
          ? ` · seeded ${seed.productsInserted} products, ${seed.settingsInserted} settings`
          : "";
      console.log(`[onde] database ready (${file})${seeded}`);
    } catch (err) {
      console.error("[onde] database bootstrap failed — check DATABASE_PATH permissions and that ./drizzle ships with the app", err);
      throw err;
    }
  }
}
