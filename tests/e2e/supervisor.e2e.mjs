/**
 * Playwright-Nachweis Supervisor-Seiten (D3): Übersicht `/supervisor` und Tagesplanung `/floor-plan` mit erfundenen
 * Daten aus `scripts/e2e-supervisor-setup.ts` (lokale SQLite). Je Breite: keine waagrechte Scroll-Leiste, kein
 * backdrop-filter, Tippflächen der neuen Bausteine ≥ 48 px, Person antippen zeigt Zimmer-Gruppen, Zimmer antippen
 * öffnet das Detail, Goldrahmen bei offenen Zimmern, Zwei-Tap-Zuteilung (HK → Zimmer) speichert, Handy = Hinweis.
 * Screenshots je Breite nach SHOT_DIR (für den Vergleich mit Figma).
 *
 * Kein Teil von `npm test` (braucht laufenden Server):
 *   DATABASE_URL=file:./e2e-d3.db npx prisma db push && npx tsx prisma/seed.ts && npx tsx scripts/e2e-supervisor-setup.ts
 *   DATABASE_URL=file:./e2e-d3.db ALLOW_DEV_LOGIN=true npm run dev
 *   BASE_URL=http://localhost:3000 SHOT_DIR=/tmp/sup-shots node tests/e2e/supervisor.e2e.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOT_DIR = process.env.SHOT_DIR ?? path.join(os.tmpdir(), "sup-shots");
// Figma-Größen: Handy 390×844, Tablet hoch 800×1280, Tablet klein 1024×768, Tablet quer 1280×800, Desktop 1672×941
const SIZES = [[390, 844], [800, 1280], [1024, 768], [1280, 800], [1672, 941]];
const require = createRequire(import.meta.url);
const pw = require("playwright");
mkdirSync(SHOT_DIR, { recursive: true });
const browser = await pw.chromium.launch();
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) failed++; };

async function login(ctx) {
  const res = await ctx.request.post(`${BASE}/api/auth/dev-login`, { data: { email: "supervisor@hotel.test" } });
  if (!res.ok()) throw new Error(`login ${res.status()}`);
}
const settle = async (page) => {
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.waitForTimeout(700);
};
const common = async (page, w, label) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, `${label} ${w}px: keine waagrechte Scroll-Leiste (${overflow})`);
  const blur = await page.evaluate(() => [...document.querySelectorAll("main *")].filter((e) => getComputedStyle(e).backdropFilter !== "none").length);
  check(blur === 0, `${label} ${w}px: kein backdrop-filter (${blur})`);
  // Nur Glas-Bereiche prüfen (alte Bausteine auf heller Fläche sind noch nicht umgestellt)
  const small = await page.evaluate(() =>
    [...document.querySelectorAll(".theme-glass button, .theme-glass a")]
      .filter((b) => !b.closest(".bg-ivory") && b.getClientRects().length > 0)
      .map((b) => ({ t: (b.textContent || b.getAttribute("aria-label") || "").trim().slice(0, 24), h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) }))
      .filter((b) => b.h < 48 || b.w < 44),
  );
  check(small.length === 0, `${label} ${w}px: Tippflächen ≥ 48 px (${JSON.stringify(small.slice(0, 4))})`);
};

for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce", locale: "de-DE", deviceScaleFactor: 1 });
  await login(ctx);
  const page = await ctx.newPage();

  // ── Übersicht ──
  await page.goto(`${BASE}/supervisor`, { waitUntil: "networkidle" });
  await page.locator("[aria-labelledby=sup-team-title] [role=listitem] button").first().waitFor({ timeout: 60_000 });
  await settle(page);
  await page.screenshot({ path: path.join(SHOT_DIR, `sup-${w}x${h}-overview.png`) });
  await common(page, w, "Übersicht");
  const tiles = await page.locator("[aria-labelledby=sup-team-title] [role=listitem] button").count();
  check(tiles === 5, `Übersicht ${w}px: 5 Kacheln in „Team heute“ (${tiles})`);
  await page.locator("[aria-labelledby=sup-team-title] [role=listitem] button").first().click();
  const groups = await page.locator("[aria-labelledby=sup-team-title] [role=region] h3").allTextContents();
  check(groups.length >= 2, `Übersicht ${w}px: Person antippen zeigt Gruppen (${groups.join(" | ")})`);
  await settle(page);
  await page.screenshot({ path: path.join(SHOT_DIR, `sup-${w}x${h}-person.png`) });
  await page.locator("[aria-labelledby=sup-team-title] [role=region] button").first().click();
  const detail = page.getByRole("heading", { name: /^Zimmer \d+/ });
  await detail.first().waitFor();
  check(await detail.first().isVisible(), `Übersicht ${w}px: Zimmer antippen öffnet das Detail`);
  await settle(page);
  await page.screenshot({ path: path.join(SHOT_DIR, `sup-${w}x${h}-detail.png`) });
  await page.keyboard.press("Escape");

  // ── Tagesplanung ──
  await page.goto(`${BASE}/floor-plan`, { waitUntil: "networkidle" });
  await settle(page);
  if (w < 640) {
    check(await page.getByText("Planung am Tablet oder Desktop").isVisible(), `Tagesplanung ${w}px: Hinweis „am Tablet“`);
    await page.screenshot({ path: path.join(SHOT_DIR, `plan-${w}x${h}.png`) });
  } else {
    await page.getByRole("heading", { name: "Zuteilung" }).waitFor({ timeout: 60_000 });
    await page.locator('[aria-label*="Zuteilung offen"]').first().waitFor({ timeout: 60_000 });
    await page.getByRole("button", { name: /^Etage 3$/ }).click();
    await settle(page);
    await page.screenshot({ path: path.join(SHOT_DIR, `plan-${w}x${h}.png`) });
    await common(page, w, "Tagesplanung");
    const open = await page.locator('[aria-label*="Zuteilung offen"]').count();
    check(open > 0, `Tagesplanung ${w}px: offene Zimmer mit Goldrahmen-Text (${open})`);
    if (w === 1280) {
      // Zwei-Tap: Kraft wählen, dann ein offenes Zimmer antippen → ist danach zugeteilt (Server)
      await page.getByRole("button", { name: /^Petra Novak \d/ }).click();
      const target = page.locator('[aria-label*="Zuteilung offen"]').first();
      const number = (await target.getAttribute("aria-label")).split(",")[0];
      await target.click();
      // Server-Stand abfragen (erster Aufruf kompiliert im Dev-Modus die Route — daher bis 10 s warten)
      const roomNow = async () => (await (await ctx.request.get(`${BASE}/api/rooms?allFloors=1`)).json()).rooms.find((r) => r.number === number);
      let room = await roomNow();
      for (let i = 0; i < 20 && room?.assignedTo?.name !== "Petra Novak"; i++) { await page.waitForTimeout(500); room = await roomNow(); }
      check(room?.assignedTo?.name === "Petra Novak", `Tagesplanung: Zwei-Tap teilt ${number} Petra zu (${room?.assignedTo?.name})`);
      await settle(page);
      await page.screenshot({ path: path.join(SHOT_DIR, `plan-${w}x${h}-active.png`) });
      // zurück: wieder entfernen (Sitzungs-Chip)
      await page.getByRole("button", { name: `${number} entfernen` }).click();
      let back = await roomNow();
      for (let i = 0; i < 20 && back?.assignedTo; i++) { await page.waitForTimeout(500); back = await roomNow(); }
      check(!back?.assignedTo, `Tagesplanung: Entfernen gibt ${number} wieder frei`);
    }
  }
  await ctx.close();
}
await browser.close();
console.log(failed ? `${failed} Prüfungen fehlgeschlagen` : "alle Prüfungen ok");
process.exit(failed ? 1 : 0);
