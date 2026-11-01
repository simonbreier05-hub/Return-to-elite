import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-dmlive-"));
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
import { GET as detailGet } from "@/app/api/rooms/[id]/detail/route";
import { POST as traceAdd } from "@/app/api/rooms/[id]/traces/route";
import { PATCH as tracePatch } from "@/app/api/rooms/[id]/traces/[traceId]/route";
import { PATCH as notePatch } from "@/app/api/rooms/[id]/notes/[noteId]/route";
import { POST as statusPost } from "@/app/api/rooms/[id]/status/route";
import { getSupervisorList } from "@/lib/lists/supervisorList";

vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-09-22T10:00:00Z"));
const D = "2026-09-22";
const ids: Record<string, string> = {};
const as = (key: string, role: string) => { getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: ids[key], name: key, role }); };
const req = (method: string, body?: unknown) => new NextRequest("http://x/api", { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" } });
const p = (o: Record<string, string>) => ({ params: Promise.resolve(o) });

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  for (const [k, role] of [["sup", "supervisor"], ["dm", "duty_manager"], ["hk", "room_attendant"]] as const) {
    ids[k] = (await prisma.user.create({ data: { email: `${k}@x.test`, name: `${k} Test`, passwordHash: "x", role, ...(k === "sup" ? { assignedFloors: "2" } : {}) } })).id;
  }
  const room = await prisma.room.create({ data: { number: "208", floor: 2, section: "2A", type: "JUNIOR_SUITE", status: "DIRTY" } });
  ids.room = room.id;
  const stay = await prisma.stay.create({ data: { roomId: room.id, guestName: "Herr Dr. Krüger", adults: 2, children: 1, source: "IMPORT", checkIn: new Date("2026-09-20T00:00:00Z"), checkOut: new Date("2026-09-25T10:00:00Z"), stayToken: "t208" } });
  await prisma.dayRoomPlan.create({ data: { date: D, roomId: room.id, cleaningType: "STAYOVER", laundryDue: true, stayId: stay.id } });
  await prisma.trace.create({ data: { roomId: room.id, code: "ALLERGY", date: D, text: "Allergiker Federn", dept: "HOUSEKEEPING", dedupeKey: "k1", source: "TRACES" } });
  await prisma.guestRequest.create({ data: { roomId: room.id, kind: "CLEAN_REQUEST", status: "RECEIVED" } });
  const n = await prisma.roomNote.create({ data: { roomId: room.id, authorId: ids.hk, body: "Minibar prüfen" } });
  ids.note = n.id;
}, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Rollen", () => {
  it("Housekeeper darf Detail, Trace und Notiztext nicht", async () => {
    as("hk", "room_attendant");
    expect((await detailGet(req("GET"), p({ id: ids.room }))).status).toBe(403);
    expect((await traceAdd(req("POST", { text: "x", dept: "HOUSEKEEPING" }), p({ id: ids.room }))).status).toBe(403);
    expect((await notePatch(req("PATCH", { body: "neu" }), p({ id: ids.room, noteId: ids.note }))).status).toBe(403);
  });
  it("Supervisor und Duty Manager dürfen", async () => {
    for (const k of ["sup", "dm"]) {
      as(k, k === "sup" ? "supervisor" : "duty_manager");
      expect((await detailGet(req("GET"), p({ id: ids.room }))).status).toBe(200);
    }
  });
});

describe("Detail", () => {
  it("liefert alle Infos — per Nummer wie per Id — ohne Vornamen oder Alter", async () => {
    as("dm", "duty_manager");
    const body = await (await detailGet(req("GET"), p({ id: "208" }))).json();
    const r = body.room;
    expect(r).toMatchObject({ number: "208", type: "JUNIOR_SUITE", status: "DIRTY", guestDndActive: false });
    expect(r.day).toMatchObject({ kind: "STAYOVER", laundry: true, guest: "Herr Dr. Krüger", pax: 3 });
    expect(r.traces.map((t: { text: string }) => t.text)).toEqual(["Allergiker Federn"]);
    expect(r.guestRequests[0].kind).toBe("CLEAN_REQUEST");
    expect(r.allowedStatuses).toContain("IN_PROGRESS");
    expect(r.allowedStatuses).not.toContain("DIRTY"); // schon schmutzig — kein Übergang
    expect(JSON.stringify(body)).not.toMatch(/children|adults|\bage\b|alter/i);
  });
});

describe("Änderungen: gespeichert, protokolliert, live gemeldet", () => {
  it("Trace hinzufügen → Logbuch ohne Text, Live-Meldung ohne Text, erscheint sofort in der Supervisor-Liste", async () => {
    as("sup", "supervisor"); broadcastMock.mockClear();
    const res = await traceAdd(req("POST", { text: "Zusatzkissen bis 15 Uhr", dept: "HOUSEKEEPING" }), p({ id: ids.room }));
    expect(res.status).toBe(201);
    const audits = await prisma.auditLog.findMany({ where: { roomId: ids.room, action: "TRACE_ADDED" } });
    expect(audits).toHaveLength(1);
    expect(audits[0].meta ?? "").not.toContain("Zusatzkissen");
    expect(broadcastMock).toHaveBeenCalledWith("trace:update", expect.objectContaining({ roomNumber: "208" }));
    expect(JSON.stringify(broadcastMock.mock.calls)).not.toContain("Zusatzkissen");
    const list = await getSupervisorList({ userId: ids.sup, role: "supervisor" });
    const row = [...list.housekeepers.flatMap((h) => h.rooms), ...list.unassigned].find((r) => r.number === "208")!;
    expect(row.traces.map((t) => t.text)).toContain("Zusatzkissen bis 15 Uhr");
    expect(row).toMatchObject({ type: "JUNIOR_SUITE", wish: "CLEAN_REQUEST", laundry: true });
    // doppelt: abgelehnt
    expect((await traceAdd(req("POST", { text: "Zusatzkissen bis 15 Uhr", dept: "HOUSEKEEPING" }), p({ id: ids.room }))).status).toBe(409);
  });

  it("Trace ändern und erledigen; Duty Manager auch", async () => {
    const t = await prisma.trace.findFirstOrThrow({ where: { roomId: ids.room, code: "ALLERGY" } });
    as("dm", "duty_manager"); broadcastMock.mockClear();
    expect((await tracePatch(req("PATCH", { text: "Allergiker Federn und Nüsse" }), p({ id: ids.room, traceId: t.id }))).status).toBe(200);
    expect((await tracePatch(req("PATCH", { status: "DONE" }), p({ id: ids.room, traceId: t.id }))).status).toBe(200);
    const after = await prisma.trace.findUniqueOrThrow({ where: { id: t.id } });
    expect(after).toMatchObject({ text: "Allergiker Federn und Nüsse", status: "DONE" });
    expect(after.doneAt).not.toBeNull();
    expect(after.dedupeKey.startsWith("h1:")).toBe(true);
    const actions = (await prisma.auditLog.findMany({ where: { roomId: ids.room } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["TRACE_EDITED", "TRACE_DONE"]));
    expect(broadcastMock).toHaveBeenCalledWith("trace:update", expect.objectContaining({ roomNumber: "208" }));
    // fremdes Zimmer / unbekannt
    expect((await tracePatch(req("PATCH", { status: "OPEN" }), p({ id: "nope", traceId: t.id }))).status).toBe(404);
  });

  it("Notiz anpassen (nur Supervisor/DM), Logbuch ohne Text", async () => {
    as("sup", "supervisor"); broadcastMock.mockClear();
    expect((await notePatch(req("PATCH", { body: "Minibar prüfen und auffüllen" }), p({ id: ids.room, noteId: ids.note }))).status).toBe(200);
    expect((await prisma.roomNote.findUniqueOrThrow({ where: { id: ids.note } })).body).toBe("Minibar prüfen und auffüllen");
    const a = await prisma.auditLog.findFirstOrThrow({ where: { roomId: ids.room, action: "NOTE_EDITED" } });
    expect(a.meta ?? "").not.toContain("Minibar");
    expect(broadcastMock).toHaveBeenCalledWith("note:update", expect.anything());
  });

  it("Status: nur sinnvolle Übergänge — unerlaubter wird abgelehnt, erlaubter im Logbuch", async () => {
    as("sup", "supervisor");
    expect((await statusPost(req("POST", { status: "INSPECTED" }), p({ id: ids.room }))).status).toBe(409); // DIRTY → INSPECTED
    expect((await statusPost(req("POST", { status: "IN_PROGRESS" }), p({ id: ids.room }))).status).toBe(200);
    const log = await detailGet(req("GET"), p({ id: ids.room }));
    const entries = (await log.json()).room.logbook as { action: string; to: string | null }[];
    expect(entries.some((e) => e.action === "STATUS_CHANGE" && e.to === "IN_PROGRESS")).toBe(true);
  });
});
