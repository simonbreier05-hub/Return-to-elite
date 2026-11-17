// Simulation: frische Test-Datenbank (SQLite-Datei nur für diesen Lauf) + Seed + Zeitstempel-Auslöser.
// Die Datenbank setzt createdAt/updatedAt selbst (echte Uhr). Damit sie zur Test-Uhr passen, verschieben
// Auslöser (Trigger) nur in dieser Test-DB frisch gesetzte Zeitstempel um den Uhr-Versatz.
import { execSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import { CLOCK_FILE, DB_FILE, DB_URL, STATE } from "./lib/common.mjs";

const require = createRequire(import.meta.url);
if (fs.existsSync(DB_FILE) && !process.argv.includes("--force")) { console.error("Test-DB existiert schon. Neu anlegen mit --force."); process.exit(1); }
fs.mkdirSync(STATE, { recursive: true });
for (const f of [DB_FILE, DB_FILE + "-journal"]) fs.rmSync(f, { force: true });
fs.writeFileSync(CLOCK_FILE, JSON.stringify({ offsetMs: 0 }));
const env = { ...process.env, DATABASE_URL: DB_URL };
execSync("npx prisma db push --skip-generate", { env, stdio: "inherit" });
execSync("npx tsx prisma/seed.ts", { env, stdio: "ignore" });

process.env.DATABASE_URL = DB_URL;
const { PrismaClient, Prisma } = require("@prisma/client");
const p = new PrismaClient();
const NOW = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
const OFF = "(SELECT offsetMs FROM _sim_clock)";
await p.$executeRawUnsafe("CREATE TABLE IF NOT EXISTS _sim_clock (id INTEGER PRIMARY KEY CHECK (id = 1), offsetMs INTEGER NOT NULL)");
await p.$executeRawUnsafe("INSERT OR REPLACE INTO _sim_clock VALUES (1, 0)");
let n = 0;
for (const m of Prisma.dmmf.datamodel.models) {
  const table = m.dbName ?? m.name;
  for (const f of m.fields) {
    const col = f.dbName ?? f.name;
    const near = `abs(NEW."${col}" - ${NOW}) < 120000`;
    if (f.default?.name === "now" || f.isUpdatedAt) {
      await p.$executeRawUnsafe(`CREATE TRIGGER "sim_i_${table}_${col}" AFTER INSERT ON "${table}" WHEN ${near} BEGIN UPDATE "${table}" SET "${col}" = NEW."${col}" + ${OFF} WHERE rowid = NEW.rowid; END`);
      n++;
    }
    if (f.isUpdatedAt) {
      await p.$executeRawUnsafe(`CREATE TRIGGER "sim_u_${table}_${col}" AFTER UPDATE ON "${table}" WHEN ${near} BEGIN UPDATE "${table}" SET "${col}" = NEW."${col}" + ${OFF} WHERE rowid = NEW.rowid; END`);
      n++;
    }
  }
}
const probe = await p.$queryRawUnsafe(`SELECT typeof("createdAt") AS t FROM "User" LIMIT 1`);
console.log(`Test-DB bereit: ${DB_FILE}\n${n} Zeitstempel-Auslöser, Speicherform createdAt = ${probe[0]?.t}`);
await p.$disconnect();
