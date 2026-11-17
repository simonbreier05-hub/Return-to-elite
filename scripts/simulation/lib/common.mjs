// Simulation „5 Hoteltage“ — gemeinsame Pfade und Test-Uhr (nur Test-Gerüst, kein App-Code).
import fs from "node:fs";
import path from "node:path";

export const ROOT = process.cwd();
export const RUN_DATE = process.env.SIM_RUN || "2026-11-14";
export const RUN = path.join(ROOT, "tests", "simulation", "runs", RUN_DATE);
export const STATE = path.join(RUN, "state");
export const DB_FILE = path.join(STATE, "sim.db");
export const DB_URL = "file:" + DB_FILE.split(path.sep).join("/");
export const CLOCK_FILE = path.join(STATE, "clock.json");
export const PORT = 3100;
export const UI_PORT = 4777;
export const BASE = `http://localhost:${PORT}`;
export const DAYS = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"];

export const offsetMs = () => { try { return JSON.parse(fs.readFileSync(CLOCK_FILE, "utf8")).offsetMs || 0; } catch { return 0; } };
export const simNow = () => new Date(Date.now() + offsetMs());
/** „2026-11-16 09:00“ (Berlin). */
export const simStamp = (d = simNow()) => d.toLocaleString("sv-SE", { timeZone: "Europe/Berlin" }).slice(0, 16);
export const simDay = () => { const i = DAYS.indexOf(simStamp().slice(0, 10)); return i >= 0 ? i + 1 : 0; };
export const dayDir = () => { const p = path.join(RUN, `tag-${simDay() || "x"}`); fs.mkdirSync(path.join(p, "raw"), { recursive: true }); fs.mkdirSync(path.join(p, "screens"), { recursive: true }); return p; };
/** Berliner Winterzeit (November) = UTC+1. */
export const parseBerlin = (s) => Date.parse(s.replace(" ", "T") + ":00+01:00");
