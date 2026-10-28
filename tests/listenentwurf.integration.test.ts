import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** Listenentwurf gegen eine echte (Wegwerf-)SQLite-DB: Zahlen, nur gewählte Kräfte, Hausmann-Verteilung, Mehrfachzuteilung, Meldungen. */
const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-entwurf-"));
  return { dir: d, url: `file:${p.join(d, "test.db")}` };
});
vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient({ datasources: { db: { url } } }) };
});
const getSessionMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: (...a: unknown[]) => getSessionMock(...a) }));
const broadcastMock = vi.fn();
vi.mock("@/lib/realtime", () => ({ broadcast: (...a: unknown[]) => broadcastMock(...a) }));

import { prisma } from "@/lib/db";
import { berlinDate } from "@/lib/dayplan/time";
import { confirmProposal, checkRedistribution, proposeForDate } from "@/lib/autoplan/service";
import { loadDay, teamIdsFor } from "@/lib/autoplan/load";
import { getDayNumbers } from "@/lib/dayplan/dayNumbersData";
import { numbersConsistent } from "@/lib/dayplan/dayNumbers";
import { POST as bulkAssign } from "@/app/api/rooms/bulk-assign/route";
import { GET as numbersGet } from "@/app/api/day-numbers/route";
import type { Session } from "@/lib/auth";

const DATE = berlinDate(new Date());
const id: Record<string, string> = {};
const roomId: Record<string, string> = {};
let dm: Session;
const as = (key: string | null, role = "supervisor") => { getSessionMock.mockReset(); getSessionMock.mockResolvedValue(key ? { userId: id[key], name: key, role } : null); };
const bulk = (body: unknown) => bulkAssign(new NextRequest("http://x/api/rooms/bulk-assign", { method: "POST", body: JSON.stringify(body) }));

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  const mk = async (key: string, role: string, extra: object = {}) => { id[key] = (await prisma.user.create({ data: { email: `${key}@x.test`, name: key, passwordHash: "x", role, ...extra } })).id; };
  await mk("dm", "duty_manager"); await mk("sup1", "supervisor"); await mk("sup2", "supervisor");
  for (const k of ["a", "b", "c", "d", "e", "f"]) await mk(k, "room_attendant", { hkType: "VOLLZEIT", hkLevel: 2 });
  await mk("hm1", "houseman"); await mk("hm2", "houseman");
  dm = { userId: id.dm, name: "dm", role: "duty_manager" };
  // 40 Zimmer mit Service (Abreise/Turn/Bleiber), alle belegt; Etagen 1–4; 2 davon schon fertig, 1 außer Betrieb
  for (let i = 1; i <= 40; i++) {
    const n = String(100 * (1 + Math.floor((i - 1) / 10)) + i);
    const status = i === 39 ? "OUT_OF_ORDER" : i <= 2 ? "INSPECTED" : "DIRTY";
    const r = await prisma.room.create({ data: { number: n, floor: 1 + Math.floor((i - 1) / 10), section: "A", type: "STANDARD", occupancy: "OCCUPIED", status, statusSince: new Date("2000-01-01") } });
    roomId[n] = r.id;
    const cleaningType = i % 6 === 0 ? "SAME_DAY_TURN" : i % 3 === 0 ? "DEPARTURE" : "STAYOVER";
    await prisma.dayRoomPlan.create({ data: { date: DATE, roomId: r.id, cleaningType, nights: cleaningType === "STAYOVER" ? i : null, laundryDue: cleaningType === "STAYOVER" && i % 4 === 0 } });
  }
  // Hausmann-Traces auf Etagen 1–3
  for (let i = 0; i < 6; i++) {
    const room = Object.keys(roomId)[i * 5];
    await prisma.trace.create({ data: { roomId: roomId[room], code: "TWIN", date: DATE, text: `t${i}`, dept: "HOUSEMAN", dedupeKey: `k${i}`, source: "TRACES" } });
  }
}, 120_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Zahlen aus der Datenbank", () => {
  it("alle belegten Zimmer sind in der Planmenge; Invariante gilt; Nicht-Gereinigtes steht mit Grund da", async () => {
    const { numbers } = await getDayNumbers(DATE);
    expect(numbers.occupied).toBe(33); // heute Nacht belegt: 40 − 7 reine Abreisen (Abreise-Zimmer sind abends frei)
    expect(numbers.toClean).toBe(39); // 1 außer Betrieb
    expect(numbers.notCleaned).toMatchObject({ total: 1, byReason: { outOfOrder: 1 } });
    expect(numbers.cleaned).toBe(2); // zwei schon fertig
    expect(numbers.assigned).toBe(2); // fertig zählt als zugeteilt
    expect(numbers.open).toBe(37);
    expect(numbersConsistent(numbers)).toBe(true);
    expect(numbers.laundryDue?.count).toBeGreaterThan(0);
  });
  it("die API liefert dieselben Zahlen — nur für Supervisor/Duty Manager", async () => {
    as("a", "room_attendant");
    expect((await numbersGet()).status).toBe(403);
    as("sup1");
    const body = await (await numbersGet()).json();
    expect(body.numbers.toClean).toBe(39);
  });
});

describe("Planung nur mit den gewählten Kräften", () => {
  it("4 von 6 Kräften gewählt, 37 Zimmer: alle werden verteilt, Warnung „Personal reicht nicht“, niemand sonst bekommt Zimmer", async () => {
    await prisma.setting.create({ data: { key: "targetCreditsPerAttendant", value: "4" } }); // 37 Zimmer brauchen dann mehr als die 4 gewählten Kräfte
    await prisma.setting.create({ data: { key: "planningTeam", value: JSON.stringify({ date: DATE, hk: [id.a, id.b, id.c, id.d], sup: [id.sup1], hm: [id.hm1] }) } });
    await prisma.user.updateMany({ where: { id: { in: [id.e, id.f] } }, data: { absentDate: DATE } });
    expect(await teamIdsFor(DATE)).toEqual([id.a, id.b, id.c, id.d]);
    const p = await proposeForDate(DATE, id.dm);
    expect(p.payload.input.housekeepers.map((h) => h.id).sort()).toEqual([id.a, id.b, id.c, id.d].sort());
    expect(p.payload.result.unassigned).toEqual([]);
    expect(p.payload.input.rooms).toHaveLength(37);
    const few = p.payload.result.warnings.find((w) => w.code === "TOO_FEW_STAFF");
    expect(few?.message).toMatch(/Personal reicht nicht: benötigt \d+ Kräfte, ausgewählt 4/);
    expect(new Set(Object.values(p.payload.result.assignment))).toEqual(new Set([id.a, id.b, id.c, id.d]));
  });

  it("Bestätigen erweitert die Auswahl nie; Hausmann bekommt alle Traces; Meldungen nur an die Betroffenen", async () => {
    // auch wenn die anderen beiden „anwesend" wirken würden: Abwesenheit zurücksetzen → Auswahl bleibt trotzdem die gewählte
    await prisma.user.updateMany({ where: { id: { in: [id.e, id.f] } }, data: { absentDate: null } });
    const pr = await prisma.autoPlanProposal.findFirstOrThrow({ where: { date: DATE, status: "DRAFT" } });
    const { result } = JSON.parse(pr.payload);
    const out = await confirmProposal(pr.id, result.assignment, dm);
    expect(out.open).toBe(0);
    expect(await teamIdsFor(DATE)).toEqual([id.a, id.b, id.c, id.d]);
    const day = await loadDay(DATE);
    expect(day.hks.filter((h) => h.present).map((h) => h.id).sort()).toEqual([id.a, id.b, id.c, id.d].sort());
    const assignedTo = new Set((await prisma.room.findMany({ where: { assignedToId: { not: null } } })).map((r) => r.assignedToId));
    expect([...assignedTo].every((x) => [id.a, id.b, id.c, id.d].includes(x!))).toBe(true);
    // Hausmann: ein gewählter (hm1) → alle 6 Traces; hm2 nicht gewählt → nichts, keine Meldung
    const traces = await prisma.trace.findMany({ where: { dept: "HOUSEMAN" } });
    expect(traces.every((t) => t.assignedToId === id.hm1)).toBe(true);
    const notes = await prisma.notification.findMany({ where: { type: "PLAN_CONFIRMED" } });
    const who = new Set(notes.map((n) => n.targetUserId));
    expect(who.has(id.hm1)).toBe(true);
    expect(who.has(id.hm2)).toBe(false); // nicht gewählter Hausmann
    expect(who.has(id.sup2)).toBe(false); // nicht gewählter Supervisor
    expect(who.has(id.sup1)).toBe(true);
    for (const k of ["a", "b", "c", "d"]) expect(who.has(id[k])).toBe(true); // jede gewählte Kraft mit Zimmern bekommt ihre Liste
    for (const k of ["e", "f"]) expect(who.has(id[k])).toBe(false);
    expect(who.has(id.dm)).toBe(false); // wer bestätigt, wird nicht gemeldet
    // genau eine Meldung je Person (kein Doppel)
    expect(notes.length).toBe(who.size);
    expect(JSON.stringify(notes)).not.toMatch(/Krüger|guestName/);
  });

  it("Umverteilung rechnet danach nur mit den gewählten Kräften (nie mit e/f)", async () => {
    await prisma.room.updateMany({ where: { assignedToId: id.a }, data: { status: "CLEAN" } }); // a früher fertig
    await checkRedistribution(DATE);
    const open = await prisma.redistributionSuggestion.findMany({ where: { date: DATE } });
    const toIds = open.flatMap((s) => (JSON.parse(s.moves) as { toId: string }[]).map((m) => m.toId));
    expect(toIds.every((x) => [id.a, id.b, id.c, id.d].includes(x))).toBe(true);
  });
});

describe("Gebündelt zuteilen (Mehrfachauswahl, Ziehen)", () => {
  beforeAll(async () => { await prisma.room.updateMany({ where: { status: { not: "OUT_OF_ORDER" } }, data: { status: "DIRTY" } }); });
  it("nur Supervisor/Duty Manager; ein Schritt für viele Zimmer; eine Meldung je Person", async () => {
    const ids = [roomId["105"], roomId["106"], roomId["107"]].filter(Boolean);
    expect(ids.length).toBe(3);
    await prisma.notification.deleteMany();
    as("a", "room_attendant");
    expect((await bulk({ roomIds: ids, attendantId: id.d })).status).toBe(403);
    as("sup1");
    const r = await bulk({ roomIds: ids, attendantId: id.d });
    expect(r.status).toBe(200);
    expect((await r.json()).changed).toBe(3);
    const rooms = await prisma.room.findMany({ where: { id: { in: ids } } });
    expect(rooms.every((x) => x.assignedToId === id.d && x.assignedOn === DATE)).toBe(true);
    const mine = await prisma.notification.findMany({ where: { targetUserId: id.d } });
    expect(mine).toHaveLength(1); // eine gebündelte Meldung, nicht drei
    expect(mine[0].message).toMatch(/3 Zimmer/);
  });

  it("Verschieben: Zimmer wandert von einer Kraft zur anderen; die bisherige Kraft wird gemeldet, Unbeteiligte nicht", async () => {
    await prisma.notification.deleteMany();
    const ids = [roomId["105"], roomId["106"]];
    as("sup1");
    expect((await bulk({ roomIds: ids, attendantId: id.b })).status).toBe(200);
    const who = (await prisma.notification.findMany()).map((n) => `${n.type}:${n.targetUserId}`);
    expect(who).toContain(`ROOM_ASSIGNED:${id.b}`);
    expect(who).toContain(`ROOM_UNASSIGNED:${id.d}`);
    expect(who.some((w) => w.endsWith(id.c))).toBe(false);
  });

  it("begonnene/fertige Zimmer nur mit Bestätigung; ohne: 409 und nichts geändert; mit: Status bleibt", async () => {
    const rid = roomId["107"];
    await prisma.room.update({ where: { id: rid }, data: { status: "IN_PROGRESS" } });
    as("sup1");
    const no = await bulk({ roomIds: [rid, roomId["106"]], attendantId: id.c });
    expect(no.status).toBe(409);
    expect((await no.json()).code).toBe("STARTED_ROOMS");
    expect((await prisma.room.findUniqueOrThrow({ where: { id: roomId["106"] } })).assignedToId).toBe(id.b); // nichts geändert
    const yes = await bulk({ roomIds: [rid, roomId["106"]], attendantId: id.c, confirmStarted: true });
    expect(yes.status).toBe(200);
    const moved = await prisma.room.findUniqueOrThrow({ where: { id: rid } });
    expect(moved).toMatchObject({ assignedToId: id.c, status: "IN_PROGRESS" });
  });

  it("freigeben (attendantId null) und unbekannte Zimmer/Personen werden sauber abgelehnt", async () => {
    as("sup1");
    expect((await bulk({ roomIds: [roomId["106"]], attendantId: null })).status).toBe(200);
    expect((await prisma.room.findUniqueOrThrow({ where: { id: roomId["106"] } })).assignedToId).toBeNull();
    expect((await bulk({ roomIds: ["nope"], attendantId: id.a })).status).toBe(400);
    expect((await bulk({ roomIds: [roomId["106"]], attendantId: id.hm1 })).status).toBe(400); // kein Zimmermädchen
  });
});
