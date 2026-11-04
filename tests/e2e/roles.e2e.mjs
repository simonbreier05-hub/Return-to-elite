/**
 * Playwright-Nachweis Rollen-Hubs (D5) auf /dev/roles (erfundene Testdaten, ohne Anmeldung, ohne API):
 * Techniker, Hausmann, Front Office, Concierge je Breite — Liste, Detail als Panel (≥ 1280) / Einschub (640–1279) /
 * Sheet (< 640), keine waagrechte Scroll-Leiste, Tippflächen ≥ 48 px, kein backdrop-filter, Pillen mit Text,
 * Lade-/Fehler-/Leerzustand, Bestätigungsdialog „Wirklich erledigt?“. Screenshots je Breite nach SHOT_DIR.
 *
 * Kein Teil von `npm test` (braucht laufenden Server; Screenshots nie in den Projektordner, solange `npm run dev` läuft):
 *   npm run build && ENABLE_STYLEGUIDE=1 npm start
 *   BASE_URL=http://localhost:3000 SHOT_DIR=/tmp/roles-shots node tests/e2e/roles.e2e.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOT_DIR = process.env.SHOT_DIR ?? path.join(os.tmpdir(), "roles-shots");
// Figma-Größen: Handy 390×844, Tablet hoch 800×1280, Tablet klein 1024×768, Tablet quer 1280×800, Desktop 1672×941
const SIZES = [[390, 844], [800, 1280], [1024, 768], [1280, 800], [1672, 941]];
const ROLES = [
  { role: "engineering", hub: "engineering-hub", detail: "eng-detail", rows: 5 },
  { role: "houseman", hub: "houseman-hub", detail: "hm-detail", rows: 7 },
  { role: "front_office", hub: "front-office-hub", detail: "fo-detail", rows: 5 },
  { role: "concierge", hub: "concierge-hub", detail: "cc-detail", rows: 4 },
];
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); }
mkdirSync(SHOT_DIR, { recursive: true });
const browser = await pw.chromium.launch();
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) failed++; };

const smallTargets = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("main button, main a, [role=dialog] button")]
      .filter((b) => b.getClientRects().length > 0)
      .map((b) => ({ t: (b.textContent || b.getAttribute("aria-label") || "").trim().slice(0, 30), h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) }))
      .filter((b) => b.h < 48 || b.w < 44),
  );

for (const [w, h] of SIZES) {
  const mode = w >= 1280 ? "wide" : w >= 640 ? "tablet" : "phone";
  for (const r of ROLES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce", locale: "de-DE", timezoneId: "Europe/Berlin" });
    const page = await ctx.newPage();
    const tag = `${r.role} ${w}px`;

    await page.goto(`${BASE}/dev/roles?role=${r.role}&detail=0`, { waitUntil: "networkidle" });
    await page.waitForSelector(`[data-testid=${r.hub}]`);
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOT_DIR, `${r.role}-${w}x${h}-list.png`) });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(overflow <= 0, `${tag}: keine waagrechte Scroll-Leiste (${overflow})`);
    const rows = await page.locator("main [data-row]").count();
    check(rows === r.rows, `${tag}: ${r.rows} Zeilen (${rows})`);
    const small = await smallTargets(page);
    check(small.length === 0, `${tag}: Tippflächen ≥ 48 px (${JSON.stringify(small.slice(0, 4))})`);
    const blur = await page.evaluate(() => [...document.querySelectorAll("main *")].some((el) => { const s = getComputedStyle(el); return (s.backdropFilter && s.backdropFilter !== "none") || (s.filter && s.filter.includes("blur")); }));
    check(!blur, `${tag}: kein Blur`);
    const emptyPills = await page.evaluate(() => [...document.querySelectorAll("main [data-row] .rounded-pill")].filter((p) => !(p.textContent || "").trim()).length);
    check(emptyPills === 0, `${tag}: jede Pille hat Text (Status nie nur Farbe)`);

    // Detail öffnen: erste Zeile antippen
    await page.locator("main [data-row] button").first().click();
    await page.waitForSelector(`[data-testid=${r.detail}]`);
    await page.waitForTimeout(300);
    const inDialog = await page.locator(`[role=dialog] [data-testid=${r.detail}]`).count();
    check(mode === "wide" ? inDialog === 0 : inDialog === 1, `${tag}: Detail als ${mode === "wide" ? "Panel" : mode === "tablet" ? "Einschub" : "Sheet"}`);
    await page.screenshot({ path: path.join(SHOT_DIR, `${r.role}-${w}x${h}-detail.png`) });
    const smallD = await smallTargets(page);
    check(smallD.length === 0, `${tag}: Tippflächen im Detail ≥ 48 px (${JSON.stringify(smallD.slice(0, 4))})`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    check((await page.locator(`[data-testid=${r.detail}]`).count()) === 0, `${tag}: Escape schließt das Detail`);

    if (w === 1280) {
      for (const state of ["loading", "error", "empty"]) {
        await page.goto(`${BASE}/dev/roles?role=${r.role}&state=${state}`, { waitUntil: "networkidle" });
        check((await page.locator(`[data-testid=role-${state}]`).count()) === 1, `${tag}: Zustand ${state}`);
      }
    }
    await ctx.close();
  }
}

// Bestätigungsdialog (Figma 36:2364)
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce", locale: "de-DE" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dev/roles?role=engineering&confirm=1`, { waitUntil: "networkidle" });
  const dlg = page.locator("[role=dialog]");
  check((await dlg.count()) === 1 && (await dlg.textContent()).includes("Wirklich erledigt?"), "Techniker: Bestätigungsdialog sichtbar");
  await page.screenshot({ path: path.join(SHOT_DIR, "engineering-confirm.png") });
  await page.keyboard.press("Escape");
  check((await page.locator("[role=dialog]").count()) === 0, "Techniker: Escape = Abbrechen");
  await ctx.close();
}

await browser.close();
console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : "\nalle Prüfungen ok");
process.exit(failed ? 1 : 0);
