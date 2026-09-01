import { execSync } from "child_process";
import { existsSync, rmSync } from "fs";
import path from "path";

/**
 * Runs once, before any test file, in the main Vitest process. The scratch
 * sqlite database path is fixed by vitest.config.ts (which sets
 * DATABASE_URL before the worker pool spawns, so every test file's
 * `@/lib/db` import already points here) — this just makes sure the schema
 * actually exists in that file before anything queries it.
 */
const TEST_DB_PATH = path.resolve(__dirname, "..", "..", "prisma", "test.db");

export default function globalSetup() {
  execSync("npx prisma db push --schema prisma/schema.prisma --skip-generate --accept-data-loss", {
    cwd: path.resolve(__dirname, "..", ".."),
    env: { ...process.env, DATABASE_URL: `file:${TEST_DB_PATH}` },
    stdio: "pipe",
  });

  return () => {
    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
      const file = TEST_DB_PATH + suffix;
      if (existsSync(file)) rmSync(file);
    }
  };
}
