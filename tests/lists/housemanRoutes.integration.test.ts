import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-hm-"));
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
import { GET as listGet } from "@/app/api/lists/houseman/route";
import { PATCH as tracePatch } from "@/app/api/traces/[id]/route";
import { PATCH as taskPatch } from "@/app/api/roomtasks/[id]/route";

const D = "2026-09-22";
const ids: Record<string, string> = {};
const as = (key: string, role: string) => { getSessionMock.mockReset(); getSessionMock.mockResolvedValue(key ? { userId: ids[key], name: key, role } : null); };
const patch = (id: string, body: unknown) => tracePatch(new NextRequest(`http://x/api/traces/${id}`, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  for (const [k, role] of [["hm", "houseman"], ["sup", "supervisor"], ["hk", "room_attendant"], ["fo", "front_office"]] as const) {
    ids[k] = (await prisma.user.create({ data: { email: `${k}@x.test`, name: `${k} Test`, passwordHash: "x", role } })).id;
  }
  await prisma.importBatch.create({ data: { type: "DEPARTURES", status: "APPLIED", businessDate: D, fileHash: "h", appliedAt: new Date(), uploadedById: ids.sup } as never });
  const mk = async (n: string, floor: number) => prisma.room.create({ data: { number: n, floor, section: `${floor}A`, type: "STANDARD" } });
  const r207 = await mk("207", 2), r208 = await mk("208", 2), r307 = await mk("307", 3);
  const stay = await prisma.stay.create({ data: { roomId: r207.id, guestName: "Herr Dr. Krüger", source: "IMPORT", checkIn: new Date(`${D}T00:00:00Z`), checkOut: new Date("2026-09-25T10:00:00Z"), stayToken: "t207" } });
  await prisma.dayRoomPlan.create({ data: { date: D, roomId: r207.id, cleaningType: "ARRIVAL", arrivingStayId: stay.id } });
  await prisma.dayRoomPlan.create({ data: { date: D, roomId: r208.id, cleaningType: "STAYOVER" } });
  const task = await prisma.roomTask.create({ data: { roomId: r207.id, type: "TWIN_SETUP", createdById: ids.sup } });
  const t = (roomId: string, code: string, text: string, dept: string, key: string, roomTaskId?: string) => prisma.trace.create({ data: { roomId, code, date: D, text, dept, dedupeKey: key, source: "TRACES", roomTaskId } });
  ids.t207 = (await t(r207.id, "TWIN", "Twinbett 207 bis 14:00", "HOUSEMAN", "a", task.id)).id;
  ids.t208 = (await t(r208.id, "TWIN", "Twin zurück 208", "HOUSEMAN", "b")).id;
  ids.t307 = (await t(r307.id, "XBED", "Zusatzbett", "HOUSEMAN", "c")).id;
  ids.eng = (await t(r207.id, "ENG", "Lampe defekt", "ENGINEERING", "d")).id;
  ids.task = task.id;
}, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Hausmann-Liste (API)", () => {
  it("liefert nur Hausmann-Traces mit Zimmer, Etage, Text, Zeitangabe und Kurzname", async () => {
    as("hm", "houseman");
    const body = await (await listGet(new NextRequest("http://x/api/lists/houseman"))).json();
    expect(body.items.map((i: { roomNumber: string }) => i.roomNumber)).toEqual(["207", "208", "307"]);
    expect(JSON.stringify(body)).not.toContain("Lampe");
    const i207 = body.items[0];
    expect(i207).toMatchObject({ floor: 2, times: ["14:00"], guest: "Herr Dr. Krüger", status: "OPEN", waitsForDeparture: false });
    expect(body.items[1].waitsForDeparture).toBe(true); // Twin zurück 208, Zimmer reist heute nicht ab
  });

  it("Filter nach Etage", async () => {
    as("hm", "houseman");
    const body = await (await listGet(new NextRequest("http://x/api/lists/houseman?floor=3"))).json();
    expect(body.items.map((i: { roomNumber: string }) => i.roomNumber)).toEqual(["307"]);
    expect(body.floors).toEqual([2, 3]);
  });

  it("Rollen: nur Hausmann und Supervisor (Duty Manager immer); Housekeeper/Rezeption/Gast nicht", async () => {
    for (const [k, role, status] of [["", "", 401], ["hk", "room_attendant", 403], ["fo", "front_office", 403], ["hm", "houseman", 200], ["sup", "supervisor", 200]] as const) {
      as(k, role);
      expect((await listGet(new NextRequest("http://x/api/lists/houseman"))).status, role || "anonym").toBe(status);
    }
  });

  it("Abhaken: Zeitstempel, Nutzer im Logbuch (ohne Text), verknüpfte Aufgabe erledigt, Live-Meldung", async () => {
    as("hm", "houseman"); broadcastMock.mockReset();
    const res = await patch(ids.t207, { status: "DONE" });
    expect(res.status).toBe(200);
    const trace = await prisma.trace.findUniqueOrThrow({ where: { id: ids.t207 } });
    expect(trace.status).toBe("DONE");
    expect(trace.doneAt).not.toBeNull();
    const task = await prisma.roomTask.findUniqueOrThrow({ where: { id: ids.task } });
    expect(task).toMatchObject({ status: "DONE", assignedToId: ids.hm });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "TRACE_DONE" } });
    expect(log.userId).toBe(ids.hm);
    expect(log.meta).not.toContain("Twinbett");
    expect(broadcastMock.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(["trace:update", "roomtask:update"]));
  });

  it("zweites Abhaken ändert nichts (kein doppelter Logbucheintrag); Wieder öffnen räumt den Zeitstempel", async () => {
    as("hm", "houseman");
    await patch(ids.t207, { status: "DONE" });
    expect(await prisma.auditLog.count({ where: { action: "TRACE_DONE" } })).toBe(1);
    await patch(ids.t207, { status: "OPEN" });
    expect((await prisma.trace.findUniqueOrThrow({ where: { id: ids.t207 } })).doneAt).toBeNull();
    expect((await prisma.roomTask.findUniqueOrThrow({ where: { id: ids.task } })).status).toBe("OPEN");
    expect(await prisma.auditLog.count({ where: { action: "TRACE_REOPENED" } })).toBe(1);
  });

  it("nur Hausmann-Traces; Housekeeper und Rezeption dürfen nicht abhaken; ungültiger Status → 400", async () => {
    as("hm", "houseman");
    expect((await patch(ids.eng, { status: "DONE" })).status).toBe(404);
    expect((await patch(ids.t208, { status: "ERLEDIGT" })).status).toBe(400);
    for (const [k, role] of [["hk", "room_attendant"], ["fo", "front_office"]] as const) { as(k, role); expect((await patch(ids.t208, { status: "DONE" })).status).toBe(403); }
    expect((await prisma.trace.findUniqueOrThrow({ where: { id: ids.t208 } })).status).toBe("OPEN");
  });

  it("die bestehende Aufgabenliste des Hausmanns zieht den Trace mit (eine Wahrheit)", async () => {
    as("hm", "houseman");
    const res = await taskPatch(new NextRequest("http://x", { method: "PATCH", body: JSON.stringify({ status: "DONE" }) }), { params: Promise.resolve({ id: ids.task }) });
    expect(res.status).toBe(200);
    expect((await prisma.trace.findUniqueOrThrow({ where: { id: ids.t207 } })).status).toBe("DONE");
  });
});
