/**
 * Playwright-Nachweis Housekeeper-Hub (D2) auf /dev/housekeeper (erfundene Testdaten, ohne Anmeldung, ohne API):
 * je Breite Kennzahlen, Liste, Detail als Panel (≥ 1280) / Einschub (640–1279) / Sheet (< 640), dritte Spalte ab 1600,
 * keine waagrechte Scroll-Leiste, Tippflächen ≥ 48 px, kein backdrop-filter, Status nie nur Farbe (Text/aria-label).
 * Screenshots je Breite nach SHOT_DIR (für den Vergleich mit Figma).
 *
 * Kein Teil von `npm test` (braucht laufenden Server):
 *   ALLOW_DEV_LOGIN=true npm run dev
 *   BASE_URL=http://localhost:3000 SHOT_DIR=/tmp/hk-shots node tests/e2e/housekeeper-hub.e2e.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOT_DIR = process.env.SHOT_DIR ?? path.join(os.tmpdir(), "hk-shots");
// Figma-Größen: Handy 390×844, Tablet hoch 800×1280, Tablet klein 1024×768, Tablet quer 1280×800, Desktop 1672×941
const SIZES = [[390, 844], [800, 1280], [1024, 768], [1280, 800], [1672, 941]];
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); }
mkdirSync(SHOT_DIR, { recursive: true });
const browser = await pw.chromium.launch();
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) failed++; };

for (const [w, h] of SIZES) {
  const mode = w >= 1280 ? "wide" : w >= 640 ? "tablet" : "phone";
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
  const page = await ctx.newPage();

  // 1) Liste ohne Detail
  await page.goto(`${BASE}/dev/housekeeper?detail=0`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-testid=hk-hub]");
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOT_DIR, `hk-${w}x${h}-list.png`) });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, `${w}px: keine waagrechte Scroll-Leiste (${overflow})`);
  const rows = await page.locator("main [data-room]").count();
  check(rows === 8, `${w}px: 8 Zimmerzeilen (${rows})`);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("main button, main a")]
      .filter((b) => b.getClientRects().length > 0)
      .map((b) => ({ t: (b.textContent || b.getAttribute("aria-label") || "").trim().slice(0, 30), h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) }))
      .filter((b) => b.h < 48 || b.w < 44),
  );
  check(small.length === 0, `${w}px: Tippflächen ≥ 48 px (${JSON.stringify(small.slice(0, 4))})`);
  const blur = await page.evaluate(() => [...document.querySelectorAll("main *")].filter((e) => getComputedStyle(e).backdropFilter !== "none").length);
  check(blur === 0, `${w}px: kein backdrop-filter (${blur})`);
  const statusText = await page.evaluate(() =>
    [...document.querySelectorAll("main [data-room]")].every((li) => /Offen|In Reinigung|Erledigt|DND|Pausiert|Mangel|Nachbessern/.test(li.textContent + " " + [...li.querySelectorAll("[aria-label]")].map((x) => x.getAttribute("aria-label")).join(" "))),
  );
  check(statusText, `${w}px: jeder Status als Text oder aria-label`);
  const third = await page.getByRole("heading", { name: "Nächste Zimmer" }).isVisible().catch(() => false);
  check(third === (w >= 1600), `${w}px: dritte Spalte „Nächste Zimmer“ ${w >= 1600 ? "sichtbar" : "verborgen"}`);
  const kpiLabel = mode === "phone" ? "Zimmer" : "Meine Zimmer"; // Handy: kurzes Label wie Figma `41:1899`
  const kpiVisible = await page.getByText(kpiLabel, { exact: true }).first().isVisible();
  check(kpiVisible, `${w}px: Kennzahl „${kpiLabel}“ sichtbar`);

  // 2) Zimmer antippen → Detail
  await page.locator("main [data-room='305'] button, main [data-room='305'] a, main [data-room='305'] [role=button]").first().click();
  await page.waitForTimeout(400);
  const detail = page.locator("[data-testid=hk-detail]");
  check(await detail.isVisible(), `${w}px: Detail nach Antippen sichtbar`);
  const placement = await page.evaluate(() => {
    const d = document.querySelector("[data-testid=hk-detail]");
    const inMain = !!d?.closest("main");
    const r = d?.getBoundingClientRect();
    return { inMain, right: Math.round(r?.right ?? 0), top: Math.round(r?.top ?? 0) };
  });
  if (mode === "wide") check(placement.inMain, `${w}px: Detail als Panel in der Seite`);
  else check(!placement.inMain, `${w}px: Detail als ${mode === "tablet" ? "Einschub" : "Sheet"} über der Seite`);
  const primary = await page.getByRole("button", { name: "Reinigung starten" }).isVisible();
  check(primary, `${w}px: Hauptknopf „Reinigung starten“`);
  const guest = await detail.getByText("Herr Carter · 1 Person").isVisible();
  check(guest, `${w}px: Gast als „Anrede Nachname · Personen“`);
  await page.screenshot({ path: path.join(SHOT_DIR, `hk-${w}x${h}-detail.png`) });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check(!(await detail.isVisible().catch(() => false)), `${w}px: Escape schließt das Detail`);

  // 3) Filter
  const turn = page.getByRole("button", { name: /^Turn \(\d+\)$/ });
  await turn.click();
  const turnRows = await page.locator("main [data-room]").count();
  check(turnRows === 3, `${w}px: Filter Turn zeigt 3 Zimmer (${turnRows})`);
  await ctx.close();
}

// 4) Leer- und Erledigt-Zustand (eine Breite)
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dev/housekeeper?empty=1`, { waitUntil: "networkidle" });
  check(await page.locator("[data-testid=hk-empty]").isVisible(), "Leer-Zustand sichtbar");
  await page.screenshot({ path: path.join(SHOT_DIR, "hk-1280x800-empty.png") });
  await page.goto(`${BASE}/dev/housekeeper?done=1&detail=0`, { waitUntil: "networkidle" });
  check(await page.getByText("Alles erledigt – danke!").isVisible(), "Zustand „alles erledigt“ sichtbar");
  await page.screenshot({ path: path.join(SHOT_DIR, "hk-1280x800-alldone.png") });
  await ctx.close();
}

await browser.close();
console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : "\nalle Prüfungen ok");
process.exit(failed ? 1 : 0);
