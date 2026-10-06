import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-suplist-"));
  return { dir: d, url: `file:${p.join(d, "test.db")}` };
});
vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient({ datasources: { db: { url } } }) };
});
const getSessionMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: (...a: unknown[]) => getSessionMock(...a) }));
vi.mock("@/lib/realtime", () => ({ broadcast: vi.fn() }));

import { prisma } from "@/lib/db";
import { GET as supGet } from "@/app/api/lists/supervisor/route";
import { groupOf } from "@/lib/lists/groups";

const D = "2026-09-22";
const ids: Record<string, string> = {};
const call = async (session: unknown, qs = "") => {
  getSessionMock.mockReset(); getSessionMock.mockResolvedValue(session);
  return supGet(new NextRequest(`http://x/api/lists/supervisor${qs}`));
};

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  const user = async (key: string, role: string, extra: Record<string, unknown> = {}) => { ids[key] = (await prisma.user.create({ data: { email: `${key}@x.test`, name: `${key} Test`, passwordHash: "x", role, ...extra } })).id; };
  await user("hk2", "room_attendant", { dailyNumber: 1, hkType: "AZUBI", hkLevel: 1 }); await user("hk3", "room_attendant", { dailyNumber: 2 });
  await user("s2", "supervisor", { assignedFloors: "2" }); await user("s3", "supervisor", { assignedFloors: "3" }); await user("s0", "supervisor"); await user("dm", "duty_manager");
  await prisma.importBatch.create({ data: { type: "DEPARTURES", status: "APPLIED", businessDate: D, fileHash: "h", appliedAt: new Date("2026-09-22T06:30:00Z"), uploadedById: ids.dm } as never });

  const mk = async (n: string, floor: number, hk: string | null, status: string, kind: string, extra: Record<string, unknown> = {}) => {
    const room = await prisma.room.create({ data: { number: n, floor, section: `${floor}A`, type: "STANDARD", status, assignedToId: hk ? ids[hk] : null, assignedOn: hk ? D : null, routeOrder: Number(n) % 10, ...extra } });
    const stay = await prisma.stay.create({ data: { roomId: room.id, guestName: "Herr Dr. Krüger", source: "IMPORT", adults: 2, checkIn: new Date(`${D}T00:00:00Z`), checkOut: new Date("2026-09-24T10:00:00Z"), stayToken: `t${n}` } });
    await prisma.dayRoomPlan.create({ data: { date: D, roomId: room.id, cleaningType: kind, stayId: stay.id } });
    return room;
  };
  const r201 = await mk("201", 2, "hk2", "IN_PROGRESS", "DEPARTURE");
  await mk("202", 2, "hk2", "CLEAN", "STAYOVER");
  await mk("203", 2, "hk2", "DIRTY", "DEPARTURE");
  await mk("204", 2, "hk2", "BLOCKED", "STAYOVER", { blockReason: "DND" });
  await mk("205", 2, "hk2", "DIRTY", "ARRIVAL");
  await mk("206", 2, null, "DIRTY", "DEPARTURE"); // unzugeteilt
  await mk("301", 3, "hk3", "DIRTY", "DEPARTURE");
  await prisma.trace.create({ data: { roomId: r201.id, code: "ENG", date: D, text: "Klimaanlage prüfen", dept: "ENGINEERING", dedupeKey: "e1", source: "TRACES" } });
  await prisma.trace.create({ data: { roomId: r201.id, code: "HK", date: D, text: "Allergikerbettwäsche", dept: "HOUSEKEEPING", dedupeKey: "e2", source: "TRACES" } });
  // Zwei Importe: der zweite (Nachimport) hat Zimmer 203 geändert
  await prisma.auditLog.create({ data: { action: "DAY_PLAN_MERGED", userId: ids.dm, meta: JSON.stringify({ date: D, changedRooms: ["201", "202", "203", "301"], first: true }) } });
  await prisma.auditLog.create({ data: { action: "DAY_PLAN_MERGED", userId: ids.dm, meta: JSON.stringify({ date: D, changedRooms: ["203"], first: false }) } });
}, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Supervisor-Liste", () => {
  it("Supervisor sieht nur die ihm zugeteilten Etagen", async () => {
    const body = await (await call({ userId: ids.s2, name: "s2", role: "supervisor" })).json();
    expect(body.floors).toEqual([2]);
    const nums = [...body.housekeepers.flatMap((h: { rooms: { number: string }[] }) => h.rooms), ...body.unassigned].map((r: { number: string }) => r.number);
    expect(nums.every((n: string) => n.startsWith("2"))).toBe(true);
    expect(nums).not.toContain("301");
    expect(body.housekeepers.map((h: { name: string }) => h.name)).toEqual(["hk2 Test"]);
  });

  it("kein Zugriff auf Etagen anderer Supervisor — auch nicht per ?floors=", async () => {
    const body = await (await call({ userId: ids.s3, name: "s3", role: "supervisor" }, "?floors=2")).json();
    expect(body.floors).toEqual([3]);
    expect(JSON.stringify(body)).not.toContain('"number":"20');
    expect(JSON.stringify(body)).toContain('"number":"301"');
  });

  it("ohne zugeteilte Etage: leere Liste mit Hinweis statt der ganzen Etagen", async () => {
    const body = await (await call({ userId: ids.s0, name: "s0", role: "supervisor" })).json();
    expect(body).toMatchObject({ noFloors: true, floors: [], housekeepers: [], unassigned: [] });
  });

  it("Duty Manager sieht alle Etagen, optional gefiltert", async () => {
    const all = await (await call({ userId: ids.dm, name: "dm", role: "duty_manager" })).json();
    expect(all.floors).toEqual([1, 2, 3, 4, 5]);
    expect(all.housekeepers).toHaveLength(2);
    const f3 = await (await call({ userId: ids.dm, name: "dm", role: "duty_manager" }, "?floors=3")).json();
    expect(f3.housekeepers.map((h: { name: string }) => h.name)).toEqual(["hk3 Test"]);
  });

  it("Rollen: Housekeeper, Hausmann und Gäste bekommen die Liste nicht", async () => {
    expect((await call(null)).status).toBe(401);
    expect((await call({ userId: ids.hk2, name: "hk2", role: "room_attendant" })).status).toBe(403);
    expect((await call({ userId: "x", name: "x", role: "houseman" })).status).toBe(403);
    expect((await call({ userId: "x", name: "x", role: "front_office" })).status).toBe(403);
  });

  it("Gruppen, Fortschritt, Credits und Traces aller Abteilungen", async () => {
    const body = await (await call({ userId: ids.s2, name: "s2", role: "supervisor" })).json();
    const hk = body.housekeepers[0];
    const g = Object.fromEntries(hk.rooms.map((r: { number: string; group: string }) => [r.number, r.group]));
    expect(g).toMatchObject({ "201": "PROGRESS", "202": "DONE", "203": "OPEN", "204": "DND", "205": "ARRIVAL" });
    expect(hk.progress.total).toBe(4); // die reine Anreise (205) zählt nicht als Arbeit
    expect(hk.progress.done).toBe(1);
    expect(hk.progress.credits).toBeGreaterThan(hk.progress.creditsDone);
    const r201 = hk.rooms.find((r: { number: string }) => r.number === "201");
    expect(r201.traces.map((t: { dept: string }) => t.dept).sort()).toEqual(["ENGINEERING", "HOUSEKEEPING"]);
    expect(body.unassigned.map((r: { number: string }) => r.number)).toEqual(["206"]);
  });

  it("Nachimport-Markierung nur für den letzten echten Nachimport; Stand der Daten vorhanden", async () => {
    const body = await (await call({ userId: ids.s2, name: "s2", role: "supervisor" })).json();
    const changed = body.housekeepers[0].rooms.filter((r: { changed: boolean }) => r.changed).map((r: { number: string }) => r.number);
    expect(changed).toEqual(["203"]);
    expect(body.dataAsOf).toBe("2026-09-22T06:30:00.000Z");
  });

  it("Gast nur als Anrede/Titel/Nachname; keine Typ-/Stufen-Daten der Housekeeper in der Antwort", async () => {
    const raw = JSON.stringify(await (await call({ userId: ids.s2, name: "s2", role: "supervisor" })).json());
    expect(raw).toContain("Herr Dr. Krüger");
    expect(raw).not.toMatch(/hkType|hkLevel|homeFloors|dailyTarget|AZUBI/);
  });

  it("Gruppenzuordnung ist rein und eindeutig", () => {
    expect(groupOf({ status: "CLEAN", dnd: true, kind: "STAYOVER" })).toBe("DONE");
    expect(groupOf({ status: "IN_PROGRESS", dnd: false, kind: "DEPARTURE" })).toBe("PROGRESS");
    expect(groupOf({ status: "DIRTY", dnd: true, kind: "STAYOVER" })).toBe("DND");
    expect(groupOf({ status: "DIRTY", dnd: false, kind: "ARRIVAL" })).toBe("ARRIVAL");
    expect(groupOf({ status: "DIRTY", dnd: false, kind: "DEPARTURE" })).toBe("OPEN");
  });
});
