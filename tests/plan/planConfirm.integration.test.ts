import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Plan bestätigen, benachrichtigen, keine Sperren, eine Wahrheit — gegen eine Wegwerf-DB.
 * Nur erfundene Daten, keine Gastnamen.
 */
const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-planconfirm-"));
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
import { confirmProposal, PlanConfirmError, proposeForDate } from "@/lib/autoplan/service";
import { buildResult } from "@/lib/autoplan/result";
import { berlinDate } from "@/lib/dayplan/time";
import { GET as notificationsGet } from "@/app/api/notifications/route";
import { PUT as housemanPut } from "@/app/api/planung/houseman/route";
import { GET as housemanGet } from "@/app/api/lists/houseman/route";
import { PATCH as tracePatch } from "@/app/api/traces/[id]/route";
import { GET as overviewGet } from "@/app/api/lists/overview/route";
import { GET as dayGet } from "@/app/api/assignments/day/route";
import { POST as absentPost } from "@/app/api/housekeepers/[id]/absent/route";
import { GET as roomsGet } from "@/app/api/rooms/route";
import { POST as assignPost } from "@/app/api/rooms/[id]/assign/route";
import { POST as movePost } from "@/app/api/rooms/[id]/move/route";
import { getHousekeeperList } from "@/lib/lists/housekeeperList";
import type { Session } from "@/lib/auth";

const DATE = berlinDate(new Date());
const ids: Record<string, string> = {};
const room: Record<string, string> = {};
const as = (key: string, role: string) => { getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: ids[key], name: key, role }); };
const inbox = async (key: string, role: string) => { as(key, role); return (await (await notificationsGet()).json()).notifications as { type: string; message: string; targetUserId: string | null }[]; };
const post = (url: string, body: unknown) => new NextRequest(`http://x${url}`, { method: "POST", body: JSON.stringify(body) });
let sup: Session;
let proposalId = "";
let assignment: Record<string, string | null> = {};

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  const user = async (k: string, role: string, extra: Record<string, unknown> = {}) => { ids[k] = (await prisma.user.create({ data: { email: `${k}@x.test`, name: `${k} Test`, passwordHash: "x", role, ...extra } })).id; };
  await user("sup", "supervisor"); await user("sup2", "supervisor"); await user("dm", "duty_manager"); await user("hm", "houseman");
  // Nur Stufe 1 und 2 anwesend, damit anspruchsvolle Zimmer sicher bei Stufe 1 landen können (kein Zimmer darf offen bleiben)
  await user("hk1", "room_attendant", { hkType: "VOLLZEIT", hkLevel: 1 }); await user("hk2", "room_attendant", { hkType: "VOLLZEIT", hkLevel: 2 });
  await user("hk3", "room_attendant", { hkType: "VOLLZEIT", hkLevel: 1 });
  sup = { userId: ids.sup, name: "sup", role: "supervisor" } as Session;
  for (let i = 1; i <= 12; i++) {
    const number = String(100 + i);
    const r = await prisma.room.create({ data: { number, floor: 1, section: "1A", type: i % 4 === 0 ? "SUITE" : "STANDARD" } });
    room[number] = r.id;
    await prisma.dayRoomPlan.create({ data: { date: DATE, roomId: r.id, cleaningType: i % 3 === 0 ? "DEPARTURE" : "STAYOVER", vip: i === 2 } });
  }
}, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Auto-Planung lässt nichts offen", () => {
  it("auch wenn nur Stufe 1 und 2 anwesend sind und anspruchsvolle Zimmer (VIP, Suite) da sind", async () => {
    const r = await proposeForDate(DATE, ids.sup, [ids.hk1, ids.hk3]); // nur Stufe 1
    expect(r.payload.input.rooms.some((x) => x.demanding.length)).toBe(true);
    expect(r.payload.result.unassigned).toEqual([]);
    expect(r.payload.result.warnings.map((w) => w.code)).toContain("LEVEL1_DEMANDING"); // nur eine Warnung, keine Sperre
    const all = await proposeForDate(DATE, ids.sup, [ids.hk1, ids.hk2, ids.hk3]);
    proposalId = all.proposalId; assignment = { ...all.payload.result.assignment };
    expect(all.payload.result.unassigned).toEqual([]);
  });
});

describe("Bestätigen", () => {
  it("offene Zimmer verhindern nichts, brauchen aber die ausdrückliche Bestätigung", async () => {
    const open = { ...assignment, [room["101"]]: null };
    await expect(confirmProposal(proposalId, open, sup)).rejects.toMatchObject({ code: "OPEN_ROOMS" });
    await expect(confirmProposal(proposalId, open, sup)).rejects.toBeInstanceOf(PlanConfirmError);
    expect((await prisma.autoPlanProposal.findUniqueOrThrow({ where: { id: proposalId } })).status).toBe("DRAFT"); // nichts ist live
    expect((await prisma.room.findUniqueOrThrow({ where: { id: room["102"] } })).assignedToId).toBeNull();
  });

  it("jedes Zimmer lässt sich im Entwurf jeder anwesenden Kraft zuteilen — auch Stufe 1 + anspruchsvoll (nur Warnung)", async () => {
    const edited = { ...assignment };
    for (const hk of [ids.hk1, ids.hk2, ids.hk3]) for (const id of Object.values(room)) edited[id] = hk;
    const r = await confirmProposal(proposalId, edited, sup); // Warnungen blockieren nie
    expect(r.open).toBe(0);
    const rows = await prisma.room.findMany({ where: { id: { in: Object.values(room) } } });
    expect(rows.every((x) => x.assignedToId === ids.hk3 && x.assignedOn === DATE)).toBe(true);
    const saved = await prisma.autoPlanProposal.findUniqueOrThrow({ where: { id: proposalId } });
    expect(saved).toMatchObject({ status: "CONFIRMED", confirmedById: ids.sup, date: DATE });
    expect(saved.confirmedAt).not.toBeNull();
  });

  it("Meldungen gehen genau an die Betroffenen — nicht an den, der bestätigt; ohne Gastdaten", async () => {
    expect((await inbox("hk3", "room_attendant")).map((n) => n.message)).toEqual([expect.stringMatching(/^Dein Plan für heute: 12 Zimmer, [\d,]+ Credits\.$/)]);
    expect(await inbox("hk1", "room_attendant")).toEqual([]); // hatte vorher nichts und hat nachher nichts
    expect(await inbox("hk2", "room_attendant")).toEqual([]);
    expect((await inbox("sup2", "supervisor")).map((n) => n.message)).toEqual([expect.stringMatching(/^Tagesplan bestätigt: 12 von 12 Zimmern an 1 Kräfte verteilt/)]);
    expect((await inbox("hm", "houseman")).length).toBe(1);
    expect((await inbox("dm", "duty_manager")).some((n) => n.type === "PLAN_CONFIRMED")).toBe(true);
    expect((await inbox("sup", "supervisor")).filter((n) => n.type === "PLAN_CONFIRMED")).toEqual([]);
    expect(broadcastMock).toHaveBeenCalledWith("notification:new", expect.anything());
    const all = await prisma.notification.findMany({ where: { type: "PLAN_CONFIRMED" } });
    expect(all.every((n) => n.targetUserId && !/gast|guest/i.test(n.message))).toBe(true);
    expect(new Set(all.map((n) => n.dedupeKey)).size).toBe(all.length); // keine Doppelten
  });
});

describe("Nach der Bestätigung: keine Sperren, eine Wahrheit", () => {
  it("Supervisor teilt ein bereits zugeteiltes (heutiges) Zimmer um; nur Betroffene werden gemeldet, Listen zeigen sofort den neuen Stand", async () => {
    as("sup", "supervisor");
    const res = await assignPost(post("/x", { attendantId: ids.hk1 }), { params: Promise.resolve({ id: room["103"] }) });
    expect(res.status).toBe(200);
    const mine = (await getHousekeeperList(ids.hk1)), theirs = (await getHousekeeperList(ids.hk3));
    const nums = (l: { rooms?: { number: string }[]; groups?: unknown }) => JSON.stringify(l);
    expect(nums(mine)).toContain("103");
    expect(nums(theirs)).not.toContain('"number":"103"');
    expect((await inbox("hk1", "room_attendant")).map((n) => n.type)).toContain("ROOM_ASSIGNED");
    expect((await inbox("hk2", "room_attendant"))).toEqual([]); // Unbeteiligte hören nichts
  });

  it("begonnenes Zimmer: erst Rückfrage (409 STARTED_ROOM), dann mit Bestätigung — Status bleibt, Logbuch-Eintrag", async () => {
    await prisma.room.update({ where: { id: room["104"] }, data: { status: "IN_PROGRESS" } });
    as("sup", "supervisor");
    const refused = await movePost(post("/x", { toAttendantId: ids.hk2 }), { params: Promise.resolve({ id: room["104"] }) });
    expect(refused.status).toBe(409);
    expect((await refused.json()).code).toBe("STARTED_ROOM");
    const ok = await movePost(post("/x", { toAttendantId: ids.hk2, confirmStarted: true }), { params: Promise.resolve({ id: room["104"] }) });
    expect(ok.status).toBe(200);
    const after = await prisma.room.findUniqueOrThrow({ where: { id: room["104"] } });
    expect(after).toMatchObject({ status: "IN_PROGRESS", assignedToId: ids.hk2 });
    expect(await prisma.auditLog.count({ where: { action: "ROOM_MOVED_STARTED", roomId: room["104"] } })).toBe(1);
  });

  it("Housekeeper dürfen weder zuteilen noch fremde Zuteilungen sehen", async () => {
    as("hk2", "room_attendant");
    expect((await assignPost(post("/x", { attendantId: ids.hk2 }), { params: Promise.resolve({ id: room["105"] }) })).status).toBe(403);
    expect((await movePost(post("/x", { toAttendantId: ids.hk2 }), { params: Promise.resolve({ id: room["105"] }) })).status).toBe(403);
    const seen = (await (await roomsGet(new NextRequest("http://x/api/rooms?allFloors=1"))).json()).rooms as { id: string; assignedToId: string | null; assignedTo: unknown }[];
    expect(seen.length).toBe(12);
    for (const r of seen) if (r.assignedToId) expect(r.assignedToId).toBe(ids.hk2);
    expect(seen.filter((r) => r.assignedTo).every((r) => r.assignedToId === ids.hk2)).toBe(true);
  });

  it("alle Ansichten lesen denselben bestätigten Stand: Room.assignedToId (Supervisor-Sicht = Housekeeper-Liste)", async () => {
    as("sup", "supervisor");
    const board = (await (await roomsGet(new NextRequest("http://x/api/rooms?allFloors=1"))).json()).rooms as { id: string; assignedToId: string | null }[];
    for (const hk of [ids.hk1, ids.hk2, ids.hk3]) {
      const onBoard = board.filter((r) => r.assignedToId === hk).map((r) => r.id).sort();
      const list = JSON.stringify(await getHousekeeperList(hk));
      const inDb = (await prisma.room.findMany({ where: { assignedToId: hk }, select: { id: true, number: true } }));
      expect(onBoard).toEqual(inDb.map((r) => r.id).sort());
      for (const r of inDb) expect(list).toContain(r.number);
    }
  });
});

describe("Kräfte hinzu- und abwählen (Grundriss)", () => {
  it("abwählen: Kraft verschwindet aus den anwesenden, bleibt im Roster; hinzuwählen bringt sie zurück", async () => {
    as("sup", "supervisor");
    const call = async () => (await (await dayGet()).json()) as { attendants: { id: string }[]; roster: { id: string; absent: boolean }[]; actionableRoomIds: string[] };
    expect((await call()).attendants.map((a) => a.id)).toContain(ids.hk2);
    expect((await absentPost(post("/x", { absent: true }), { params: Promise.resolve({ id: ids.hk2 }) })).status).toBe(200);
    const off = await call();
    expect(off.attendants.map((a) => a.id)).not.toContain(ids.hk2);
    expect(off.roster.find((r) => r.id === ids.hk2)?.absent).toBe(true);
    expect(off.actionableRoomIds.length).toBe(12);
    expect((await absentPost(post("/x", { absent: false }), { params: Promise.resolve({ id: ids.hk2 }) })).status).toBe(200);
    expect((await call()).attendants.map((a) => a.id)).toContain(ids.hk2);
  });
  it("nur Supervisor/Duty Manager dürfen die Anwesenheit ändern", async () => {
    as("hk1", "room_attendant");
    expect((await absentPost(post("/x", { absent: true }), { params: Promise.resolve({ id: ids.hk3 }) })).status).toBe(403);
  });
});

describe("Ursache „offen trotz Credit-Ziel“: Zimmer einer nicht eingeplanten Kraft", () => {
  it("heute schon zugeteilte Zimmer einer nicht gewählten Kraft werden neu verteilt, nicht offen gelassen; Begonnenes bleibt außen vor", async () => {
    // Vorbedingung: Zimmer gehören hk2 (heute), hk2 wird nicht eingeplant; 104 ist bei hk2 begonnen
    for (const n of ["101", "102", "103", "105", "106", "107"]) await prisma.room.update({ where: { id: room[n] }, data: { assignedToId: ids.hk2, assignedOn: DATE, status: "DIRTY" } });
    await prisma.room.update({ where: { id: room["104"] }, data: { assignedToId: ids.hk2, assignedOn: DATE, status: "IN_PROGRESS" } });
    const r = await proposeForDate(DATE, ids.sup, [ids.hk1, ids.hk3]);
    expect(r.payload.result.unassigned).toEqual([]);
    expect(buildResult(r.payload.input, r.payload.result.assignment).unassigned).toEqual([]); // so rechnet die Oberfläche („X offen“)
    expect(r.payload.input.rooms.map((x) => x.id)).not.toContain(room["104"]); // begonnen: bleibt bei hk2
    for (const n of ["101", "102", "103", "105", "106", "107"]) {
      const to = r.payload.result.assignment[room[n]];
      expect([ids.hk1, ids.hk3]).toContain(to);
    }
  });
  it("„Nicht einplanen“ ist umkehrbar: mit der Kraft sind alle Zimmer zugeteilt, ohne sie auch, danach wieder mit ihr", async () => {
    for (const team of [[ids.hk1, ids.hk2, ids.hk3], [ids.hk1, ids.hk3], [ids.hk1, ids.hk2, ids.hk3]]) {
      const r = await proposeForDate(DATE, ids.sup, team);
      expect(r.payload.result.unassigned).toEqual([]);
      expect(new Set(Object.values(r.payload.result.assignment))).toEqual(new Set(team.filter((id) => r.payload.result.metrics.find((m) => m.hkId === id)!.rooms > 0)));
    }
  });
});

describe("Hausmann-Liste: Aufgaben zuteilen (Entwurf → beim Bestätigen gespeichert)", () => {
  it("Supervisor teilt zu; der Hausmann sieht eigene und nicht zugeteilte Aufgaben; andere Hausmänner nur ihre", async () => {
    await prisma.user.create({ data: { email: "hm2@x.test", name: "hm2 Test", passwordHash: "x", role: "houseman" } }).then((u) => { ids.hm2 = u.id; });
    const mk = (n: string, text: string) => prisma.trace.create({ data: { roomId: room[n], code: "HK", date: DATE, text, dept: "HOUSEMAN", dedupeKey: `k-${n}`, source: "TRACES" } });
    const t1 = await mk("101", "Twin bed"); const t2 = await mk("102", "Extra bed");
    as("sup", "supervisor");
    const res = await housemanPut(new NextRequest("http://x/api/planung/houseman", { method: "PUT", body: JSON.stringify({ assignments: [{ traceId: t1.id, userId: ids.hm }] }) }));
    expect((await res.json()).changed).toBe(1);
    const items = async (key: string, role: string) => { as(key, role); return ((await (await housemanGet(new NextRequest("http://x/api/lists/houseman"))).json()).items as { id: string }[]).map((i) => i.id); };
    expect(await items("hm", "houseman")).toEqual(expect.arrayContaining([t1.id, t2.id]));
    expect(await items("hm2", "houseman")).toEqual([t2.id]); // t1 gehört hm
    expect((await items("sup", "supervisor")).length).toBe(0); // Supervisor ohne Etage sieht nichts (nur zugeteilte Etagen)
    expect((await items("dm", "duty_manager")).length).toBe(2); // Duty Manager sieht alles
    // Housekeeper dürfen nicht zuteilen; unbekannter Hausmann wird abgelehnt
    as("hk1", "room_attendant");
    expect((await housemanPut(new NextRequest("http://x/y", { method: "PUT", body: JSON.stringify({ assignments: [] }) }))).status).toBe(403);
    as("sup", "supervisor");
    expect((await housemanPut(new NextRequest("http://x/y", { method: "PUT", body: JSON.stringify({ assignments: [{ traceId: t2.id, userId: ids.hk1 }] }) }))).status).toBe(400);
  });
});

describe("Hausmann: Meldung bei Zuteilung, Erledigt sichtbar für Supervisor (eigene Etage) und Duty Manager (alles)", () => {
  it("beim Bestätigen: der zugeteilte Hausmann bekommt „N Aufgaben (M dir zugeteilt)“, der andere nur die allgemeinen", async () => {
    const t3 = await prisma.trace.create({ data: { roomId: room["110"], code: "HK", date: DATE, text: "Twin bed", dept: "HOUSEMAN", dedupeKey: "k-110", source: "TRACES" } });
    ids.t3 = t3.id;
    const t1 = await prisma.trace.findFirstOrThrow({ where: { dedupeKey: "k-101" } });
    const r = await proposeForDate(DATE, ids.sup, [ids.hk1, ids.hk3]);
    await confirmProposal(r.proposalId, r.payload.result.assignment, sup, { acceptOpen: true, confirmStarted: true, housemanAssignments: [{ traceId: t3.id, userId: ids.hm2 }] });
    expect((await prisma.trace.findUniqueOrThrow({ where: { id: t3.id } })).assignedToId).toBe(ids.hm2);
    const mine = (await inbox("hm2", "houseman")).filter((n) => n.type === "PLAN_CONFIRMED").map((n) => n.message);
    expect(mine.at(0)).toMatch(/^Dein Plan für heute: \d+ Aufgaben? \(1 dir zugeteilt\)\.$/);
    const other = (await inbox("hm", "houseman")).filter((n) => n.type === "PLAN_CONFIRMED").map((n) => n.message);
    expect(other.at(0)).toMatch(/^Dein Plan für heute: 2 Aufgaben \(1 dir zugeteilt\)\.$/); // eigene t1 + freie t2; t3 gehört hm2
    void t1;
    // ungültige Zuteilung (Housekeeper statt Hausmann) bricht ab
    const r2 = await proposeForDate(DATE, ids.sup, [ids.hk1, ids.hk3]);
    await expect(confirmProposal(r2.proposalId, r2.payload.result.assignment, sup, { acceptOpen: true, confirmStarted: true, housemanAssignments: [{ traceId: t3.id, userId: ids.hk1 }] })).rejects.toMatchObject({ code: "INVALID" });
  });

  it("Aufgabe erledigt: nur der Supervisor der Etage wird gemeldet (ohne Aufgabentext), der Duty Manager sieht alles", async () => {
    await prisma.user.update({ where: { id: ids.sup2 }, data: { assignedFloors: "1" } });
    const sup3 = await prisma.user.create({ data: { email: "sup3@x.test", name: "sup3 Test", passwordHash: "x", role: "supervisor", assignedFloors: "2" } });
    ids.sup3 = sup3.id;
    as("hm2", "houseman");
    const res = await tracePatch(new NextRequest("http://x/api/traces/x", { method: "PATCH", body: JSON.stringify({ status: "DONE" }) }), { params: Promise.resolve({ id: ids.t3 }) });
    expect(res.status).toBe(200);
    const msgs = async (k: string, role: string) => (await inbox(k, role)).filter((n) => n.type === "HOUSEMAN_TASK_DONE").map((n) => n.message);
    expect(await msgs("sup2", "supervisor")).toEqual(["Zimmer 110 (Etage 1): Hausmann-Aufgabe erledigt."]);
    expect(await msgs("sup3", "supervisor")).toEqual([]); // fremde Etage
    expect((await msgs("dm", "duty_manager")).length).toBe(1); // Duty Manager sieht alle Meldungen
  });

  it("Live-Einsicht: nur der Duty Manager; zeigt zugeteilt/erledigt und wer es abgehakt hat; Supervisor sieht nur Aufgaben der eigenen Etagen", async () => {
    as("sup", "supervisor");
    expect((await overviewGet()).status).toBe(403);
    as("dm", "duty_manager");
    const o = await (await overviewGet()).json();
    const hm2 = o.housemen.find((h: { id: string }) => h.id === ids.hm2);
    expect(hm2).toMatchObject({ assigned: 1, done: 1 });
    expect(o.tasks.find((t: { id: string }) => t.id === ids.t3)).toMatchObject({ status: "DONE", doneByName: "hm2 Test", assignedToName: "hm2 Test" });
    expect(o.supervisors.find((s: { id: string }) => s.id === ids.sup2).floors).toEqual([1]);
    const itemsFor = async (k: string, role: string) => { as(k, role); return ((await (await housemanGet(new NextRequest("http://x/api/lists/houseman"))).json()).items as { id: string }[]).map((i) => i.id); };
    expect(await itemsFor("sup2", "supervisor")).toContain(ids.t3); // Etage 1
    expect(await itemsFor("sup3", "supervisor")).toEqual([]); // Etage 2: nichts von Etage 1
    expect((await itemsFor("dm", "duty_manager")).length).toBeGreaterThanOrEqual(3); // alles
  });
});
