/**
 * Playwright-Nachweis Tagesplan (Plan-1) auf `/floor-plan` mit erfundenen Daten aus `scripts/e2e-tagesplan-setup.ts`
 * (lokale SQLite). Je Breite: keine waagrechte Scroll-Leiste, kein backdrop-filter, Tippflächen ≥ 48 px, Überlast-Hinweis,
 * Hinweis antippen → Kraft-Detail + Etage offen, immer nur eine Etage offen, Zimmer antippen → Zimmerfenster,
 * Zuteilen (Kraft → „Zimmer zuteilen“ → Zimmer) aktualisiert Zeile/Chips/Zähler ohne Neuladen, Zahlen stimmen überein.
 * Dazu iPad quer mit Touch. Unter 640 px nur der Hinweis „Planung am Tablet oder Desktop“.
 *
 * Kein Teil von `npm test` (braucht laufenden Server):
 *   DATABASE_URL=file:./e2e-tp.db npx prisma db push && npx tsx prisma/seed.ts && npx tsx scripts/e2e-tagesplan-setup.ts
 *   DATABASE_URL=file:./e2e-tp.db ALLOW_DEV_LOGIN=true PORT=3123 npm start
 *   BASE_URL=http://localhost:3123 SHOT_DIR=/tmp/tp-shots node tests/e2e/tagesplan.e2e.mjs
 * Setup vor jedem Lauf neu ausführen (der Lauf teilt Zimmer zu).
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOT_DIR = process.env.SHOT_DIR ?? path.join(os.tmpdir(), "tp-shots");
const SIZES = [[390, 844], [800, 1280], [1024, 600], [1280, 800], [1672, 941]];
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
const settle = async (page) => { await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }); await page.waitForTimeout(800); };
const common = async (page, w, label) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, `${label} ${w}px: keine waagrechte Scroll-Leiste (${overflow})`);
  const blur = await page.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => getComputedStyle(e).backdropFilter !== "none").length);
  check(blur === 0, `${label} ${w}px: kein backdrop-filter (${blur})`);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("main button, main a, main summary")]
      .filter((b) => b.getClientRects().length > 0 && b.closest("[data-tp]"))
      .map((b) => ({ t: (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 28), h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) }))
      .filter((b) => b.h < 48 || b.w < 44),
  );
  check(small.length === 0, `${label} ${w}px: Tippflächen im Tagesplan ≥ 48 px (${JSON.stringify(small.slice(0, 4))})`);
};
const statValue = (page, label) => page.locator("dl > div", { has: page.locator("dt", { hasText: new RegExp(`^${label}$`) }) }).locator("dd").first().textContent();

async function run(ctx, w, h, label, touch) {
  await login(ctx);
  const page = await ctx.newPage();
  const act = (loc) => (touch ? loc.tap() : loc.click());
  await page.goto(`${BASE}/floor-plan`, { waitUntil: "networkidle" });
  await settle(page);

  if (w < 640) {
    check(await page.getByText("Planung am Tablet oder Desktop").first().isVisible(), `${label} ${w}px: Hinweis „Planung am Tablet oder Desktop“`);
    check((await page.locator("[id^=tp-lane-]").count()) === 0, `${label} ${w}px: keine Etagen-Zeilen am Handy`);
    await page.screenshot({ path: path.join(SHOT_DIR, `${label}-${w}-phone.png`), fullPage: true });
    return page.close();
  }
  await page.locator("#tp-lane-1").waitFor();
  await page.evaluate(() => document.querySelector("#tp-team-title")?.closest("div.flex.min-w-0")?.setAttribute("data-tp", ""));
  await common(page, w, label);
  await page.screenshot({ path: path.join(SHOT_DIR, `${label}-${w}-1-tagesplan.png`) });

  // Zahlen: Σ Zimmer der Etagen + ohne Etage = „zugeteilt X/Y“ → Y; Σ Kraft-Zimmer + Σ offen = Y
  const assigned = (await statValue(page, "zugeteilt"))?.trim() ?? "";
  const [x, y] = assigned.split("/").map(Number);
  const chips = await page.locator("section[aria-labelledby=tp-team-title] button[aria-pressed]").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label") ?? ""));
  const crewRooms = chips.map((l) => Number((l.match(/(\d+) Zimmer/) || [])[1] ?? 0)).reduce((a, b) => a + b, 0);
  const openSum = (await page.locator("[id^=tp-lane-] .rounded-pill", { hasText: /offen$/ }).allTextContents()).map((s) => parseInt(s, 10)).reduce((a, b) => a + b, 0);
  check(crewRooms + openSum === y && x === crewRooms, `${label} ${w}px: Zahlen stimmen (zugeteilt ${x}/${y}, Kräfte ${crewRooms}, offen ${openSum})`);
  check(await page.getByText(/^Ohne Etage \(\d+\)$/).first().isVisible(), `${label} ${w}px: Zeile „Ohne Etage (N)“`);

  // Überlast-Hinweis antippen → Kraft-Detail + Etage offen
  const hint = page.getByRole("button", { name: /Überlast \(16 Zimmer\)/ }).first();
  check(await hint.isVisible(), `${label} ${w}px: Überlast-Hinweis sichtbar`);
  await act(hint);
  await page.waitForTimeout(400);
  check(await page.getByRole("heading", { name: "Ingrid Hausmann" }).first().isVisible(), `${label} ${w}px: Hinweis öffnet Kraft-Detail`);
  check((await page.locator("[id^=tp-lane-] [aria-expanded=true]").count()) === 1, `${label} ${w}px: Etage des Hinweises offen (genau eine)`);
  await page.screenshot({ path: path.join(SHOT_DIR, `${label}-${w}-2-kraft-detail.png`) });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // Etage auf/zu: eine andere öffnen → vorherige zu
  await act(page.locator("#tp-lane-2 button[aria-expanded]"));
  await page.waitForTimeout(200);
  check((await page.locator("[id^=tp-lane-] [aria-expanded=true]").count()) === 1 && (await page.locator("#tp-lane-2 button[aria-expanded=true]").count()) === 1, `${label} ${w}px: immer nur eine Etage offen`);
  await page.screenshot({ path: path.join(SHOT_DIR, `${label}-${w}-3-etage-offen.png`) });

  // Zimmer antippen (ohne Zuteilen) → Zimmerfenster
  await act(page.locator("#tp-lane-2-body [aria-label*='Zuteilung offen']").first());
  const dlg = page.getByRole("dialog").first();
  await dlg.waitFor({ timeout: 5000 }).catch(() => {});
  check(await dlg.isVisible(), `${label} ${w}px: Zimmer antippen öffnet das Zimmerfenster`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOT_DIR, `${label}-${w}-4-zimmer.png`) });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // Zuteilen: Kraft wählen → „Zimmer zuteilen“ → offenes Zimmer antippen
  const before = await page.locator("#tp-lane-2-body [aria-label*='Zuteilung offen']").count();
  await act(page.locator("section[aria-labelledby=tp-team-title] button", { hasText: "Maria Silva" }).first());
  await act(page.getByRole("button", { name: "Zimmer zuteilen" }).first());
  await page.waitForTimeout(300);
  check(await page.getByText("Zuteilen an Maria Silva", { exact: false }).first().isVisible(), `${label} ${w}px: Zuteilen-Leiste sichtbar`);
  const reqs = [];
  page.on("request", (r) => { if (/\/api\/rooms\/.+\/assign|bulk-assign/.test(r.url())) reqs.push(r.url()); });
  const navs = [];
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) navs.push(f.url()); });
  await act(page.locator("#tp-lane-2-body [aria-label*='Zuteilung offen']").first());
  await page.waitForTimeout(900);
  const after = await page.locator("#tp-lane-2-body [aria-label*='Zuteilung offen']").count();
  check(reqs.length === 1 && after === before - 1, `${label} ${w}px: Zuteilen speichert und Zeile zählt sofort neu (${before} → ${after})`);
  const mariaChip = await page.locator("section[aria-labelledby=tp-team-title] button", { hasText: "Maria Silva" }).first().getAttribute("aria-label");
  check(/12 Zimmer/.test(mariaChip ?? ""), `${label} ${w}px: Kraft-Chip aktualisiert (${mariaChip})`);
  check(navs.length === 0, `${label} ${w}px: kein Neuladen der Seite`);
  await page.screenshot({ path: path.join(SHOT_DIR, `${label}-${w}-5-zuteilen.png`) });
  // zurücknehmen, damit die nächste Breite dieselben Daten hat
  await act(page.getByRole("button", { name: /^Zimmer \d+ entfernen|entfernen/ }).first()).catch(() => {});
  await page.waitForTimeout(700);
  await act(page.getByRole("button", { name: "Fertig" }).first()).catch(() => {});
  await page.close();
}

for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce", locale: "de-DE", deviceScaleFactor: 1 });
  await run(ctx, w, h, "desk", false);
  await ctx.close();
}
const ipad = pw.devices["iPad Pro 11 landscape"];
const tctx = await browser.newContext({ ...ipad, reducedMotion: "reduce", locale: "de-DE" });
await run(tctx, ipad.viewport.width, ipad.viewport.height, "ipad-touch", true);
await tctx.close();
await browser.close();
console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : "\nalle Prüfungen ok");
process.exit(failed ? 1 : 0);
