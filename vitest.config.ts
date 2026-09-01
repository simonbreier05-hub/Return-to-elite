import { defineConfig } from "vitest/config";
import path from "path";

// Pinned before the worker pool spawns (workers inherit process.env at
// creation time), so every test file's `@/lib/db` import — and anything
// that imports it — resolves against this scratch database, never the
// developer's real dev.db. tests/setup/globalSetup.ts pushes the schema
// into it once before the suite runs.
process.env.DATABASE_URL = `file:${path.resolve(__dirname, "prisma", "test.db")}`;

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/setup/globalSetup.ts"],
    // Every DB-backed test shares one scratch sqlite file (see globalSetup),
    // and several files reset it wholesale (resetDb) — running test files
    // in parallel would let one file's reset race another's fixtures.
    // Predictable beats fast for a 130-odd-test suite.
    fileParallelism: false,
  },
});
