/**
 * Playwright-Nachweis Gäste-Screen „Glas & Premium“ (D6) bei 360/390/768 px: jeder Zustand
 * (Start, letzte Anfrage, Bitte nicht stören an, ohne Anfragen, alle Fenster, Fehler im Fenster,
 * Freitext leer, Offline, Erfolg, nicht verfügbar, EN) + Prüfungen: Tippflächen ≥ 48 px,
 * Kachel-Beschriftung, kein Blur, Fenster mit Schließen (Symbol + Wort), Escape, Fokusfalle,
 * nur Lora 700 / Inter 400+500 aus den Glas-Schriften.
 *
 * Nur mit erfundenen Testdaten (Wegwerf-DB) — Zugangscodes d6test-open / d6test-dnd / d6test-empty,
 * siehe Abschnitt „Testdaten“ unten. Kein Teil von `npm test` (braucht laufenden Server):
 *   NODE_ENV=production PORT=3100 node server.js     (nicht `npm run dev`: Hot-Reload)
 *   BASE_URL=http://localhost:3100 SHOT_DIR=/tmp/guest-shots node tests/e2e/guest.e2e.mjs
 *
 * Testdaten: drei Zimmer mit Room.guestAccessCode d6test-open (letzte Anfrage: Reinigung,
 * Eingegangen), d6test-dnd (DND aktiv + Anfrage In Bearbeitung), d6test-empty (keine Anfragen),
 * je ein Stay IN_HOUSE mit erfundenem Namen; Settings guestPrivacyUrl/guestImprintUrl gesetzt.
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const SHOT_DIR = process.env.SHOT_DIR ?? path.join(os.tmpdir(), "guest-shots");
const WIDTHS = [[360, 780], [390, 844], [768, 1024]];
const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/opt/node-tools/node_modules/playwright"); }
mkdirSync(SHOT_DIR, { recursive: true });
const browser = await pw.chromium.launch();
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) failed++; };

async function open(ctx, url) {
  const page = await ctx.newPage();
  const fonts = [];
  page.on("request", (r) => { if (r.resourceType() === "font") fonts.push(new URL(r.url()).pathname); });
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  return { page, fonts };
}
const shot = (page, w, name, full = true) => page.screenshot({ path: path.join(SHOT_DIR, `d6-${w}-${name}.png`), fullPage: full });

/** Sichtbare Tippflächen < 48 px (Buttons, Links, Eingaben). */
const smallTargets = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("button, a[href], input:not([type=hidden]), textarea")]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => { const r = el.getBoundingClientRect(); return { t: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter((x) => x.h < 48 || x.w < 48),
  );

for (const [w, h] of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce", locale: "de-DE", deviceScaleFactor: 2 });

  // 1 Start mit letzter Anfrage
  let { page, fonts } = await open(ctx, "/g/r/d6test-open");
  check(await page.getByRole("heading", { name: "Willkommen" }).isVisible(), `${w}: Willkommen sichtbar`);
  check(await page.getByText("Ihre Anfrage: Reinigungswunsch").isVisible(), `${w}: Status der letzten Anfrage (Text)`);
  check(await page.locator("main button").filter({ hasText: "Eingegangen" }).locator("svg").count() > 0, `${w}: Status mit Symbol`);
  for (const name of ["Bitte nicht stören: Zeitfenster wählen", "Reinigung wünschen: Zeitpunkt wählen", "Mangel melden: Kategorie & Beschreibung", "Abteilung kontaktieren: Zuständige Stelle wählen"])
    check((await page.getByRole("button", { name }).count()) === 1, `${w}: Kachel beschriftet „${name}“`);
  check((await page.getByRole("link", { name: "Datenschutz" }).count()) === 1 && (await page.getByRole("link", { name: "Impressum" }).count()) === 1, `${w}: Datenschutz/Impressum-Links`);
  const small = await smallTargets(page);
  check(small.length === 0, `${w}: alle Tippflächen ≥ 48 px ${JSON.stringify(small)}`);
  const blur = await page.evaluate(() => [...document.querySelectorAll("*")].some((el) => { const s = getComputedStyle(el); return (s.backdropFilter && s.backdropFilter !== "none") || (s.filter && s.filter.includes("blur")); }));
  check(!blur, `${w}: kein Blur`);
  const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!hScroll, `${w}: kein seitliches Scrollen`);
  await shot(page, w, "01-start");
  check(fonts.every((f) => /lora-[a-z-]+-700|inter-[a-z-]+-(400|500)/.test(f) || !/\/fonts\//.test(f)), `${w}: Glas-Schriften nur Lora 700 / Inter 400+500 (${fonts.filter((f) => /\/fonts\//.test(f)).join(", ")})`);
  const nextFonts = fonts.filter((f) => !/\/fonts\//.test(f));
  console.log(`info ${w}: weitere Schriftdateien vom Root-Layout (next/font): ${nextFonts.length}`);

  // Fokusring sichtbar auf einer Kachel
  await page.getByRole("button", { name: "Reinigung wünschen: Zeitpunkt wählen" }).focus();
  await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  check(outline !== "none", `${w}: Fokusring sichtbar (${outline})`);

  // 2 Fenster: je eins öffnen, Schließen (Symbol + Wort), Escape, Fokusfalle
  const modals = [
    ["Bitte nicht stören: Zeitfenster wählen", "02-fenster-dnd"],
    ["Reinigung wünschen: Zeitpunkt wählen", "03-fenster-reinigung"],
    ["Mangel melden: Kategorie & Beschreibung", "04-fenster-mangel"],
    ["Abteilung kontaktieren: Zuständige Stelle wählen", "05-fenster-abteilung"],
  ];
  for (const [tile, name] of modals) {
    await page.getByRole("button", { name: tile }).click();
    const dlg = page.getByRole("dialog");
    await dlg.waitFor();
    await page.waitForTimeout(300);
    const close = dlg.getByRole("button", { name: "Schließen" });
    check((await close.textContent()).includes("Schließen") && (await close.locator("svg").count()) === 1, `${w}: ${name} Schließen = Symbol + Wort`);
    const bad = (await smallTargets(page)).filter((x) => x.t !== "INPUT");
    check(bad.length === 0, `${w}: ${name} Tippflächen ≥ 48 px ${JSON.stringify(bad)}`);
    if (name === "03-fenster-reinigung") await dlg.getByRole("button", { name: "Später heute – Uhrzeit wählen" }).click();
    await shot(page, w, name, false);
    for (let i = 0; i < 25; i++) await page.keyboard.press("Tab");
    check(await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]")), `${w}: ${name} Fokus bleibt im Fenster`);
    await page.keyboard.press("Escape");
    await dlg.waitFor({ state: "detached" });
  }

  // Fehler im Fenster (Server lehnt ab)
  await page.route("**/api/guest/r/d6test-open/dnd", (r) => r.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "Zu viele Anfragen – bitte kurz warten." }) }));
  await page.getByRole("button", { name: "Bitte nicht stören: Zeitfenster wählen" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Bestätigen" }).click();
  await page.getByRole("dialog").getByRole("alert").waitFor();
  await page.waitForTimeout(200);
  await shot(page, w, "06-fenster-fehler", false);
  await page.keyboard.press("Escape");
  await page.unroute("**/api/guest/r/d6test-open/dnd");
  await page.getByRole("dialog").waitFor({ state: "detached" });

  // Alle Anfragen
  await page.getByRole("button", { name: /Ihre Anfrage: Reinigungswunsch/ }).click();
  await page.getByRole("dialog").waitFor();
  await page.waitForTimeout(300);
  check(await page.getByRole("dialog").getByText("Erledigt").isVisible(), `${w}: Anfragenliste zeigt Status-Text`);
  await shot(page, w, "07-fenster-anfragen", false);
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });

  // Freitext leer → Fehlermeldung am Feld
  await page.getByRole("button", { name: "Senden" }).click();
  check(await page.getByText("Bitte geben Sie zuerst eine Nachricht ein.").isVisible(), `${w}: Freitext leer → Hinweis`);
  await shot(page, w, "08-freitext-leer");

  // Offline: Hinweis, dann wartende Anfrage
  await ctx.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.waitForTimeout(300);
  check(await page.getByText("Keine Verbindung").first().isVisible(), `${w}: Offline-Leiste`);
  await shot(page, w, "09-offline");
  await page.getByRole("textbox", { name: "Weiteres Anliegen" }).fill("Testnachricht (erfunden)");
  await page.getByRole("button", { name: "Senden" }).click();
  await page.waitForTimeout(400);
  check(await page.getByText(/wartet/).first().isVisible(), `${w}: Offline-Anfrage wartet`);
  await shot(page, w, "10-offline-wartet");
  // Warteschlange verwerfen, damit die erfundene Testnachricht die Testdaten nicht verändert.
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (!k.includes("locale")) localStorage.removeItem(k); });
  await page.close();
  await ctx.setOffline(false);


  // 3 Bitte nicht stören aktiv + Zurücknehmen-Rückfrage
  ({ page } = await open(ctx, "/g/r/d6test-dnd"));
  const dndTile = page.getByRole("button", { name: /Bitte nicht stören ist aktiv/ });
  check((await dndTile.getAttribute("aria-pressed")) === "true", `${w}: DND-Kachel aktiv (aria-pressed)`);
  check(await page.getByText("Aktiv · Nächste 2 Stunden").isVisible(), `${w}: DND aktiv als Text`);
  check(await page.getByText("In Bearbeitung").isVisible(), `${w}: Status In Bearbeitung`);
  await shot(page, w, "11-dnd-aktiv");
  await dndTile.click();
  await page.getByRole("dialog").waitFor();
  await page.waitForTimeout(300);
  await shot(page, w, "12-dnd-zuruecknehmen", false);
  await page.close();

  // 4 Ohne Anfragen + Erfolg (Abteilung kontaktieren) — nur bei der letzten Breite schreiben
  ({ page } = await open(ctx, "/g/r/d6test-empty"));
  check((await page.getByText(/Ihre Anfrage:/).count()) === 0, `${w}: ohne Anfragen keine Status-Zeile`);
  await shot(page, w, "13-ohne-anfragen");
  if (w === WIDTHS[WIDTHS.length - 1][0]) {
    await page.getByRole("button", { name: "Abteilung kontaktieren: Zuständige Stelle wählen" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Kontaktieren" }).click();
    await page.getByRole("status").getByText("Housekeeping wurde benachrichtigt.").waitFor();
    await page.waitForTimeout(300);
    check(true, `${w}: Erfolgsmeldung`);
    await shot(page, w, "14-erfolg");
  }
  await page.close();

  // 5 Nicht verfügbar
  ({ page } = await open(ctx, "/g/r/gibt-es-nicht"));
  check(await page.getByRole("heading", { name: "Zurzeit nicht verfügbar" }).isVisible(), `${w}: nicht verfügbar`);
  await shot(page, w, "15-nicht-verfuegbar");
  await page.close();

  // 6 Englisch (Sprachwahl)
  ({ page } = await open(ctx, "/g/r/d6test-open"));
  await page.getByRole("button", { name: "EN", exact: true }).click();
  check(await page.getByRole("heading", { name: "Welcome" }).isVisible(), `${w}: EN umgeschaltet`);
  check((await page.getByRole("button", { name: "EN", exact: true }).getAttribute("aria-pressed")) === "true", `${w}: EN aria-pressed`);
  await shot(page, w, "16-englisch");
  await page.getByRole("button", { name: "DE", exact: true }).click();
  await page.close();
  await ctx.close();
}

await browser.close();
console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : "\nalle Prüfungen ok");
process.exit(failed ? 1 : 0);
