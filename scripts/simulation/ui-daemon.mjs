// Simulation „5 Hoteltage“ — Browser-Dienst für die Rollen-Agenten.
// Hält je Person ein eigenes Gerät (Chromium mit Touch: Handy oder iPad) offen, damit Live-Meldungen (Socket.IO),
// Pop-ups und Ton wie im echten Betrieb ankommen. Agenten sprechen ihn über `node scripts/simulation/ui.mjs` an.
// Kein App-Code wird geändert; die Test-Uhr wird nur im Browser der Agenten verschoben.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { io } from "socket.io-client";
import { BASE, CLOCK_FILE, DB_URL, RUN, UI_PORT, dayDir, offsetMs, parseBerlin, simStamp } from "./lib/common.mjs";

const require = createRequire(import.meta.url);
process.env.DATABASE_URL = DB_URL;
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" };
const IPAD = { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" };
const STAFF = {
  dm: ["manager@hotel.test", IPAD], sup1: ["supervisor@hotel.test", IPAD], sup2: ["supervisor2@hotel.test", IPAD],
  fo: ["frontoffice@hotel.test", IPAD], concierge: ["concierge@hotel.test", IPAD],
  technik: ["engineering@hotel.test", PHONE], hausmann: ["houseman@hotel.test", PHONE],
  ...Object.fromEntries(["maria", "aylin", "petra", "lucia", "elena", "fatima", "grace", "joanna", "sena"].map((n) => [n, [`${n}@hotel.test`, PHONE]])),
};

const INIT = `(() => {
  const R = Date; const cur = () => Number(window.__simOff || 0);
  function SimDate(...a) { if (!new.target) return new R(R.now() + cur()).toString(); return a.length ? new R(...a) : new R(R.now() + cur()); }
  SimDate.prototype = R.prototype; SimDate.now = () => R.now() + cur(); SimDate.parse = R.parse; SimDate.UTC = R.UTC; window.Date = SimDate;
  try { localStorage.setItem("stayclean.sound", "on"); } catch {}
  const send = (o) => { try { window.__simEvent && window.__simEvent(JSON.stringify(o)); } catch {} };
  window.addEventListener("stayclean:sound", (e) => send({ t: "ton", d: e.detail }));
  const seen = new WeakSet();
  const scan = (n) => { if (n.nodeType !== 1) return; const els = n.matches && n.matches("[data-notify-toast]") ? [n] : [...(n.querySelectorAll ? n.querySelectorAll("[data-notify-toast]") : [])];
    for (const el of els) { if (seen.has(el)) continue; seen.add(el); setTimeout(() => send({ t: "popup", art: el.getAttribute("data-notify-toast"), dringend: el.getAttribute("role") === "alert", text: (el.innerText || "").replace(/\\s+/g, " ").slice(0, 220) }), 50); } };
  new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) scan(n); }).observe(document, { childList: true, subtree: true });
})();`;

const users = new Map();
let browser;
const rawLog = (who, entry) => { try { fs.appendFileSync(path.join(dayDir(), "raw", `${who}.jsonl`), JSON.stringify({ zeit: simStamp(), ...entry }) + "\n"); } catch { /* egal */ } };

// Speicher: Der PC hat nur ~8 GB. Höchstens MAX_OPEN Geräte gleichzeitig offen; das am längsten unbenutzte wird
// geschlossen (wie ein Handy, das in die Tasche gesteckt wird). Beim nächsten Befehl öffnet es sich neu und ist angemeldet.
const MAX_OPEN = Number(process.env.SIM_MAX_DEVICES || 7);
async function closeIdle(keep) {
  const open = [...users.values()].filter((x) => x.who !== keep).sort((a, b) => a.last - b.last);
  while (users.size >= MAX_OPEN && open.length) {
    const u = open.shift();
    users.delete(u.who);
    rawLog(u.who, { geraet: "geschlossen (Speicher)" });
    await u.ctx.close().catch(() => {});
  }
}

async function getUser(who, opts = {}) {
  if (users.has(who)) { users.get(who).last = Date.now(); return users.get(who); }
  await closeIdle(who);
  const guest = /^gast-(\d{3})$/.exec(who);
  const def = STAFF[who];
  if (!guest && !def) throw new Error(`Unbekannte Person „${who}“. Bekannt: ${Object.keys(STAFF).join(", ")}, gast-<Zimmer>`);
  const lang = opts.lang || "de-DE";
  const ctx = await browser.newContext({ ...(guest ? PHONE : def[1]), locale: lang, timezoneId: "Europe/Berlin", reducedMotion: "reduce", baseURL: BASE });
  const u = { who, ctx, page: null, email: def?.[0] ?? null, events: [], net: [], errors: [], chain: Promise.resolve(), cursor: { ev: 0, net: 0, err: 0 }, last: Date.now(), fresh: true };
  await ctx.exposeBinding("__simEvent", (_src, json) => { try { const o = JSON.parse(json); u.events.push({ zeit: simStamp(), ...o }); rawLog(who, { ereignis: o }); } catch { /* egal */ } });
  await ctx.addInitScript(`window.__simOff = ${offsetMs()};`);
  await ctx.addInitScript(INIT);
  if (u.email) await login(u);
  u.page = await ctx.newPage();
  u.page.on("response", async (res) => {
    const url = new URL(res.url());
    if (!url.pathname.startsWith("/api/")) return;
    const req = res.request();
    u.net.push({ m: req.method(), p: url.pathname + url.search, s: res.status(), body: req.method() === "GET" ? undefined : (req.postData() || "").slice(0, 300) });
    if (u.net.length > 400) { u.net.splice(0, 100); u.cursor.net = Math.max(0, u.cursor.net - 100); }
  });
  u.page.on("pageerror", (e) => u.errors.push(`Seitenfehler: ${String(e.message).slice(0, 200)}`));
  u.page.on("console", (m) => { if (m.type() === "error") u.errors.push(`Konsole: ${m.text().slice(0, 200)}`); });
  users.set(who, u);
  return u;
}
async function login(u) {
  const res = await u.ctx.request.post(`${BASE}/api/auth/dev-login`, { data: { email: u.email } });
  if (!res.ok()) throw new Error(`Anmeldung ${u.email} fehlgeschlagen (${res.status()})`);
}

const SNAP = (opts) => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 1 && r.height > 1 && s.visibility !== "hidden" && s.display !== "none"; };
  const dialogs = [...document.querySelectorAll('[role=dialog],[aria-modal="true"]')].filter(vis);
  const root = dialogs.length ? dialogs[dialogs.length - 1] : document.body;
  const sel = 'a[href],button,input,select,textarea,[role=button],[role=tab],[role=switch],[role=checkbox],[role=radio],[role=menuitem],[role=option],[tabindex="0"]';
  const els = [...root.querySelectorAll(sel)].filter(vis);
  window.__simEls = els;
  const label = (el) => (el.getAttribute("aria-label") || el.innerText || el.value || el.placeholder || el.title || el.name || "").replace(/\s+/g, " ").trim().slice(0, 80);
  let items = els.map((el, i) => {
    const tag = el.tagName.toLowerCase();
    const type = tag === "input" ? `eingabe:${el.type}` : tag === "a" ? "link" : tag === "select" ? "auswahl" : tag === "textarea" ? "textfeld" : el.getAttribute("role") || "knopf";
    const dis = el.disabled || el.getAttribute("aria-disabled") === "true" ? " (gesperrt)" : "";
    const on = ["aria-pressed", "aria-selected", "aria-checked"].some((a) => el.getAttribute(a) === "true") ? " (aktiv)" : "";
    const val = tag === "select" ? ` = ${el.options[el.selectedIndex]?.text ?? ""} {${[...el.options].map((o) => o.text).slice(0, 12).join(" | ")}}` : (tag === "input" || tag === "textarea") && el.value && el.type !== "file" ? ` = „${String(el.value).slice(0, 40)}“` : "";
    const r = el.getBoundingClientRect();
    const small = (r.width < 43.5 || r.height < 43.5) && tag !== "input" && tag !== "select" && tag !== "textarea" ? ` <klein ${Math.round(r.width)}×${Math.round(r.height)}>` : "";
    return `[${i}] ${type} "${label(el)}"${val}${dis}${on}${opts.sizes ? small : ""}`;
  });
  let text = (root.innerText || "").replace(/[ \t]+\n/g, "\n").replace(/\n{2,}/g, "\n");
  if (opts.find) {
    const f = opts.find.toLowerCase();
    items = items.filter((x) => x.toLowerCase().includes(f));
    const lines = text.split("\n");
    text = lines.flatMap((l, i) => (l.toLowerCase().includes(f) ? [lines.slice(Math.max(0, i - 2), i + 4).join(" ⏎ ")] : [])).slice(0, 25).join("\n");
  }
  const total = items.length;
  return { url: location.pathname + location.search, dialog: dialogs.length > 0, text: text.slice(0, opts.max), cut: text.length > opts.max, items: items.slice(0, opts.maxItems), total };
};

async function snapshot(u, opts = {}) {
  const s = await u.page.evaluate(SNAP, { max: opts.max ?? 1800, maxItems: opts.maxItems ?? 60, find: opts.find ?? null, sizes: !!opts.sizes });
  return [`── ${u.who} · ${simStamp()} · ${s.url}${s.dialog ? " · FENSTER offen" : ""}`, s.text + (s.cut ? " …[gekürzt: mehr mit `look --mehr` oder `look --suche <Wort>`]" : ""),
    `Bedienelemente (${s.items.length}${s.total > s.items.length ? ` von ${s.total}` : ""}):`, ...s.items].join("\n");
}
function news(u, all = false) {
  const out = [];
  const ev = u.events.slice(u.cursor.ev); u.cursor.ev = u.events.length;
  for (const e of ev) out.push(e.t === "ton" ? `🔔 TON ${e.zeit} (${e.d?.kind ?? "?"}${e.d?.played === false ? ", nicht abgespielt" : ""})` : `💬 POP-UP ${e.zeit}${e.dringend ? " DRINGEND" : ""} [${e.art}] ${e.text}`);
  const net = u.net.slice(u.cursor.net); u.cursor.net = u.net.length;
  for (const n of net) if (all || n.m !== "GET" || n.s >= 400) out.push(`↔ ${n.m} ${n.p} → ${n.s}${n.body ? `  ${n.body}` : ""}`);
  const err = u.errors.slice(u.cursor.err); u.cursor.err = u.errors.length;
  for (const e of [...new Set(err)].slice(0, 5)) out.push(`⚠ ${e}`);
  return out;
}
const settle = async (u, ms = 500) => { await u.page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {}); await u.page.waitForTimeout(ms); };
async function target(u, ref) {
  if (/^\d+$/.test(ref)) {
    const h = await u.page.evaluateHandle((i) => window.__simEls?.[i] ?? null, Number(ref));
    const el = h.asElement();
    if (!el) throw new Error(`Element [${ref}] gibt es nicht mehr — bitte erst \`look\`.`);
    return el;
  }
  for (const loc of [u.page.getByRole("button", { name: ref }), u.page.getByRole("link", { name: ref }), u.page.getByRole("tab", { name: ref }), u.page.getByText(ref, { exact: false })]) {
    const vis = loc.filter({ visible: true });
    const n = await vis.count();
    if (n > 0) return (await vis.last().elementHandle());
  }
  throw new Error(`Nichts Sichtbares mit „${ref}“ gefunden.`);
}

async function run(u, cmd, args) {
  const flag = (name) => { const i = args.indexOf(`--${name}`); if (i < 0) return null; const v = args[i + 1] ?? ""; args.splice(i, 2); return v; };
  const has = (name) => { const i = args.indexOf(`--${name}`); if (i < 0) return false; args.splice(i, 1); return true; };
  const p = u.page;
  const done = async (extra = [], snapOpts = { max: 1100, maxItems: 40 }) => [...extra, ...news(u), await snapshot(u, snapOpts)].join("\n");
  // Gerät war geschlossen (Speicher) und ist neu: erst die Startseite laden, damit Meldungen/Live-Verbindung wieder laufen.
  if (u.fresh && !["open", "open-guest", "api"].includes(cmd)) { await p.goto("/", { waitUntil: "domcontentloaded" }).catch(() => {}); await settle(u, 700); }
  u.fresh = false;
  switch (cmd) {
    case "open": { await p.goto(args[0] || "/", { waitUntil: "domcontentloaded" }); await settle(u, 700); return done(); }
    case "open-guest": {
      const room = /^gast-(\d{3})$/.exec(u.who)[1];
      const r = await prisma.room.findUnique({ where: { number: room }, select: { guestAccessCode: true } });
      if (!r?.guestAccessCode) throw new Error(`Zimmer ${room} hat keinen Gäste-Code (QR/NFC).`);
      await p.goto(`/g/r/${r.guestAccessCode}`, { waitUntil: "domcontentloaded" }); await settle(u, 700); return done([`(QR-Code im Zimmer ${room} gescannt)`]);
    }
    case "look": { const more = has("mehr"); const sizes = has("groessen"); const find = flag("suche"); await p.waitForTimeout(150); return done([], { max: more ? 7000 : 1800, maxItems: more ? 200 : 60, find, sizes }); }
    case "tap": { const el = await target(u, args[0]); await el.scrollIntoViewIfNeeded().catch(() => {}); await el.tap({ timeout: 5000 }).catch(async () => { await el.click({ timeout: 5000, force: true }); }); await settle(u); return done(); }
    case "tap2": {
      // Zwei-Tipp-Knöpfe („Nochmal tippen zum Bestätigen“) verfallen nach 1–2 s — zweiter Tipp sofort hinterher, wie ein Mensch.
      const el = await target(u, args[0]); await el.scrollIntoViewIfNeeded().catch(() => {});
      await el.tap({ timeout: 5000 }).catch(async () => { await el.click({ timeout: 5000, force: true }); });
      await p.waitForTimeout(350);
      const again = async () => { const loc = p.getByText(/Nochmal tippen|Tap again|zum Bestätigen/i).filter({ visible: true }); if (await loc.count()) { await loc.last().tap({ timeout: 3000 }); return true; } return false; };
      if (!(await again())) await el.tap({ timeout: 3000 }).catch(() => {});
      await settle(u); return done(["(zwei Tipps kurz hintereinander)"]);
    }
    case "fill": { const el = await target(u, args[0]); await el.fill(args.slice(1).join(" ")); await p.waitForTimeout(200); return done([], { max: 500, maxItems: 40 }); }
    case "choose": { const el = await target(u, args[0]); const v = args.slice(1).join(" "); await el.selectOption({ label: v }).catch(() => el.selectOption(v)); await settle(u, 300); return done(); }
    case "key": { await p.keyboard.press(args[0]); await settle(u, 300); return done(); }
    case "scroll": { await p.mouse.wheel(0, Number(args[0] ?? 700)); await p.waitForTimeout(300); return done(); }
    case "back": { await p.goBack().catch(() => {}); await settle(u); return done(); }
    case "upload": {
      const files = args.map((f) => path.resolve(f));
      for (const f of files) if (!fs.existsSync(f)) throw new Error(`Datei fehlt: ${f}`);
      const input = p.locator('input[type="file"]').last();
      if (!(await input.count())) throw new Error("Kein Datei-Feld auf dieser Seite.");
      await input.setInputFiles(files); await settle(u, 1500); return done([`(${files.length} Datei(en) gewählt)`]);
    }
    case "drop": {
      const where = flag("auf");
      const files = args.map((f) => path.resolve(f));
      const payload = files.map((f) => ({ name: path.basename(f), b64: fs.readFileSync(f).toString("base64"), type: f.endsWith(".pdf") ? "application/pdf" : f.endsWith(".csv") ? "text/csv" : "application/octet-stream" }));
      const el = where ? await target(u, where) : await (async () => { const h = await p.evaluateHandle(() => document.querySelector('input[type="file"]')?.closest("label,section,div") ?? document.body); return h.asElement(); })();
      const dt = await p.evaluateHandle((fl) => { const dt = new DataTransfer(); for (const f of fl) dt.items.add(new File([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))], f.name, { type: f.type })); return dt; }, payload);
      for (const ev of ["dragenter", "dragover", "drop"]) await el.dispatchEvent(ev, { dataTransfer: dt });
      await settle(u, 2500); return done([`(${files.length} Datei(en) per Drag-and-Drop abgelegt)`]);
    }
    case "api": {
      const save = flag("speichern");
      const [method, pth, ...rest] = args;
      const data = rest.length ? JSON.parse(rest.join(" ")) : undefined;
      const res = await u.ctx.request.fetch(BASE + pth, { method, data, failOnStatusCode: false });
      const body = await res.text();
      rawLog(u.who, { api: `${method} ${pth}`, status: res.status(), gesendet: data });
      if (save) { fs.mkdirSync(path.dirname(path.resolve(save)), { recursive: true }); fs.writeFileSync(path.resolve(save), body); }
      return [`↔ ${method} ${pth} → ${res.status()}`, save ? `(Antwort ${body.length} Zeichen gespeichert: ${save})` : body.slice(0, 1500) + (body.length > 1500 ? ` …[${body.length} Zeichen; ganz mit --speichern <Datei>]` : ""), ...news(u)].join("\n");
    }
    case "inbox": { const n = news(u); return n.length ? n.join("\n") : "(nichts Neues)"; }
    case "net": { return u.net.slice(-Number(args[0] ?? 15)).map((n) => `↔ ${n.m} ${n.p} → ${n.s}${n.body ? `  ${n.body}` : ""}`).join("\n") || "(keine Aufrufe)"; }
    case "shot": { const f = path.join(dayDir(), "screens", `${u.who}-${simStamp().slice(11).replace(":", "")}-${(args[0] || "bild").replace(/[^a-z0-9-]/gi, "_")}.png`); await p.screenshot({ path: f }); return `Screenshot: ${path.relative(process.cwd(), f)}`; }
    case "offline": { const on = args[0] !== "aus"; await u.ctx.setOffline(on); await p.waitForTimeout(on ? 4000 : 2500); return done([on ? "(WLAN AUS)" : "(WLAN wieder AN)"]); }
    case "reload": { await p.reload({ waitUntil: "domcontentloaded" }); await settle(u, 700); return done(); }
    default: throw new Error(`Unbekannter Befehl „${cmd}“. Befehle: open, open-guest, look, tap, fill, choose, key, scroll, back, upload, drop, api, inbox, net, shot, offline, reload`);
  }
}

// Mithören ohne Anmeldung: was sendet der Server an jeden verbundenen Client? (Datenschutz-Prüfung)
function listenAnonymous() {
  const sock = io(BASE, { path: "/socket.io", transports: ["websocket"], reconnection: true });
  sock.onAny((event, payload) => { try { fs.appendFileSync(path.join(dayDir(), "raw", "_socket-ohne-anmeldung.jsonl"), JSON.stringify({ zeit: simStamp(), event, payload: JSON.stringify(payload ?? null).slice(0, 3000) }) + "\n"); } catch { /* egal */ } });
}

async function setClock() {
  const off = offsetMs();
  for (const u of users.values()) {
    await u.ctx.addInitScript(`window.__simOff = ${off};`);
    await u.page.evaluate((o) => { window.__simOff = o; }, off).catch(() => {});
    if (u.email) await login(u).catch(() => {});
  }
  return `Browser-Uhr aller Geräte: ${simStamp()} (${users.size} Geräte)`;
}

// Uhr-Wächter: Bleibt die Simulation stehen (Pause, Limit), darf die Test-Uhr nicht stundenlang weiterlaufen
// (sonst feuern Nachtlöschung und Eskalationen mitten im „Tag“). Mehr als 9 Minuten nach dem Stellen wird sie auf +8 Minuten zurückgesetzt.
setInterval(async () => {
  try {
    const c = JSON.parse(fs.readFileSync(CLOCK_FILE, "utf8"));
    if (!c.gestellt) return;
    const base = parseBerlin(c.gestellt);
    if (Date.now() + c.offsetMs <= base + 9 * 60000) return;
    const off = base + 8 * 60000 - Date.now();
    fs.writeFileSync(CLOCK_FILE, JSON.stringify({ ...c, offsetMs: off }));
    await prisma.$executeRawUnsafe(`UPDATE _sim_clock SET offsetMs = ${Math.round(off)} WHERE id = 1`);
    for (const u of users.values()) { await u.ctx.addInitScript(`window.__simOff = ${off};`); await u.page.evaluate((o) => { window.__simOff = o; }, off).catch(() => {}); }
  } catch { /* Uhr-Datei wird gerade geschrieben */ }
}, 30000);

browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--renderer-process-limit=4", "--disable-gpu", "--js-flags=--max-old-space-size=256"] });
fs.mkdirSync(RUN, { recursive: true });
listenAnonymous();
http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    const reply = (code, text) => { res.writeHead(code, { "content-type": "text/plain; charset=utf-8" }); res.end(text); };
    try {
      if (req.url === "/clock") return reply(200, await setClock());
      if (req.url === "/status") return reply(200, `${simStamp()} · Geräte: ${[...users.keys()].join(", ") || "keine"}`);
      const { who, cmd, args = [], lang } = JSON.parse(body || "{}");
      const u = await getUser(who, { lang });
      const job = u.chain.then(async () => {
        const started = Date.now();
        try { const out = await run(u, cmd, [...args]); rawLog(who, { befehl: cmd, args, ms: Date.now() - started }); return out; }
        catch (e) { rawLog(who, { befehl: cmd, args, fehler: String(e.message).slice(0, 300) }); return `✖ ${String(e.message).split("\n")[0].slice(0, 400)}\n${news(u).join("\n")}`; }
      });
      u.chain = job.catch(() => {});
      reply(200, await job);
    } catch (e) { reply(500, `✖ ${e.message}`); }
  });
}).listen(UI_PORT, "127.0.0.1", () => console.log(`UI-Dienst bereit auf Port ${UI_PORT}, Uhr ${simStamp()}`));
