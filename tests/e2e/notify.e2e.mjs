/**
 * Playwright-Nachweis Meldungs-Zentrum (Paket O1): zwei bzw. mehrere Browser-Kontexte, Touch-Emulation,
 * iPad hoch (800×1280) und quer (1280×800). Prüft:
 *  - Supervisor lehnt Zimmer ab → HK bekommt Pop-up „Dringend“ (Ton-Aufruf per Spy: erst nach „Ton aktivieren“)
 *  - FO setzt „Sofort“ → Supervisor der Etage + HK bekommen Pop-up und Ton
 *  - HK offline → Meldung entsteht → online → Banner „1 neue Meldung“ + Liste aktuell
 *  - DM „Alle gelesen“ → HK-Glocke bleibt ungelesen
 *
 * Kein Teil von `npm test` (braucht laufenden Server + Wegwerf-SQLite; nie gegen Prod, Screenshots nie in den Projektordner):
 *   export DATABASE_URL=file:/tmp/o1/e2e.db
 *   npx prisma db push --skip-generate && npx tsx prisma/seed.ts
 *   ALLOW_DEV_LOGIN=true PORT=3131 npm start
 *   BASE_URL=http://localhost:3131 SHOT_DIR=/tmp/o1-shots node tests/e2e/notify.e2e.mjs
 * Testdaten: scripts/e2e-notify-setup.ts (läuft vor jeder Größe neu). Keine Gastdaten (Anreise nur mit Platzhalter).
 */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const BASE = process.env.BASE_URL ?? "http://localhost:3131";
const SHOT_DIR = process.env.SHOT_DIR ?? path.join(os.tmpdir(), "o1-shots");
const OUT = path.join(SHOT_DIR, "ids.json");
const SIZES = [[800, 1280], [1280, 800]];
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); }
mkdirSync(SHOT_DIR, { recursive: true });
const browser = await pw.chromium.launch();
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) failed++; };

const SPY = () => {
  window.__sounds = [];
  window.addEventListener("stayclean:sound", (e) => window.__sounds.push(e.detail.kind));
};

async function open(email, url, size, { soundOn = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, hasTouch: true, reducedMotion: "reduce", locale: "de-DE", timezoneId: "Europe/Berlin" });
  await ctx.addInitScript(SPY);
  if (soundOn) await ctx.addInitScript(() => { try { localStorage.setItem("stayclean.sound", "on"); } catch {} });
  const res = await ctx.request.post(`${BASE}/api/auth/dev-login`, { data: { email } });
  if (!res.ok()) throw new Error(`login ${email} ${res.status()}`);
  const page = await ctx.newPage();
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  return { ctx, page };
}
const sounds = (page) => page.evaluate(() => [...window.__sounds]);
const clearSounds = (page) => page.evaluate(() => { window.__sounds.length = 0; });

for (const size of SIZES) {
  const tag = `${size[0]}×${size[1]}`;
  execSync("npx tsx scripts/e2e-notify-setup.ts", { env: { ...process.env, OUT }, stdio: "pipe" });
  const ids = JSON.parse(readFileSync(OUT, "utf8"));

  const hk = await open("maria@hotel.test", "/attendant", size);
  const sup = await open("supervisor@hotel.test", "/supervisor", size, { soundOn: true });
  const fo = await open("frontoffice@hotel.test", "/front-office", size);

  // 1) Ton-Banner einmal sichtbar; Ablehnung → Pop-up „Dringend“, aber noch kein Ton
  check(await hk.page.locator("[data-notify-sound-banner]").isVisible(), `${tag}: Banner „Ton aktivieren“ sichtbar`);
  const r1 = await sup.ctx.request.post(`${BASE}/api/rooms/${ids.roomA.id}/status`, { data: { status: "PICKUP", note: "Spiegel nachpolieren" } });
  check(r1.ok(), `${tag}: Supervisor lehnt Zimmer ${ids.roomA.number} ab (${r1.status()})`);
  const toast = hk.page.locator("[data-notify-toast=notification]", { hasText: ids.roomA.number }).first();
  await toast.waitFor({ timeout: 8000 }).catch(() => {});
  check(await toast.isVisible(), `${tag}: HK sieht Pop-up für Zimmer ${ids.roomA.number}`);
  check((await toast.getAttribute("role")) === "alert" && (await toast.innerText()).includes("Dringend"), `${tag}: Pop-up als „Dringend“ (Symbol + Wort)`);
  const closeBox = await toast.locator("button[aria-label=Schließen]").boundingBox();
  check(!!closeBox && closeBox.height >= 48 && closeBox.width >= 48, `${tag}: Schließen-Knopf ≥ 48 px (${closeBox && Math.round(closeBox.height)})`);
  check((await sounds(hk.page)).length === 0, `${tag}: kein Ton vor „Ton aktivieren“`);
  await hk.page.screenshot({ path: path.join(SHOT_DIR, `hk-rework-${size[0]}x${size[1]}.png`) });

  // 2) Ton aktivieren (Tippen) → Hörprobe; Banner verschwindet
  await hk.page.getByRole("button", { name: "Ton aktivieren" }).tap();
  await hk.page.waitForTimeout(300);
  check((await sounds(hk.page)).length >= 1, `${tag}: nach „Ton aktivieren“ wird der Ton aufgerufen`);
  check(!(await hk.page.locator("[data-notify-sound-banner]").isVisible()), `${tag}: Ton-Banner weg`);
  await clearSounds(hk.page); await clearSounds(sup.page);

  // 3) FO setzt „Sofort“ → Supervisor der Etage + HK: Pop-up + Ton (dringend)
  const r2 = await fo.ctx.request.patch(`${BASE}/api/arrivals/${ids.arrival}`, { data: { neededNow: true } });
  check(r2.ok(), `${tag}: FO setzt „Sofort“ (${r2.status()})`);
  const supToast = sup.page.locator("[data-notify-toast=notification]", { hasText: ids.roomB.number }).first();
  const hkToast = hk.page.locator("[data-notify-toast=notification]", { hasText: ids.roomB.number }).first();
  await Promise.all([supToast.waitFor({ timeout: 8000 }).catch(() => {}), hkToast.waitFor({ timeout: 8000 }).catch(() => {})]);
  check(await supToast.isVisible(), `${tag}: Supervisor sieht Pop-up „sofort gebraucht“`);
  check(await hkToast.isVisible(), `${tag}: HK sieht Pop-up „Priorität geändert“`);
  check((await sounds(sup.page)).includes("urgent"), `${tag}: Supervisor-Ton dringend aufgerufen`);
  check((await sounds(hk.page)).includes("urgent"), `${tag}: HK-Ton dringend aufgerufen`);
  await sup.page.screenshot({ path: path.join(SHOT_DIR, `sup-now-${size[0]}x${size[1]}.png`) });

  // Antippen öffnet das Zimmer
  await hkToast.locator("button").first().tap();
  await hk.page.locator("[role=dialog]").first().waitFor({ timeout: 6000 }).catch(() => {});
  check(await hk.page.locator("[role=dialog]").first().isVisible(), `${tag}: Antippen öffnet das Zimmerfenster`);
  await hk.page.keyboard.press("Escape");

  // 4) Offline → Meldung entsteht → online: Banner „1 neue Meldung“ + Liste aktuell
  await hk.ctx.setOffline(true);
  await hk.page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await hk.page.locator("[data-notify-offline]").waitFor({ timeout: 8000 }).catch(() => {});
  check(await hk.page.locator("[data-notify-offline]").isVisible(), `${tag}: Hinweis „Verbindung weg“`);
  await clearSounds(hk.page);
  const r3 = await sup.ctx.request.post(`${BASE}/api/rooms/${ids.roomC.id}/assign`, { data: { attendantId: ids.maria } });
  check(r3.ok(), `${tag}: Supervisor teilt Zimmer ${ids.roomC.number} zu, während HK offline (${r3.status()})`);
  await hk.page.waitForTimeout(1500);
  await hk.ctx.setOffline(false);
  await hk.page.evaluate(() => window.dispatchEvent(new Event("online")));
  const banner = hk.page.locator("[data-notify-resync]");
  await banner.waitFor({ timeout: 10000 }).catch(() => {});
  const bannerText = (await banner.isVisible()) ? await banner.innerText() : "";
  check(/1 neue Meldung/.test(bannerText) || /\d+ neue Meldungen/.test(bannerText), `${tag}: Banner nach Rückkehr („${bannerText.replace(/\s+/g, " ")}“)`);
  await hk.page.waitForFunction((n) => document.querySelector("main")?.innerText.includes(n), ids.roomC.number, { timeout: 8000 }).catch(() => {});
  check((await hk.page.locator("main").innerText()).includes(ids.roomC.number), `${tag}: HK-Liste enthält das neue Zimmer ${ids.roomC.number}`);
  check(!(await hk.page.locator("[data-notify-offline]").isVisible()), `${tag}: „Verbindung weg“ wieder weg`);
  await hk.page.screenshot({ path: path.join(SHOT_DIR, `hk-resync-${size[0]}x${size[1]}.png`) });

  // 5) DM „Alle gelesen“ → HK-Glocke bleibt ungelesen
  const dm = await open("manager@hotel.test", "/duty-manager", size);
  await dm.page.locator("[data-notify-bell]").first().tap();
  await dm.page.getByRole("button", { name: "Alle gelesen" }).tap();
  await dm.page.waitForTimeout(800);
  await hk.page.reload({ waitUntil: "networkidle" });
  await hk.page.waitForTimeout(800);
  const hkUnread = Number(await hk.page.locator("[data-notify-bell]").first().getAttribute("data-notify-bell"));
  check(hkUnread > 0, `${tag}: HK-Glocke nach DM „Alle gelesen“ weiter ungelesen (${hkUnread})`);

  // 6) Planungstool hat Glocke + Pop-up (eigener Rahmen ohne AppShell)
  await sup.page.goto(`${BASE}/planung`, { waitUntil: "networkidle" });
  check(await sup.page.locator("[data-notify-bell]:visible").count() === 1, `${tag}: /planung zeigt die Glocke`);
  const r4 = await dm.ctx.request.post(`${BASE}/api/rooms/${ids.roomC.id}/assign`, { data: { attendantId: null } });
  check(r4.ok(), `${tag}: DM nimmt Zimmer ${ids.roomC.number} von der Liste (${r4.status()})`);
  const plToast = sup.page.locator("[data-notify-toast]", { hasText: ids.roomC.number }).first();
  await plToast.waitFor({ timeout: 8000 }).catch(() => {});
  check(await plToast.isVisible(), `${tag}: Pop-up im Planungstool`);
  await sup.page.screenshot({ path: path.join(SHOT_DIR, `planung-${size[0]}x${size[1]}.png`) });

  for (const c of [hk, sup, fo, dm]) await c.ctx.close();
}

await browser.close();
console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : "\nalle Prüfungen ok");
process.exit(failed ? 1 : 0);
