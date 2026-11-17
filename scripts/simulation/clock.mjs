// Simulation — Test-Uhr stellen:  node scripts/simulation/clock.mjs "2026-11-16 06:30"   |   … clock.mjs now
// Schreibt den Versatz für Server (Vorlade-Skript), Test-DB (Zeitstempel-Auslöser) und Browser der Agenten.
import fs from "node:fs";
import { createRequire } from "node:module";
import { CLOCK_FILE, DB_URL, UI_PORT, parseBerlin, simStamp } from "./lib/common.mjs";

const arg = process.argv[2];
if (!arg || arg === "now") { console.log(simStamp()); process.exit(0); }
const target = parseBerlin(arg);
if (Number.isNaN(target)) { console.error("Format: JJJJ-MM-TT HH:MM"); process.exit(1); }
const off = target - Date.now();
fs.writeFileSync(CLOCK_FILE, JSON.stringify({ offsetMs: off, gestellt: arg }));
process.env.DATABASE_URL = DB_URL;
const { PrismaClient } = createRequire(import.meta.url)("@prisma/client");
const p = new PrismaClient();
await p.$executeRawUnsafe(`UPDATE _sim_clock SET offsetMs = ${Math.round(off)} WHERE id = 1`);
await p.$disconnect();
await new Promise((r) => setTimeout(r, 350)); // Server liest die Uhr-Datei höchstens alle 200 ms
const ui = await fetch(`http://127.0.0.1:${UI_PORT}/clock`, { method: "POST" }).then((r) => r.text()).catch(() => "UI-Dienst läuft nicht");
console.log(`Test-Uhr: ${simStamp()} · ${ui}`);
