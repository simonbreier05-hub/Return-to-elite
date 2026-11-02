/**
 * Playwright-Nachweis Styleguide „Glas & Premium“ (Paket D0): Screenshots von /dev/styleguide
 * bei 390, 800, 1024, 1280 und 1672 px — ganze Seite + jedes Brett einzeln (zum Vergleich mit Figma).
 * Prüft außerdem: keine waagrechte Scroll-Leiste der Seite, Schriften geladen, Fokusring sichtbar.
 *
 * Kein Teil von `npm test` (braucht laufenden Server, keine Datenbank nötig):
 *   npx next dev -p 3100            (oder ALLOW_DEV_LOGIN=true npm run dev)
 *   BASE_URL=http://localhost:3100 SHOT_DIR=/tmp/shots node tests/e2e/styleguide.e2e.mjs
 * Screenshots nie in den Projektordner schreiben (nicht einchecken; Hot-Reload).
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOT_DIR = process.env.SHOT_DIR ?? path.join(os.tmpdir(), "styleguide-shots");
const WIDTHS = (process.env.WIDTHS ?? "390x844,800x1280,1024x768,1280x800,1672x941").split(",").map((s) => s.split("x").map(Number));
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); }

mkdirSync(SHOT_DIR, { recursive: true });
const browser = await pw.chromium.launch();
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) failed++; };

for (const [w, h] of WIDTHS) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
  const res = await page.goto(`${BASE}/dev/styleguide`, { waitUntil: "networkidle" });
  check(res?.status() === 200, `${w}px: Seite lädt (${res?.status()})`);
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family} ${f.weight}`));
  check(fonts.some((f) => f.includes("SC Lora")) && fonts.some((f) => f.includes("SC Inter")), `${w}px: Lora + Inter geladen (${fonts.filter((f) => f.includes("SC ")).join(", ")})`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, `${w}px: keine waagrechte Scroll-Leiste (Überstand ${overflow}px)`);
  await page.screenshot({ path: path.join(SHOT_DIR, `styleguide-${w}.png`), fullPage: true });
  for (const board of await page.locator("[data-board]").all()) {
    const id = await board.getAttribute("data-board");
    await board.screenshot({ path: path.join(SHOT_DIR, `board-${id}-${w}.png`) });
  }
  if (w === 1280) {
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    check(outline === "solid", `Fokusring sichtbar (${outline})`);
  }
  await page.close();
}
await browser.close();
console.log(`Screenshots: ${SHOT_DIR}`);
process.exit(failed ? 1 : 0);
