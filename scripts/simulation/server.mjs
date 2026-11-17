// Simulation — startet die App (Produktions-Build) mit Test-DB und Test-Uhr auf Port 3100. Läuft im Vordergrund.
//   node scripts/simulation/server.mjs      (vorher: setup-db.mjs und einmal `npx next build`)
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CLOCK_FILE, DB_URL, PORT, ROOT, STATE } from "./lib/common.mjs";

const log = fs.createWriteStream(path.join(STATE, "server.log"), { flags: "a" });
const child = spawn(process.execPath, ["-r", path.join(ROOT, "scripts", "simulation", "lib", "clock-shim.cjs"), "server.js"], {
  cwd: ROOT,
  env: { ...process.env, SIM_CLOCK_FILE: CLOCK_FILE, DATABASE_URL: DB_URL, NODE_ENV: "production", ALLOW_DEV_LOGIN: "true", PORT: String(PORT) },
});
child.stdout.pipe(log); child.stderr.pipe(log);
child.on("exit", (code) => { console.log(`App beendet (${code})`); process.exit(code ?? 0); });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill());
console.log(`App startet auf http://localhost:${PORT} · DB ${DB_URL}`);
