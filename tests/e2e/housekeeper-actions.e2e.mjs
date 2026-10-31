/**
 * Playwright-Nachweis: Housekeeper öffnet ein Zimmer, setzt DND (Blockiert → „Bitte nicht stören“), nimmt es zurück
 * (Entsperren & starten) und meldet einen Mangel — auf 390 px (iPhone) und 768 px (iPad).
 *
 * Kein Teil von `npm test` (braucht laufenden Server + Testdaten):
 *   cp .env.example .env && npx prisma db push && npm run db:seed   (Zimmer setzt der Test selbst: scripts/e2e-housekeeper-setup.ts)
 *   ALLOW_DEV_LOGIN=true npm run dev
 *   SHOT_DIR=/tmp/shots node tests/e2e/housekeeper-actions.e2e.mjs
 * BROWSER=webkit nutzt WebKit, wenn installiert (hier im Container nur Chromium).
 * Screenshots nie in den Projektordner schreiben, solange `npm run dev` läuft (Hot-Reload).
 */
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOT_DIR = process.env.SHOT_DIR ?? os.tmpdir();
const ROOM = process.env.ROOM ?? "122";
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); }
const browserType = pw[process.env.BROWSER ?? "chromium"];

/** Der Fenster-Inhalt muss wirklich im sichtbaren Bereich liegen, nicht nur im DOM stehen. */
async function expectDialogVisible(page, label) {
  const dialog = page.getByRole("dialog").last();
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(350); // Einblend-Animation
  const box = await dialog.boundingBox();
  const vp = page.viewportSize();
  if (!box) throw new Error(`${label}: kein Fenster`);
  const top = box.y, bottom = box.y + box.height;
  if (top < 0 || bottom > vp.height + 1 || box.height < 120) {
    await page.screenshot({ path: path.join(SHOT_DIR, `${label.replace(/\W+/g, "-")}-FEHLER.png`) });
    throw new Error(`${label}: Fenster liegt außerhalb des Bildschirms (top=${top.toFixed(0)}, bottom=${bottom.toFixed(0)}, Viewport=${vp.height})`);
  }
  // Der oberste Punkt in der Fenstermitte muss zum Fenster gehören (kein Kopf/Leiste davor).
  const hit = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest("[role=dialog]"), [box.x + box.width / 2, top + 30]);
  if (!hit) throw new Error(`${label}: Fenster ist verdeckt`);
  return dialog;
}

async function run(viewport, tag) {
  const browser = await browserType.launch();
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: viewport.width < 768, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem("stayclean.locale", "de"); } catch {} });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });

  const login = await page.request.post(`${BASE}/api/auth/login`, { data: { email: "maria@hotel.test", password: "123" } });
  if (!login.ok()) throw new Error(`Login fehlgeschlagen: ${login.status()}`);
  await page.goto(`${BASE}/attendant`, { waitUntil: "networkidle" });

  const openRoom = async () => {
    await page.getByRole("button", { name: new RegExp(`\\b${ROOM}\\b`) }).first().click();
    return expectDialogVisible(page, `${tag} Zimmerfenster`);
  };

  // 1) DND setzen
  let d = await openRoom();
  await d.getByRole("button", { name: /Blockiert…|Blocked…/ }).click();
  d = await expectDialogVisible(page, `${tag} DND-Fenster`);
  await page.screenshot({ path: path.join(SHOT_DIR, `${tag}-dnd.png`) });
  await d.getByRole("button", { name: /Bitte nicht stören|Do Not Disturb/ }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.waitForResponse((r) => r.url().includes("/status") || r.url().includes("/api/rooms"), { timeout: 5000 }).catch(() => {});

  // 2) DND zurücknehmen
  d = await openRoom();
  await d.getByRole("button", { name: /Entsperren & starten|Unblock & start/ }).click();
  await page.waitForTimeout(800);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // 3) Mangel melden (Hintergrund-Tipp mit Text darf nicht verwerfen)
  d = await openRoom();
  await d.getByRole("button", { name: /Mangel…|Defect…/ }).click();
  d = await expectDialogVisible(page, `${tag} Mangel-Fenster`);
  await d.locator("textarea").fill("Wasserhahn tropft (Test)");
  await page.mouse.click(5, 5); // Hintergrund
  await page.waitForTimeout(400);
  if ((await page.getByRole("dialog").count()) === 0) throw new Error(`${tag}: Hintergrund-Tipp hat ausgefülltes Mangel-Fenster verworfen`);
  await page.screenshot({ path: path.join(SHOT_DIR, `${tag}-defect.png`) });
  const sent = page.waitForResponse((r) => r.url().includes(`/defects`) && r.request().method() === "POST");
  await d.getByRole("button", { name: /An Technik senden|Send to engineering/ }).click();
  const res = await sent;
  if (!res.ok()) throw new Error(`${tag}: Mangel-POST ${res.status()}`);

  await browser.close();
  if (errors.length) throw new Error(`${tag}: Fehler: ${errors.join(" | ")}`);
  console.log(`✓ ${tag}: DND setzen/zurücknehmen + Mangel melden — Fenster sichtbar`);
}

let failed = false;
for (const [vp, tag] of [[{ width: 390, height: 844 }, "iphone-390"], [{ width: 768, height: 1024 }, "ipad-768"]]) {
  // Testdaten je Gerät neu setzen (122 ist nach dem ersten Durchlauf „in Arbeit“).
  execSync("npx tsx scripts/e2e-housekeeper-setup.ts", { stdio: "ignore" });
  try { await run(vp, tag); } catch (e) { failed = true; console.error(`✗ ${e.message}`); }
}
process.exit(failed ? 1 : 0);
