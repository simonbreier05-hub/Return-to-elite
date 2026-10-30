import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-work-"));
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
vi.mock("@/lib/pms/MockPMSConnector", () => ({ pms: { pushRoomStatus: vi.fn() } }));

import { prisma } from "@/lib/db";
import { POST as pausePost } from "@/app/api/work/pause/route";
import { GET as notesGet, POST as notesPost } from "@/app/api/rooms/[id]/notes/route";
import { POST as statusPost } from "@/app/api/rooms/[id]/status/route";
import { POST as rewindPost } from "@/app/api/rooms/[id]/rewind/route";
import { GET as hkListGet } from "@/app/api/lists/housekeeper/route";
import { GET as dayNumbersGet } from "@/app/api/day-numbers/route";

vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-09-22T10:00:00Z"));
const D = "2026-09-22";
const ids: Record<string, string> = {};
const as = (key: string, role: string) => { getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: ids[key], name: `${key} Test`, role }); };
const json = (u: string, body: unknown) => new NextRequest(u, { method: "POST", body: JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const pause = (body: unknown) => pausePost(json("http://x/api/work/pause", body));

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  for (const [k, role, floors] of [["hk", "room_attendant", ""], ["hk2", "room_attendant", ""], ["sup3", "supervisor", "3"], ["sup4", "supervisor", "4"], ["supNone", "supervisor", ""], ["hm", "houseman", ""], ["fo", "front_office", ""], ["dm", "duty_manager", ""]] as const) {
    ids[k] = (await prisma.user.create({ data: { email: `${k}@x.test`, name: `${k} Test`, passwordHash: "x", role, assignedFloors: floors } })).id;
  }
  await prisma.importBatch.create({ data: { type: "DEPARTURES", status: "APPLIED", businessDate: D, fileHash: "h", appliedAt: new Date(), uploadedById: ids.sup3 } as never });
  const mk = (n: string, floor: number, o: Record<string, unknown> = {}) => prisma.room.create({ data: { number: n, floor, section: `${floor}A`, type: "STANDARD", ...o } });
  ids.r301 = (await mk("301", 3, { assignedToId: ids.hk, assignedOn: D, status: "DIRTY" })).id;
  ids.r302 = (await mk("302", 3, { assignedToId: ids.hk, assignedOn: D, status: "DIRTY" })).id;
  ids.r401 = (await mk("401", 4)).id;
  for (const [r, kind] of [["r301", "DEPARTURE"], ["r302", "STAYOVER"], ["r401", "DEPARTURE"]]) await prisma.dayRoomPlan.create({ data: { date: D, roomId: ids[r], cleaningType: kind } });
  ids.task = (await prisma.roomTask.create({ data: { roomId: ids.r301, type: "TWIN_SETUP", createdById: ids.sup3 } })).id;
}, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Pausieren (gemeinsamer Mechanismus)", () => {
  it("Zimmer: erst begonnen, dann pausieren mit Grund — Status bleibt, zählt nicht als erledigt", async () => {
    as("hk", "room_attendant");
    expect((await pause({ targetType: "ROOM", targetId: ids.r301, action: "pause" })).status).toBe(409); // noch nicht begonnen
    expect((await statusPost(json("http://x", { status: "IN_PROGRESS" }), params(ids.r301))).status).toBe(200);
    const res = await pause({ targetType: "ROOM", targetId: ids.r301, action: "pause", reason: "GUEST_IN_ROOM" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ paused: true, pause: { reason: "GUEST_IN_ROOM" } });
    expect((await prisma.room.findUnique({ where: { id: ids.r301 } }))!.status).toBe("IN_PROGRESS");
    const list = await (await hkListGet()).json();
    expect(list.rooms.find((r: { number: string }) => r.number === "301").pause).toMatchObject({ reason: "GUEST_IN_ROOM", byName: "hk Test" });
    expect(list.progress.done).toBe(0);
    const log = await prisma.auditLog.findMany({ where: { roomId: ids.r301, action: { in: ["WORK_PAUSED"] } } });
    expect(log).toHaveLength(1);
    expect(log[0].meta).not.toMatch(/Test/);
  });

  it("fremdes Zimmermädchen und fremde Etage dürfen nicht, Supervisor der Etage darf fortsetzen", async () => {
    as("hk2", "room_attendant");
    expect((await pause({ targetType: "ROOM", targetId: ids.r301, action: "resume" })).status).toBe(403);
    as("sup4", "supervisor");
    expect((await pause({ targetType: "ROOM", targetId: ids.r301, action: "resume" })).status).toBe(403);
    as("sup3", "supervisor");
    expect((await pause({ targetType: "ROOM", targetId: ids.r301, action: "resume" })).status).toBe(200);
    expect(await prisma.workPause.count({ where: { targetId: ids.r301, resumedAt: null } })).toBe(0);
  });

  it("eine Statusänderung beendet eine aktive Pause automatisch", async () => {
    as("hk", "room_attendant");
    await pause({ targetType: "ROOM", targetId: ids.r301, action: "pause", reason: "MATERIAL_MISSING" });
    expect((await statusPost(json("http://x", { status: "CLEAN" }), params(ids.r301))).status).toBe(200);
    expect(await prisma.workPause.count({ where: { targetId: ids.r301, resumedAt: null } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { roomId: ids.r301, action: "WORK_RESUMED" } })).toBe(2);
  });

  it("Hausmann pausiert eine Aufgabe; Zimmermädchen nicht", async () => {
    as("hk", "room_attendant");
    expect((await pause({ targetType: "ROOMTASK", targetId: ids.task, action: "pause" })).status).toBe(403);
    as("hm", "houseman");
    expect((await pause({ targetType: "ROOMTASK", targetId: ids.task, action: "pause", reason: "MATERIAL_MISSING" })).status).toBe(200);
    expect((await pause({ targetType: "ROOMTASK", targetId: ids.task, action: "pause" })).status).toBe(409);
  });
});

describe("Zurückspulen", () => {
  it("eigener Schritt eine Stufe zurück, protokolliert; ein zweites Mal nicht", async () => {
    as("hk", "room_attendant");
    const res = await rewindPost(new Request("http://x"), params(ids.r301));
    expect(res.status).toBe(200);
    expect((await prisma.room.findUnique({ where: { id: ids.r301 } }))!.status).toBe("IN_PROGRESS");
    expect(await prisma.auditLog.count({ where: { roomId: ids.r301, action: "STATUS_REWIND" } })).toBe(1);
    expect((await rewindPost(new Request("http://x"), params(ids.r301))).status).toBe(409);
  });
  it("fremdes Zimmer nicht", async () => {
    as("hk2", "room_attendant");
    expect((await rewindPost(new Request("http://x"), params(ids.r301))).status).toBe(409);
  });
});

describe("Nachrichten an Zimmer/Aufgabe", () => {
  it("Beteiligte schreiben, alle Betroffenen bekommen eine Meldung (ohne Text), der Autor nicht", async () => {
    as("hm", "houseman");
    const res = await notesPost(json("http://x", { body: "Bett klemmt, brauche Hilfe", task: { type: "ROOMTASK", id: ids.task } }), params(ids.r301));
    expect(res.status).toBe(201);
    const n = await prisma.notification.findMany({ where: { type: "TASK_MESSAGE" } });
    expect(n.map((x) => x.targetUserId).sort()).toEqual([ids.hk, ids.sup3].sort());
    expect(n.every((x) => !x.message.includes("Bett klemmt"))).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "TASK_MESSAGE", roomId: ids.r301 } })).toBe(1);
  });
  it("sichtbar nur für Beteiligte; Unbeteiligte dürfen nicht schreiben", async () => {
    const bodies = async (k: string, role: string) => { as(k, role); return ((await (await notesGet(new NextRequest("http://x"), params(ids.r301))).json()).notes as { body: string }[]).map((x) => x.body); };
    expect(await bodies("hk", "room_attendant")).toContain("Bett klemmt, brauche Hilfe");
    expect(await bodies("sup3", "supervisor")).toContain("Bett klemmt, brauche Hilfe");
    expect(await bodies("dm", "duty_manager")).toContain("Bett klemmt, brauche Hilfe");
    expect(await bodies("hk2", "room_attendant")).not.toContain("Bett klemmt, brauche Hilfe");
    expect(await bodies("sup4", "supervisor")).not.toContain("Bett klemmt, brauche Hilfe");
    expect(await bodies("fo", "front_office")).not.toContain("Bett klemmt, brauche Hilfe");
    // Supervisor ohne Etagen: sieht sie (wie das Live-Board das ganze Haus), gekennzeichnet als außerhalb der Zuständigkeit
    as("supNone", "supervisor");
    const none = await (await notesGet(new NextRequest("http://x"), params(ids.r301))).json();
    expect(none.notes.map((x: { body: string }) => x.body)).toContain("Bett klemmt, brauche Hilfe");
    expect(none.outOfScope).toBe(true);
    as("sup3", "supervisor");
    expect((await (await notesGet(new NextRequest("http://x"), params(ids.r301))).json()).outOfScope).toBe(false);
    as("hk2", "room_attendant");
    expect((await notesPost(json("http://x", { body: "x", kind: "MESSAGE" }), params(ids.r301))).status).toBe(403);
  });
  it("eine normale Notiz meldet dem zuständigen Zimmermädchen „neue Notiz“", async () => {
    as("fo", "front_office");
    expect((await notesPost(json("http://x", { body: "Gast kommt früher" }), params(ids.r302))).status).toBe(201);
    const n = await prisma.notification.findFirst({ where: { type: "ROOM_CHANGED", targetUserId: ids.hk } });
    expect(n?.message).toBe("Zimmer 302 (Etage 3): neue Notiz.");
  });
});

describe("Tageszahlen der eigenen Etagen (Supervisor)", () => {
  it("Supervisor bekommt zusätzlich die Zahlen seiner Etagen, ohne Etagen keine", async () => {
    as("sup3", "supervisor");
    const body = await (await dayNumbersGet()).json();
    expect(body.numbers.toClean).toBe(3);
    expect(body.mine).toMatchObject({ floors: [3], numbers: { toClean: 2, inventory: 2 } });
    as("supNone", "supervisor");
    expect((await (await dayNumbersGet()).json()).mine).toEqual({ floors: [], numbers: null });
    as("dm", "duty_manager");
    expect((await (await dayNumbersGet()).json()).mine).toBeNull();
  });
});
