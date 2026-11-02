/**
 * Playwright-Nachweis App-Rahmen (D1) auf /dev/shell (Testdaten, ohne Anmeldung):
 * je Breite die richtige Navigation (Seitenleiste ≥ 1280, Icon-Leiste 640–1279, Tab-Leiste < 640),
 * Tab-Leiste verdeckt keinen Inhalt, Fokusreihenfolge, Detail je Breite (Panel/Einschub/Sheet) mit
 * Escape, Dialog. Screenshots je Breite nach SHOT_DIR.
 *
 * Kein Teil von `npm test` (braucht laufenden Server):
 *   ALLOW_DEV_LOGIN=true npm run dev
 *   BASE_URL=http://localhost:3000 SHOT_DIR=/tmp/shots node tests/e2e/shell.e2e.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOT_DIR = process.env.SHOT_DIR ?? path.join(os.tmpdir(), "shell-shots");
const SIZES = [[390, 844], [768, 1024], [800, 1280], [1024, 768], [1280, 800], [1672, 941]];
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
  await page.goto(`${BASE}/dev/shell?detail=0`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  const navs = await page.evaluate(() =>
    [...document.querySelectorAll("nav")].filter((n) => n.getClientRects().length > 0).map((n) => {
      const r = n.getBoundingClientRect();
      return { w: Math.round(r.width), bottom: Math.round(r.bottom), top: Math.round(r.top), items: n.querySelectorAll("a,button").length };
    }),
  );
  check(navs.length === 1, `${w}px: genau eine sichtbare Navigation (${navs.length})`);
  if (mode === "phone") check(navs[0]?.bottom === h && navs[0]?.items <= 4, `${w}px: Tab-Leiste unten, ≤ 4 Punkte (${navs[0]?.items})`);
  else {
    const aside = await page.evaluate(() => [...document.querySelectorAll("aside")].filter((a) => a.getClientRects().length > 0).map((a) => Math.round(a.getBoundingClientRect().width)));
    check(aside[0] === (mode === "wide" ? 264 : 80), `${w}px: ${mode === "wide" ? "Seitenleiste 264" : "Icon-Leiste 80"} px (${aside[0]})`);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, `${w}px: keine waagrechte Scroll-Leiste (${overflow})`);
  if (mode === "phone") {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const covered = await page.evaluate(() => {
      const bar = [...document.querySelectorAll("nav")].find((n) => n.getClientRects().length > 0).getBoundingClientRect();
      const rows = [...document.querySelectorAll("main button")].filter((b) => b.getClientRects().length > 0);
      const last = rows[rows.length - 1].getBoundingClientRect();
      return last.bottom - bar.top;
    });
    check(covered <= 0, `${w}px: Tab-Leiste verdeckt die letzte Zeile nicht (Überlappung ${Math.round(covered)} px)`);
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  // Fokusreihenfolge: zuerst Navigation (Seiten-/Icon-Leiste), dann Kopf-Aktionen, dann Inhalt
  await page.keyboard.press("Tab");
  const first = await page.evaluate(() => document.activeElement?.closest("aside,header,main,nav")?.tagName);
  check(mode === "phone" ? first === "HEADER" || first === "MAIN" : first === "ASIDE", `${w}px: erster Tab-Stopp in ${first}`);
  await page.screenshot({ path: path.join(SHOT_DIR, `shell-${w}.png`) });
  // Detail öffnen: Zeile 305 antippen
  await page.locator("main button:visible", { hasText: "305" }).first().click();
  await page.waitForTimeout(300);
  const detail = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
    const aside = [...document.querySelectorAll("main aside")].find((a) => a.getClientRects().length > 0);
    return dlg ? { kind: "dialog", w: Math.round(dlg.getBoundingClientRect().width), focusInside: dlg.contains(document.activeElement) } : aside ? { kind: "panel" } : null;
  });
  const expected = mode === "wide" ? "panel" : "dialog";
  check(detail?.kind === expected, `${w}px: Detail als ${mode === "wide" ? "Panel" : mode === "tablet" ? "Einschub" : "Bottom-Sheet"} (${JSON.stringify(detail)})`);
  if (detail?.kind === "dialog") check(detail.focusInside, `${w}px: Fokus im Fenster`);
  await page.screenshot({ path: path.join(SHOT_DIR, `shell-${w}-detail.png`) });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  const stillOpen = await page.evaluate(() => !!document.querySelector('[role="dialog"][aria-modal="true"]') || [...document.querySelectorAll("main aside")].some((a) => a.getClientRects().length > 0));
  check(!stillOpen, `${w}px: Escape schließt das Detail`);
  await ctx.close();
}
await browser.close();
console.log(`Screenshots: ${SHOT_DIR}`);
process.exit(failed ? 1 : 0);
