import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * F9 — Abnahme der Funde „Hoch“ aus der Gegenprüfung (A1–A7). Wegwerf-DB, nur erfundene Gäste.
 * Bewusst OHNE Mock von `@/lib/db`: Der echte Prisma-Client (mit Standard-`omit`, A2) läuft gegen die Wegwerf-DB.
 */
const { dir } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-f9-"));
  process.env.DATABASE_URL = `file:${p.join(d, "test.db")}`;
  return { dir: d };
});
const getSessionMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: (...a: unknown[]) => getSessionMock(...a) }));
vi.mock("@/lib/realtime", () => ({ broadcast: vi.fn() }));

import { prisma } from "@/lib/db";
import { berlinDate, berlinToUtc } from "@/lib/dayplan/time";
import { GUEST_SYSTEM_EMAIL } from "@/lib/guest";
import { GET as arrivalsGet } from "@/app/api/arrivals/route";
import { PATCH as arrivalPatch } from "@/app/api/arrivals/[id]/route";
import { GET as excursionsGet } from "@/app/api/excursions/route";
import { GET as roomsGet } from "@/app/api/rooms/route";
import { POST as checkoutPost, DELETE as checkoutDelete } from "@/app/api/rooms/[id]/checkout/route";
import { GET as guestStatusGet } from "@/app/api/guest/r/[roomCode]/status/route";
import { POST as guestActionPost } from "@/app/api/guest/r/[roomCode]/[action]/route";
import { planBoardStatus, type StatusMarker } from "@/lib/dayplan/boardStatus";
import { __resetGuestRateLimitForTests } from "@/lib/guestRateLimit";
import { resolveGuestAccessByRoomCode, stayRef } from "@/lib/guestServer";
import { changeRoom } from "@/lib/rooms/roomChange";
import { proposePlan } from "@/lib/autoplan/propose";
import { hk, makeDay, makeInput } from "./autoplan/scenario";

const ids: Record<string, string> = {};
const room: Record<string, string> = {};
const TODAY = berlinDate(new Date());
const CODE = "f9TestCode201";
const as = (key: string, role: string) => { getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: ids[key], name: key, role }); };
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const day = (d: number) => new Date(berlinToUtc(TODAY, "12:00").getTime() + d * 86_400_000);
const stay = (roomId: string, last: string, from: number, to: number, status: string) =>
  prisma.stay.create({ data: { roomId, guestName: `Herr ${last}`, guestLastName: last, guestSalutation: "MR", checkIn: new Date(`${berlinDate(day(from))}T00:00:00Z`), checkOut: day(to), status, stayToken: randomBytes(16).toString("hex"), source: "IMPORT" } });
const status = (code: string) => guestStatusGet(new Request("http://x"), { params: Promise.resolve({ roomCode: code }) });
const action = (code: string, a: string, body: object = {}) =>
  guestActionPost(new NextRequest("http://x", { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": "10.0.0.9" } }), { params: Promise.resolve({ roomCode: code, action: a }) });

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env }, stdio: "pipe" });
  for (const [k, role] of [["anna", "room_attendant"], ["fo", "front_office"], ["sup", "supervisor"], ["hm", "houseman"], ["eng", "engineering"], ["con", "concierge"]] as const)
    ids[k] = (await prisma.user.create({ data: { email: `${k}@x.test`, name: `${k} Test`, passwordHash: "x", role } })).id;
  await prisma.user.create({ data: { email: GUEST_SYSTEM_EMAIL, name: "Gast", passwordHash: "x", role: "room_attendant" } });
  room["201"] = (await prisma.room.create({ data: { number: "201", floor: 2, section: "2A", type: "STANDARD", status: "INSPECTED", guestAccessCode: CODE } })).id;
  room["202"] = (await prisma.room.create({ data: { number: "202", floor: 2, section: "2A", type: "STANDARD", status: "INSPECTED" } })).id;
  room["203"] = (await prisma.room.create({ data: { number: "203", floor: 2, section: "2A", type: "STANDARD", status: "INSPECTED", occupancy: "VACANT", guestAccessCode: "f9TestCode203" } })).id; // frei, Ziel des Zimmerwechsels
  const dep = await stay(room["201"], "Vorgast", -2, 0, "IN_HOUSE");
  const arr = await stay(room["201"], "Neugast", 0, 2, "EXPECTED");
  ids.depStay = dep.id; ids.newStay = arr.id;
  await prisma.dayRoomPlan.create({ data: { date: TODAY, roomId: room["201"], cleaningType: "SAME_DAY_TURN", stayId: dep.id, arrivingStayId: arr.id } });
  await prisma.dayRoomPlan.create({ data: { date: TODAY, roomId: room["202"], cleaningType: "STAYOVER" } });
  ids.arrival = (await prisma.arrival.create({ data: { roomId: room["201"], guestName: "Herr Neugast", status: "EXPECTED", source: "IMPORT", createdById: ids.fo } })).id;
  await prisma.excursion.create({ data: { roomId: room["201"], guestName: "Herr Ausflug", note: "Geheime Notiz", startsAt: day(0), endsAt: day(1), createdById: ids.con } });
}, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("A1 — Gastnamen nur für berechtigte Rollen", () => {
  it("Anreisen: nur Front Office, Supervisor, Duty Manager; Ausflüge zusätzlich Concierge", async () => {
    for (const [k, r] of [["anna", "room_attendant"], ["hm", "houseman"], ["eng", "engineering"]]) {
      as(k, r);
      expect((await arrivalsGet()).status, r).toBe(403);
      expect((await excursionsGet()).status, r).toBe(403);
    }
    as("con", "concierge");
    expect((await arrivalsGet()).status).toBe(403);
    expect(JSON.stringify(await (await excursionsGet()).json())).toContain("Ausflug");
    as("fo", "front_office");
    expect(JSON.stringify(await (await arrivalsGet()).json())).toContain("Neugast");
  });
  it("/api/rooms: Hausmann/Technik ohne Gastnamen und ohne Ausflugsnotiz; Housekeeper nur Kurzname", async () => {
    for (const [k, r] of [["hm", "houseman"], ["eng", "engineering"]]) {
      as(k, r);
      const body = JSON.stringify(await (await roomsGet(new NextRequest("http://x/api/rooms"))).json());
      expect(body, r).not.toContain("Neugast");
      expect(body, r).not.toContain("Ausflug");
      expect(body, r).not.toContain("Geheime Notiz");
    }
  });
});

describe("A2 — Gastcode nie in Mitarbeiter-Antworten", () => {
  it("/api/rooms liefert keinen guestAccessCode (alle Rollen), stayToken nie", async () => {
    for (const [k, r] of [["hm", "houseman"], ["eng", "engineering"], ["con", "concierge"], ["sup", "supervisor"], ["fo", "front_office"]]) {
      as(k, r);
      const body = JSON.stringify(await (await roomsGet(new NextRequest("http://x/api/rooms"))).json());
      expect(body, r).not.toContain(CODE);
      expect(body, r).not.toContain("guestAccessCode");
    }
    const s = await prisma.stay.findFirst();
    expect(s && "stayToken" in s).toBe(false);
    // ausdrücklich gelesen geht weiter (Gästezugang-Seite, Code erzeugen)
    expect((await prisma.room.findUnique({ where: { id: room["201"] }, select: { guestAccessCode: true } }))?.guestAccessCode).toBe(CODE);
  });
});

describe("A4 + A3 — Check-in setzt „im Haus“; alter Gast-Tab bleibt beendet", () => {
  it("Vorgast-Tab ist an seinen Aufenthalt gebunden; Check-out → 404", async () => {
    const oldRef = stayRef(ids.depStay);
    ids.oldBound = `${CODE}.${oldRef}`;
    expect((await status(ids.oldBound)).status).toBe(200);
    as("fo", "front_office");
    expect((await checkoutPost(new NextRequest("http://x", { method: "POST", body: "{}" }), ctx(room["201"]))).status).toBe(200);
    expect((await status(ids.oldBound)).status).toBe(404);
  });
  it("Check-in am Front Office setzt den neuen Aufenthalt auf IN_HOUSE; Gastbildschirm grüßt sofort den neuen Gast", async () => {
    as("fo", "front_office");
    const r = await arrivalPatch(new NextRequest("http://x", { method: "PATCH", body: JSON.stringify({ status: "CHECKED_IN" }) }), ctx(ids.arrival));
    expect(r.status).toBe(200);
    expect((await prisma.stay.findUnique({ where: { id: ids.newStay } }))?.status).toBe("IN_HOUSE");
    const fresh = await status(CODE); // neuer Gast scannt den QR-Code
    expect(fresh.status).toBe(200);
    expect(JSON.stringify(await fresh.json())).toContain("Neugast");
  });
  it("A3: der offene Tab des Vorgasts bekommt den neuen Gast nie (Status und Aktionen 404)", async () => {
    const s = await status(ids.oldBound);
    expect(s.status).toBe(404);
    expect(JSON.stringify(await s.json())).not.toContain("Neugast");
    __resetGuestRateLimitForTests();
    expect((await action(ids.oldBound, "notes", { body: "Hallo" })).status).toBe(404);
    expect(await resolveGuestAccessByRoomCode(`${CODE}.${stayRef(ids.newStay)}`)).not.toBeNull();
  });
  it("A4: Check-out-Rücknahme gesperrt, sobald der neue Gast eingecheckt ist", async () => {
    as("fo", "front_office");
    const undo = await checkoutDelete(new NextRequest("http://x", { method: "DELETE" }), ctx(room["201"]));
    expect(undo.status).toBe(409);
    expect((await undo.json()).code).toBe("NEW_GUEST_CHECKED_IN");
    expect((await prisma.stay.findUnique({ where: { id: ids.depStay } }))?.status).toBe("CHECKED_OUT");
  });
  it("A4: Zimmerwechsel am Anreisetag geht (vorher 409)", async () => {
    const r = await changeRoom({ userId: ids.fo, name: "fo", role: "front_office" } as never, room["201"], room["203"], "Test");
    expect(r).toMatchObject({ ok: true });
    expect((await prisma.stay.findUnique({ where: { id: ids.newStay } }))?.roomId).toBe(room["203"]); // Gast wohnt jetzt in 203 (für A6)
  });
});

describe("A5 — Nachimport setzt ein gestern nicht fertiges Zimmer nicht auf „geprüft“ (Zimmer 305)", () => {
  it("Import 1: 305 (gestern IN_PROGRESS, heute Abreise) → DIRTY; Nachimport ohne 305 → bleibt DIRTY als Rest vom Vortag", () => {
    const dayStart = berlinToUtc(TODAY, "00:00");
    const yesterday = new Date(dayStart.getTime() - 3 * 3600_000);
    const r1 = planBoardStatus({ rooms: [{ id: "305", status: "IN_PROGRESS", statusSince: yesterday }], needsCleaning: new Set(["305"]), marker: {}, dayStart });
    expect(r1.updates).toEqual([{ id: "305", status: "DIRTY" }]);
    const now = new Date(dayStart.getTime() + 7 * 3600_000);
    const marker = { "305": ["DIRTY", now.toISOString(), ...r1.origins["305"]] } as StatusMarker; // so schreibt es `initRoomStatus`
    const r2 = planBoardStatus({ rooms: [{ id: "305", status: "DIRTY", statusSince: now }], needsCleaning: new Set(), marker, dayStart });
    expect(r2.updates).toEqual([]);
    expect(r2.carryover).toEqual(["305"]);
  });
});

describe("A6 — Gast kann „Bitte nicht stören“ immer aufheben", () => {
  it("nach 6 Anfragen in einer Stunde geht DND aufheben trotzdem; 429 trägt einen Code für die Gastsprache", async () => {
    __resetGuestRateLimitForTests();
    const code = "f9TestCode203";
    expect((await action(code, "dnd", { window: "UNTIL_FURTHER" })).status).toBeLessThan(300);
    for (let i = 0; i < 5; i++) expect((await action(code, "notes", { body: `Test ${i}` })).status).toBeLessThan(300);
    const limited = await action(code, "notes", { body: "zu viel" });
    expect(limited.status).toBe(429);
    expect((await limited.json()).code).toBe("GUEST_RATE_LIMITED");
    const cancel = await action(code, "dnd-cancel");
    expect(cancel.status).toBeLessThan(300);
    expect(await prisma.guestRequest.count({ where: { roomId: room["203"], kind: "DND", status: { in: ["RECEIVED", "IN_PROGRESS"] } } })).toBe(0);
  });
});

describe("A7 — Zuteilungsvorschlag nach N1/N2/N3", () => {
  it("Prüffall Browser-Test: Etage 5 Lucia, Etage 1 Ingrid (Präferenz-Etagen); Maria bekommt nie 13 bei Obergrenze 12; Rest im Float, Hinweis oben", () => {
    const rooms = makeDay(60);
    const team = [
      hk("lucia", "VOLLZEIT", 2, { roomsLo: 11, roomsHi: 12, cap: 12, homeFloors: [5] }),
      hk("ingrid", "VOLLZEIT", 2, { roomsLo: 11, roomsHi: 12, cap: 12, homeFloors: [1] }),
      hk("maria", "VOLLZEIT", 2, { roomsLo: 11, roomsHi: 12, cap: 12, homeFloors: [2] }),
      hk("tom", "VOLLZEIT", 2, { roomsLo: 11, roomsHi: 12, cap: 12, homeFloors: [3] }),
    ];
    const r = proposePlan(makeInput(rooms, team));
    const floor = new Map(rooms.map((x) => [x.id, x.floor]));
    for (const m of r.metrics) expect(m.rooms, m.hkId).toBeLessThanOrEqual(12);
    const on = (f: number) => new Set(Object.entries(r.assignment).filter(([id, h]) => h && floor.get(id) === f).map(([, h]) => h));
    expect([...on(5)]).toEqual(["lucia"]);
    expect([...on(1)]).toEqual(["ingrid"]);
    expect(r.unassigned.length).toBe(60 - 48);
    expect(r.warnings[0]).toMatchObject({ code: "FLOAT", message: expect.stringMatching(/^12 Zimmer im Float: [\d, ]+ — bitte von Hand zuteilen\./) });
  });
});
