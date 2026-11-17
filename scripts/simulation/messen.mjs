// Simulation — Messung des Simulationsleiters direkt aus der Test-DB (nur lesen).
//   node scripts/simulation/messen.mjs <tag 1–5> [plan|ende]   → tests/simulation/runs/<lauf>/tag-N/messung-<phase>.{json,md}
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { DAYS, DB_URL, RUN, STATE } from "./lib/common.mjs";

const d = Number(process.argv[2]);
const phase = process.argv[3] || "ende";
const date = DAYS[d - 1];
if (!date) { console.error("Aufruf: messen.mjs <tag 1–5> [plan|ende]"); process.exit(1); }
process.env.DATABASE_URL = DB_URL;
const { PrismaClient } = createRequire(import.meta.url)("@prisma/client");
const p = new PrismaClient();
const berlin = (dt) => dt.toLocaleString("sv-SE", { timeZone: "Europe/Berlin" });
const dayOf = (dt) => berlin(dt).slice(0, 10);
const hm = (dt) => berlin(dt).slice(11, 16);
const exp = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests", "simulation", "opera", `tag-${d}`, "erwartung.json"), "utf8"));
const GUEST = /Test \d{3}/;

const rooms = await p.room.findMany({ include: { assignedTo: true } });
const roomById = new Map(rooms.map((r) => [r.id, r]));
const plans = await p.dayRoomPlan.findMany({ where: { date } });
const planByRoom = new Map(plans.map((x) => [x.roomId, x]));
const hks = await p.user.findMany({ where: { role: "room_attendant" } });
const from = new Date(`${date}T00:00:00+01:00`), to = new Date(from.getTime() + 86400000);
const logs = await p.auditLog.findMany({ where: { createdAt: { gte: from, lt: to } }, orderBy: { createdAt: "asc" } });
const prevLogs = d > 1 ? await p.auditLog.findMany({ where: { createdAt: { gte: new Date(from.getTime() - 86400000), lt: from }, action: "STATUS_CHANGE", toStatus: "CLEAN" } }) : [];
const notes = await p.notification.findMany({ where: { createdAt: { gte: from, lt: to } }, orderBy: { createdAt: "asc" } });

// 1 Import gegen erwartung.json
const count = (t) => plans.filter((x) => x.cleaningType === t).length;
const traces = await p.trace.findMany({ where: { status: "OPEN" } });
const tracesToday = traces.filter((t) => planByRoom.has(t.roomId) || t.date >= DAYS[Math.max(0, d - 2)]);
const imp = {
  abreisen: [count("DEPARTURE") + count("SAME_DAY_TURN"), exp.abreisen], turns: [count("SAME_DAY_TURN"), exp.davonTurns],
  anreisen: [count("ARRIVAL") + count("SAME_DAY_TURN"), exp.anreisen], bleiber: [count("STAYOVER"), exp.bleiber],
  waeschewechsel: [plans.filter((x) => x.laundryDue).length, exp.waeschewechsel], vip: [plans.filter((x) => x.vip).length, null],
  lateCheckout: [plans.filter((x) => x.lateCheckout).length, exp.lateCheckoutImReport], offeneTraces: [tracesToday.length, exp.traces.offen],
};
const waescheApp = plans.filter((x) => x.laundryDue).map((x) => roomById.get(x.roomId).number).sort();
const waescheDiff = { nurApp: waescheApp.filter((r) => !exp.zimmer.waeschewechsel.includes(r)), nurSoll: exp.zimmer.waeschewechsel.filter((r) => !waescheApp.includes(r)) };
const batches = await p.importBatch.findMany({ where: { businessDate: date }, orderBy: { createdAt: "asc" } });

// 2 Plan
const proposals = await p.autoPlanProposal.findMany({ where: { date }, orderBy: { createdAt: "asc" } });
const confirmed = proposals.filter((x) => x.status === "CONFIRMED").pop();
let warnings = [];
try { const pl = JSON.parse((confirmed ?? proposals[proposals.length - 1])?.payload ?? "{}"); warnings = (pl.warnings ?? []).map((w) => (typeof w === "string" ? w : w.code ?? JSON.stringify(w).slice(0, 80))); } catch { /* egal */ }
const warnCount = {}; for (const w of warnings) warnCount[w] = (warnCount[w] ?? 0) + 1;

// 3 je Kraft
const kindOf = (pl) => (!pl ? "ohne Tagesplan" : pl.cleaningType === "STAYOVER" ? (pl.laundryDue ? "Bleiber+Wäsche" : "Bleiber") : pl.cleaningType === "SAME_DAY_TURN" ? "Turn" : pl.cleaningType === "DEPARTURE" ? "Abreise" : "Anreise");
const cleanedBy = {}; // hkId → Set(roomId), heute fertig gemeldet
for (const l of logs) if (l.action === "STATUS_CHANGE" && l.toStatus === "CLEAN" && l.userId && l.roomId) (cleanedBy[l.userId] ??= new Set()).add(l.roomId);
const prevCleaner = new Map(); for (const l of prevLogs) if (hks.some((h) => h.id === l.userId)) prevCleaner.set(l.roomId, l.userId);
const perHk = hks.map((h) => {
  const mine = rooms.filter((r) => r.assignedToId === h.id && r.assignedOn === date);
  const mix = {}; for (const r of mine) { const k = kindOf(planByRoom.get(r.id)); mix[k] = (mix[k] ?? 0) + 1; }
  const floors = [...new Set(mine.map((r) => r.floor))].sort();
  const home = h.homeFloors ? h.homeFloors.split(",").map(Number) : [];
  const done = [...(cleanedBy[h.id] ?? [])].map((id) => roomById.get(id));
  return {
    name: h.name, typ: h.hkType, level: h.hkLevel, einschraenkung: h.hkRestrictions || null, abwesend: h.absentDate === date,
    zimmer: mine.length, credits: Math.round(mine.reduce((a, r) => a + (r.credit ?? 1), 0) * 100) / 100, mix,
    suiten: mine.filter((r) => (r.credit ?? 1) >= 1.5).length, vip: mine.filter((r) => planByRoom.get(r.id)?.vip).length, allergiker: mine.filter((r) => r.isAntiAllergic).length,
    etagen: floors, praeferenz: home, praeferenzTreffer: home.length ? mine.filter((r) => home.includes(r.floor)).length : null,
    fertigZimmer: done.length, fertigCredits: Math.round(done.reduce((a, r) => a + (r?.credit ?? 1), 0) * 100) / 100,
  };
}).filter((x) => x.zimmer || x.fertigZimmer || x.abwesend);

// 4 P13: gleiche Kraft wie gestern bei Bleibern
const stayovers = plans.filter((x) => x.cleaningType === "STAYOVER");
let same = 0, other = 0, noPrev = 0, prevAbsent = 0;
for (const s of stayovers) {
  const prev = prevCleaner.get(s.roomId); const r = roomById.get(s.roomId);
  if (!prev) { noPrev++; continue; }
  const prevHk = hks.find((h) => h.id === prev);
  if (!rooms.some((x) => x.assignedToId === prev && x.assignedOn === date) && prevHk?.absentDate !== date && r.assignedToId !== prev) { prevAbsent++; continue; }
  if (r.assignedToId === prev && r.assignedOn === date) same++; else other++;
}

// 5 Tagesstand
const toClean = plans.filter((x) => x.cleaningType !== "ARRIVAL").map((x) => roomById.get(x.roomId));
const status = {}; for (const r of toClean) status[r.status] = (status[r.status] ?? 0) + 1;
const unassigned = toClean.filter((r) => r.assignedOn !== date).map((r) => r.number).sort();

// 6 Meldungen
const nBy = {}; for (const n of notes) { const k = `${n.type} · ${n.level} · ${n.targetUserId ? "Person" : n.targetRole}`; nBy[k] = (nBy[k] ?? 0) + 1; }
const actions = {}; for (const l of logs) actions[l.action] = (actions[l.action] ?? 0) + 1;

// 7 Datenschutz: Gastnamen dort, wo sie nicht hingehören
const scan = (file) => { try { return fs.readFileSync(file, "utf8").split("\n").filter((l) => GUEST.test(l)); } catch { return []; } };
const serverHits = scan(path.join(STATE, "server.log"));
const sockFile = path.join(RUN, `tag-${d}`, "raw", "_socket-ohne-anmeldung.jsonl");
const sockLines = (() => { try { return fs.readFileSync(sockFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } })();
const sockEvents = {}; const sockGuest = {};
for (const s of sockLines) { sockEvents[s.event] = (sockEvents[s.event] ?? 0) + 1; if (GUEST.test(s.payload)) sockGuest[s.event] = (sockGuest[s.event] ?? 0) + 1; }
const privacy = {
  serverLogZeilenMitGastnamen: serverHits.length, beispielServerLog: serverHits[0]?.slice(0, 160) ?? null,
  socketOhneAnmeldung: { ereignisse: sockEvents, mitGastnamen: sockGuest },
  meldungenMitGastnamen: notes.filter((n) => GUEST.test(n.message) || GUEST.test(n.messageVars ?? "")).length,
  logbuchMitGastnamen: logs.filter((l) => GUEST.test(l.meta ?? "")).length,
};

const out = {
  tag: d, date, phase, gemessenUm: berlin(new Date(Date.now() + JSON.parse(fs.readFileSync(path.join(STATE, "clock.json"), "utf8")).offsetMs)),
  import: imp, waescheAbweichung: waescheDiff, uploads: batches.map((b) => `${hm(b.createdAt)} ${b.type} ${b.status} (${b.rowCount} Zeilen, ${b.issueCount} Befunde)`),
  plan: { vorschlaege: proposals.length, bestaetigtUm: confirmed?.confirmedAt ? hm(confirmed.confirmedAt) : null, vor0800: confirmed?.confirmedAt ? hm(confirmed.confirmedAt) < "08:00" : false, warnungen: warnCount, abweichungenVorschlag: (() => { try { return JSON.parse(confirmed?.deviations ?? "[]").length; } catch { return null; } })() },
  jeKraft: perHk, p13: { bleiber: stayovers.length, gleicheKraft: same, andereKraft: other, ohneVortag: noPrev, vortagsKraftNichtImDienst: prevAbsent },
  stand: { zuReinigen: toClean.length, status, ohneZuteilung: unassigned },
  meldungen: nBy, logbuch: actions, datenschutz: privacy,
};
const dir = path.join(RUN, `tag-${d}`); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `messung-${phase}.json`), JSON.stringify(out, null, 1) + "\n");
const row = (k) => `| ${k.name} | ${k.typ} L${k.level}${k.einschraenkung ? " " + k.einschraenkung : ""}${k.abwesend ? " (krank)" : ""} | ${k.zimmer} | ${k.credits} | ${Object.entries(k.mix).map(([a, b]) => `${b} ${a}`).join(", ")} | ${k.suiten} | ${k.vip}/${k.allergiker} | ${k.etagen.join(",")} | ${k.praeferenz.join(",") || "–"} → ${k.praeferenzTreffer ?? "–"} | ${k.fertigZimmer} / ${k.fertigCredits} |`;
const md = [`# Messung Tag ${d} (${date}) — ${phase}, Stand ${out.gemessenUm}`, "",
  "## Import: App vs. erwartung.json", ...Object.entries(imp).map(([k, [a, s]]) => `- ${k}: App **${a}**, Soll ${s ?? "–"}${s !== null && a !== s ? " ✖" : " ✔"}`),
  waescheDiff.nurApp.length || waescheDiff.nurSoll.length ? `- Wäschewechsel-Abweichung: nur App ${waescheDiff.nurApp.join(",") || "–"}; nur Soll ${waescheDiff.nurSoll.join(",") || "–"}` : "", `- Uploads: ${out.uploads.join(" · ")}`, "",
  `## Plan`, `- Vorschläge: ${proposals.length}; bestätigt um **${out.plan.bestaetigtUm ?? "–"}** (${out.plan.vor0800 ? "vor 08:00 ✔" : "NICHT vor 08:00 ✖"}); Abweichungen Vorschlag→Plan: ${out.plan.abweichungenVorschlag}`, `- Warnungen: ${JSON.stringify(warnCount)}`, "",
  "## Je Kraft", "| Kraft | Typ | Zimmer | Credits | Mischung | Suiten | VIP/Allerg. | Etagen | Präferenz → Treffer | fertig Zi./Cr. |", "|---|---|---|---|---|---|---|---|---|---|", ...perHk.map(row), "",
  `## P13 gleiche Kraft bei Bleibern`, `- ${same} gleiche Kraft, ${other} andere Kraft, ${noPrev} ohne Reinigung am Vortag, ${prevAbsent} Vortagskraft nicht im Dienst (von ${stayovers.length} Bleibern)`, "",
  `## Stand`, `- zu reinigen ${toClean.length}: ${JSON.stringify(status)}; ohne Zuteilung: ${unassigned.length ? unassigned.join(",") : "–"}`, "",
  `## Meldungen (Art · Stufe · Ziel)`, ...Object.entries(nBy).map(([k, v]) => `- ${v}× ${k}`), "",
  `## Datenschutz`, `- Server-Log: ${privacy.serverLogZeilenMitGastnamen} Zeilen mit Gastnamen${privacy.beispielServerLog ? ` (z. B. „${privacy.beispielServerLog}“)` : ""}`,
  `- Live-Kanal ohne Anmeldung: ${Object.entries(sockEvents).map(([k, v]) => `${k} ${v}${sockGuest[k] ? ` (**${sockGuest[k]} mit Gastnamen**)` : ""}`).join(", ") || "nichts empfangen"}`,
  `- Meldungen mit Gastnamen: ${privacy.meldungenMitGastnamen}; Logbuch-Einträge mit Gastnamen: ${privacy.logbuchMitGastnamen}`, ""].filter((x) => x !== "").join("\n");
fs.writeFileSync(path.join(dir, `messung-${phase}.md`), md + "\n");
console.log(md);
await p.$disconnect();
