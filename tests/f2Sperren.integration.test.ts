import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** F2 (Befunde H4, H5, H6, M4): Sperren mit Grund und Ende, Freigabe nur Supervisor/DM, Meldungen, kein „Nicht im Service“ mehr. */
const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-f2-"));
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
import { applyStatusChange } from "@/lib/rooms/applyStatusChange";
import { runEscalations } from "@/lib/escalations";
import { ROLE_ALLOWED_TARGETS } from "@/lib/stateMachine";
import { berlinDate } from "@/lib/dayplan/time";
import { PATCH as woPatch } from "@/app/api/workorders/[id]/route";
import { PATCH as oooPatch } from "@/app/api/rooms/[id]/ooo/route";
import { loadBlockedRooms } from "@/lib/rooms/blockedRooms";
import type { Role } from "@/lib/domain";

const ids: Record<string, string> = {};
const room: Record<string, string> = {};
const sess = (key: string, role: Role) => ({ userId: ids[key], name: key, role }) as never;
const as = (key: string, role: Role) => { getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: ids[key], name: key, role }); };
const until = () => new Date(Date.now() + 48 * 3_600_000);
const block = (key: string, role: Role, r: string, extra: Record<string, unknown> = {}) =>
  applyStatusChange(sess(key, role), room[r], { status: "OUT_OF_ORDER", oooUntil: until(), oooReason: "Wasserschaden Bad", ...extra });

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  for (const [k, role, floors] of [["anna", "room_attendant", null], ["sup3", "supervisor", "3"], ["sup4", "supervisor", "4"], ["dm", "duty_manager", null], ["eng", "engineering", null]] as const) {
    ids[k] = (await prisma.user.create({ data: { email: `${k}@x.test`, name: `${k} Test`, passwordHash: "x", role, assignedFloors: floors ?? "" } })).id;
  }
  for (const n of ["301", "302", "303", "304", "305"]) room[n] = (await prisma.room.create({ data: { number: n, floor: 3, section: "3A", type: "STANDARD", status: "DIRTY" } })).id;
  await prisma.room.update({ where: { id: room["302"] }, data: { occupancy: "OCCUPIED", assignedToId: ids.anna, assignedOn: berlinDate(new Date()) } });
  await prisma.dayRoomPlan.create({ data: { date: berlinDate(new Date()), roomId: room["303"], cleaningType: "ARRIVAL" } });
}, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Sperren mit Grund", () => {
  it("ohne Grund abgelehnt (400), mit Grund gespeichert", async () => {
    const r = await applyStatusChange(sess("sup3", "supervisor"), room["301"], { status: "OUT_OF_ORDER", oooUntil: until() });
    expect(r).toMatchObject({ ok: false, status: 400, code: "OOO_REASON_REQUIRED" });
    expect((await block("sup3", "supervisor", "301")).ok).toBe(true);
    expect(await prisma.room.findUniqueOrThrow({ where: { id: room["301"] } })).toMatchObject({ status: "OUT_OF_ORDER", oooReason: "Wasserschaden Bad" });
  });

  it("„Nicht im Service“ ist nicht mehr wählbar", async () => {
    expect(ROLE_ALLOWED_TARGETS.supervisor).not.toContain("OUT_OF_SERVICE");
    expect(ROLE_ALLOWED_TARGETS.duty_manager).not.toContain("OUT_OF_SERVICE");
    const r = await applyStatusChange(sess("dm", "duty_manager"), room["304"], { status: "OUT_OF_SERVICE" });
    expect(r).toMatchObject({ ok: false, status: 403 });
  });
});

describe("Belegtes Zimmer / Anreise heute", () => {
  it("ohne Bestätigung 409, mit Bestätigung: DM (sieht alle), Supervisor der Etage und zugeteilte Housekeeperin werden gemeldet — ohne Gastnamen", async () => {
    expect(await block("eng", "engineering", "302")).toMatchObject({ ok: false, status: 409, code: "OCCUPIED_CONFIRM_REQUIRED" });
    expect((await block("eng", "engineering", "302", { confirmOccupied: true })).ok).toBe(true);
    const ns = await prisma.notification.findMany({ where: { type: "ROOM_BLOCKED_OCCUPIED", roomId: room["302"] } });
    expect(ns.map((n) => n.targetUserId).sort()).toEqual([ids.anna, ids.sup3].sort()); // nicht sup4 (andere Etage)
    expect(ns.every((n) => n.level === "warning" && n.message.includes("Wasserschaden Bad") && n.message.includes("Gast im Zimmer"))).toBe(true);
  });

  it("Anreise heute: Rückfrage, nach Bestätigung zusätzlich Front Office; Kachel zeigt „Anreise heute“", async () => {
    expect(await block("sup3", "supervisor", "303")).toMatchObject({ ok: false, status: 409 });
    expect((await block("sup3", "supervisor", "303", { confirmOccupied: true })).ok).toBe(true);
    expect(await prisma.notification.count({ where: { type: "ROOM_BLOCKED_OCCUPIED", roomId: room["303"], targetRole: "front_office" } })).toBe(1);
    const tile = (await loadBlockedRooms()).find((b) => b.number === "303");
    expect(tile).toMatchObject({ arrivalToday: true, reason: "Wasserschaden Bad" });
  });
});

describe("Wieder in Betrieb", () => {
  it("Techniker und Housekeeper dürfen nicht (403), Supervisor darf", async () => {
    expect(await applyStatusChange(sess("eng", "engineering"), room["301"], { status: "DIRTY" })).toMatchObject({ ok: false, status: 403 });
    expect(await applyStatusChange(sess("anna", "room_attendant"), room["301"], { status: "DIRTY" })).toMatchObject({ ok: false, status: 403 });
    expect((await applyStatusChange(sess("sup3", "supervisor"), room["301"], { status: "DIRTY" })).ok).toBe(true);
    expect(await prisma.room.findUniqueOrThrow({ where: { id: room["301"] } })).toMatchObject({ status: "DIRTY", oooReason: null, oooUntil: null });
  });

  it("„Erledigt“ ohne Notiz 400; mit Notiz → dringende Meldung „Mangel behoben — wieder in Betrieb nehmen?“ an Supervisor der Etage", async () => {
    await block("sup3", "supervisor", "304");
    const d = await prisma.defect.create({ data: { roomId: room["304"], category: "PLUMBING", note: "Abfluss", reportedById: ids.sup3 } });
    const wo = await prisma.workOrder.create({ data: { defectId: d.id, status: "IN_PROGRESS" } });
    as("eng", "engineering");
    const call = (body: object) => woPatch(new NextRequest("http://x", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: wo.id }) });
    expect((await call({ status: "RESOLVED" })).status).toBe(400);
    expect((await call({ status: "RESOLVED", note: "Siphon getauscht" })).status).toBe(200);
    expect((await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.id } })).resolutionNote).toBe("Siphon getauscht");
    const n = await prisma.notification.findMany({ where: { type: "OOO_READY", roomId: room["304"] } });
    expect(n.map((x) => x.targetUserId)).toEqual([ids.sup3]);
    expect(n[0].level).toBe("warning");
    expect((await loadBlockedRooms()).find((b) => b.number === "304")?.readyForRelease).toBe(true);
  });
});

describe("Abgelaufene Sperre und Änderungen durch den DM", () => {
  it("erzeugt genau eine Meldung je Tag (Annahme: Sperre endet nicht von selbst)", async () => {
    await prisma.room.update({ where: { id: room["305"] }, data: { status: "OUT_OF_ORDER", oooReason: "Teppich", oooUntil: new Date(Date.now() - 3_600_000) } });
    await runEscalations(new Date());
    await runEscalations(new Date());
    expect(await prisma.notification.count({ where: { type: "OOO_EXPIRED", roomId: room["305"] } })).toBe(1); // ein Supervisor der Etage 3
    expect((await prisma.room.findUniqueOrThrow({ where: { id: room["305"] } })).status).toBe("OUT_OF_ORDER");
  });

  it("DM ändert Grund und Ende (Logbuch); Supervisor darf es nicht", async () => {
    const call = (body: object) => oooPatch(new NextRequest("http://x", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: room["305"] }) });
    as("sup3", "supervisor");
    expect((await call({ reason: "x" })).status).toBe(403);
    as("dm", "duty_manager");
    const end = new Date(Date.now() + 5 * 86_400_000);
    expect((await call({ reason: "Teppich wird erneuert", until: end.toISOString() })).status).toBe(200);
    expect(await prisma.room.findUniqueOrThrow({ where: { id: room["305"] } })).toMatchObject({ oooReason: "Teppich wird erneuert", oooUntil: end });
    expect(await prisma.auditLog.count({ where: { action: "OOO_UPDATED", roomId: room["305"] } })).toBe(1);
  });
});
