/**
 * Playwright-Nachweis Zimmer-Fenster (D7): `RoomDetailModal`/`LiveRoomModal` im Glas-Stil auf Glas-Seiten, hell auf
 * alten Seiten. Erfundene Daten aus `prisma/seed.ts` + `scripts/e2e-supervisor-setup.ts` + `scripts/e2e-roomwindow-setup.ts`.
 * Je Breite und Einstieg: Fenster öffnet, Glas vs. hell wie erwartet, keine helle Altfläche im Glas-Fenster, kein
 * backdrop-filter, Tippflächen ≥ 48 px, „Schließen“ mit Wort, Gast gekürzt („Herr Dr. Testmann“, kein Vorname), Escape schließt.
 *
 * Kein Teil von `npm test` (braucht laufenden Server); Screenshots nie in den Projektordner, solange `npm run dev` läuft:
 *   DATABASE_URL=file:/tmp/e2e-d7.db npx prisma db push && npx tsx prisma/seed.ts && npx tsx scripts/e2e-supervisor-setup.ts && npx tsx scripts/e2e-roomwindow-setup.ts
 *   DATABASE_URL=file:/tmp/e2e-d7.db ALLOW_DEV_LOGIN=true npm run dev
 *   BASE_URL=http://localhost:3000 SHOT_DIR=/tmp/d7-shots node tests/e2e/roomwindow.e2e.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOT_DIR = process.env.SHOT_DIR ?? path.join(os.tmpdir(), "d7-shots");
const SIZES = [[390, 844], [800, 1280], [1024, 768], [1280, 800], [1672, 941]];
const require = createRequire(import.meta.url);
const pw = require("playwright");
mkdirSync(SHOT_DIR, { recursive: true });
const browser = await pw.chromium.launch();
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) failed++; };

const ctxFor = async (email, w, h) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce", locale: "de-DE", deviceScaleFactor: 1 });
  const res = await ctx.request.post(`${BASE}/api/auth/dev-login`, { data: { email } });
  if (!res.ok()) throw new Error(`login ${email} ${res.status()}`);
  return ctx;
};
/** Chat zeigt beim ersten Besuch den Datenschutzhinweis — bestätigen. */
const ackChat = async (page) => { const ok = page.getByRole("button", { name: "Verstanden" }); if (await visible(ok, 3000)) { await ok.click(); await page.waitForTimeout(400); } };
/** Wartet bis sichtbar (Playwright-`isVisible` wartet nicht). */
const visible = (loc, timeout = 20_000) => loc.waitFor({ state: "visible", timeout }).then(() => true, () => false);
const settle = async (page) => { await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }); await page.waitForTimeout(600); };

/** Prüft das offene Glas-Fenster und schließt es mit Escape. */
async function glassWindow(page, label, shot, { expectGuest = false, expectEditor = false } = {}) {
  const win = page.locator("[data-testid=room-window]");
  try { await win.waitFor({ timeout: 30_000 }); } catch { check(false, `${label}: Glas-Fenster öffnet`); return; }
  await page.locator("[data-testid=room-window] [data-testid=room-detail-glass]").waitFor({ timeout: 30_000 }).catch(() => {});
  await settle(page);
  check(await page.getByRole("heading", { name: /^Zimmer \d+/ }).first().isVisible(), `${label}: Kopf „Zimmer …“`);
  const legacy = await win.locator(".bg-white, .bg-linen, .bg-parchment, .bg-ivory, .text-graphite, .border-charcoal\\/20").count();
  check(legacy === 0, `${label}: keine helle Altfläche im Fenster (${legacy})`);
  const blur = await page.evaluate(() => [...document.querySelectorAll("[data-testid=room-window], [data-testid=room-window] *")].filter((e) => getComputedStyle(e).backdropFilter !== "none").length);
  check(blur === 0, `${label}: kein backdrop-filter (${blur})`);
  const small = await win.evaluate((root) =>
    [...root.querySelectorAll("button, a, select, input")].filter((b) => b.getClientRects().length > 0)
      .map((b) => ({ t: (b.textContent || b.getAttribute("aria-label") || b.tagName).trim().slice(0, 24), h: Math.round(b.getBoundingClientRect().height) }))
      .filter((b) => b.h < 48));
  check(small.length === 0, `${label}: Tippflächen ≥ 48 px (${JSON.stringify(small.slice(0, 4))})`);
  check(await win.getByRole("button", { name: "Schließen" }).first().isVisible(), `${label}: „Schließen“ sichtbar`);
  const text = await win.innerText();
  if (expectGuest) check(text.includes("Herr Dr. Testmann") && !text.includes("Maximilian"), `${label}: Gast gekürzt, kein Vorname`);
  if (expectEditor) check((await win.locator("[data-testid=room-edit]").count()) === 1, `${label}: Bearbeiten-Bereich (Supervisor/DM)`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, `${label}: keine waagrechte Scroll-Leiste (${overflow})`);
  await page.screenshot({ path: path.join(SHOT_DIR, `${shot}.png`) });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check((await win.count()) === 0, `${label}: Escape schließt`);
}

async function lightWindow(page, label, shot) {
  const m = page.locator("[data-testid=modal-backdrop]");
  try { await m.waitFor({ timeout: 30_000 }); } catch { check(false, `${label}: helles Fenster öffnet`); return; }
  await settle(page);
  check((await page.locator("[data-testid=room-window]").count()) === 0, `${label}: bleibt hell (alte Seite)`);
  await page.screenshot({ path: path.join(SHOT_DIR, `${shot}.png`) });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
}

async function globalSearch(page, number = "312") {
  await page.getByRole("button", { name: "Zimmer suchen…" }).first().click();
  await page.getByRole("textbox", { name: "Zimmer suchen…" }).fill(number);
  const hit = page.locator("header button").filter({ hasText: new RegExp(`^${number}`) }).first();
  await hit.waitFor({ timeout: 20_000 });
  await hit.click();
}

for (const [w, h] of SIZES) {
  const tag = `${w}x${h}`;
  // ── Supervisor (Glas-Seite) ──
  const sup = await ctxFor("supervisor@hotel.test", w, h);
  const page = await sup.newPage();
  await page.goto(`${BASE}/supervisor`, { waitUntil: "networkidle" });
  await settle(page);

  await globalSearch(page);
  await glassWindow(page, `Suche Supervisor ${w}px`, `d7-${tag}-search-sup`, { expectGuest: true });

  // Supervisor-Liste (unten auf /supervisor): erste Zimmerzeile → LiveRoomModal mit Bearbeiten
  const listRow = page.locator("li[data-room] button").first();
  if (await visible(listRow, 20_000)) {
    await listRow.scrollIntoViewIfNeeded();
    await listRow.click();
    await glassWindow(page, `Supervisor-Liste ${w}px`, `d7-${tag}-suplist`, { expectEditor: true });
  } else check(false, `Supervisor-Liste ${w}px: Zimmerzeile gefunden`);

  // Glance-Kachel → Sheet → Zimmer öffnen
  let opened = false;
  const tiles = page.locator("main button[aria-haspopup], main button").filter({ hasText: /\d/ });
  const n = Math.min(await tiles.count(), 12);
  for (let i = 0; i < n && !opened; i++) {
    const t = tiles.nth(i);
    if (!(await t.isVisible())) continue;
    await t.click().catch(() => {});
    const openBtn = page.getByRole("button", { name: /^Zimmer \d+ öffnen$/ }).first();
    if (await visible(openBtn, 1500)) {
      await openBtn.click();
      await glassWindow(page, `Glance-Kachel ${w}px`, `d7-${tag}-glance`, { expectEditor: true });
      opened = true;
    } else {
      await page.keyboard.press("Escape");
    }
  }
  check(opened, `Glance-Kachel ${w}px: Zimmer aus Kachel-Detail geöffnet`);

  // Pausiertes Zimmer: Fortsetzen ist der goldene Hauptknopf
  await globalSearch(page, "308");
  const win = page.locator("[data-testid=room-window]");
  await win.waitFor({ timeout: 20_000 }).catch(() => {});
  check((await win.getByText("Pausiert").count()) > 0, `Suche 308 ${w}px: Pause sichtbar (Symbol + Text)`);
  await page.keyboard.press("Escape");
  await sup.close();

  // ── Rollen-Hubs (Glas): globale Suche ──
  for (const [email, name] of [["engineering@hotel.test", "engineering"], ["concierge@hotel.test", "concierge"], ["frontoffice@hotel.test", "front-office"]]) {
    const ctx = await ctxFor(email, w, h);
    const p = await ctx.newPage();
    await p.goto(`${BASE}/${name}`, { waitUntil: "networkidle" });
    await settle(p);
    await globalSearch(p);
    await glassWindow(p, `Suche ${name} ${w}px`, `d7-${tag}-search-${name}`, { expectGuest: true });
    // Hub-eigener Zimmer-Link (TextAction „Zimmer …“), falls die erfundenen Daten einen Eintrag haben
    const item = p.locator("main [role=listitem] button, main li button").first();
    if (await item.isVisible().catch(() => false)) {
      await item.click().catch(() => {});
      const link = p.locator("button").filter({ has: p.locator("svg") }).filter({ hasText: /^Zimmer/ }).first();
      if (await visible(link, 1500)) {
        await link.click();
        await glassWindow(p, `Hub-Link ${name} ${w}px`, `d7-${tag}-hub-${name}`);
      } else console.log(`info Hub-Link ${name} ${w}px: kein Zimmer-Link in den Testdaten sichtbar`);
    }
    await ctx.close();
  }
}

// ── Alte (helle) Flächen, eine Breite: Service-Übersicht, Chat ──
{
  const sup = await ctxFor("supervisor@hotel.test", 1280, 800);
  const page = await sup.newPage();
  await page.goto(`${BASE}/supervisor/service`, { waitUntil: "networkidle" });
  await page.locator("main button").filter({ hasText: /^Etage 3/ }).first().click().catch(() => {});
  const num = page.locator("main button[title^='Zimmer']").first();
  if (await visible(num, 20_000)) { await num.click(); await lightWindow(page, "Service-Übersicht (alte Seite)", "d7-1280-service-light"); }
  else check(false, "Service-Übersicht: Zimmernummer gefunden");

  // Chat: Supervisor schreibt dem Techniker „#312“
  const people = await (await sup.request.get(`${BASE}/api/chat/people`)).json().catch(() => ({}));
  const tech = (people.people ?? []).find((x) => x.role === "engineering");
  if (tech) {
    const { channelId } = await (await sup.request.post(`${BASE}/api/chat/direct`, { data: { userId: tech.id } })).json();
    await sup.request.post(`${BASE}/api/chat/channels/${channelId}/messages`, { data: { body: "Bitte #312 prüfen (Testnachricht)" } });
    for (const [ctxEmail, role] of [["supervisor@hotel.test", "Supervisor"], ["engineering@hotel.test", "Techniker"]]) {
      const ctx = role === "Supervisor" ? sup : await ctxFor(ctxEmail, 1280, 800);
      const p = role === "Supervisor" ? page : await ctx.newPage();
      await p.goto(`${BASE}/chat`, { waitUntil: "networkidle" });
      await ackChat(p);
      const conv = p.locator("main button").filter({ hasText: "👤" }).first();
      await conv.click({ timeout: 20_000 }).catch(() => {});
      const link = p.getByRole("button", { name: "#312" }).first();
      if (await visible(link, 20_000)) { await link.click(); await lightWindow(p, `Chat #312 als ${role} (alte Seite)`, `d7-1280-chat-${role}`); }
      else check(false, `Chat #312 als ${role}: Link gefunden`);
      if (role !== "Supervisor") await ctx.close();
    }
  } else check(false, "Chat: Techniker in der Personenliste");

  // Chat als Housekeeper: Direktnachricht an den Supervisor mit „#312“ (Schnellsuche, schreibgeschützt)
  const hk = await ctxFor("maria@hotel.test", 1280, 800);
  const supId = ((await (await hk.request.get(`${BASE}/api/chat/people`)).json()).people ?? []).find((x) => x.role === "supervisor")?.id;
  const dm = supId ? await (await hk.request.post(`${BASE}/api/chat/direct`, { data: { userId: supId } })).json() : {};
  if (dm.channelId) {
    await hk.request.post(`${BASE}/api/chat/channels/${dm.channelId}/messages`, { data: { body: "Frage zu #312 (Testnachricht)" } });
    const p = await hk.newPage();
    await p.goto(`${BASE}/chat`, { waitUntil: "networkidle" });
    await ackChat(p);
    await p.locator("main button").filter({ hasText: "👤" }).first().click({ timeout: 20_000 }).catch(() => {});
    const link = p.getByRole("button", { name: "#312" }).first();
    if (await visible(link, 20_000)) { await link.click(); await lightWindow(p, "Chat #312 als Housekeeper (alte Seite)", "d7-1280-chat-Housekeeper"); }
    else check(false, "Chat #312 als Housekeeper: Link gefunden");
  } else console.log("info Chat als Housekeeper: Direktnachricht nicht erlaubt");
  await hk.close();
  await sup.close();
}

await browser.close();
console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : "\nalle Prüfungen ok");
process.exit(failed ? 1 : 0);
