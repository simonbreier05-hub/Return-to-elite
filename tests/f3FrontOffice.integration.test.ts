import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** F3 (Befunde K4, H7, H8, H9, H10, M22): Front Office — Vorgast, Check-out zurücknehmen, Frühabreise, Zimmerwechsel. Nur erfundene Gäste. */
const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-f3-"));
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
import { berlinDate, berlinToUtc } from "@/lib/dayplan/time";
import { GET as arrivalsGet } from "@/app/api/arrivals/route";
import { PATCH as arrivalPatch } from "@/app/api/arrivals/[id]/route";
import { POST as checkoutPost } from "@/app/api/rooms/[id]/checkout/route";
import { PATCH as lcoPatch } from "@/app/api/rooms/[id]/late-checkout/route";
import type { Role } from "@/lib/domain";

export const ids: Record<string, string> = {};
export const room: Record<string, string> = {};
const TODAY = berlinDate(new Date());
const sess = (key: string, role: Role) => ({ userId: ids[key], name: key, role }) as never;
const as = (key: string, role: Role) => { getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: ids[key], name: key, role }); };
const req = (body?: object, method = "POST") => new NextRequest("http://x", { method, ...(body ? { body: JSON.stringify(body) } : {}) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const day = (d: number) => new Date(berlinToUtc(TODAY, "12:00").getTime() + d * 86_400_000);
const stay = (roomId: string, last: string, from: number, to: number, status: string) =>
  prisma.stay.create({ data: { roomId, guestName: `Herr ${last}`, guestLastName: last, checkIn: day(from), checkOut: day(to), status, stayToken: randomBytes(16).toString("hex"), source: "IMPORT" } });
const at = (hhmm: string) => berlinToUtc(TODAY, hhmm);

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  for (const [k, role, floors] of [["anna", "room_attendant", ""], ["sup", "supervisor", "2"], ["dm", "duty_manager", ""], ["fo", "front_office", ""], ["con", "concierge", ""], ["hm", "houseman", ""], ["eng", "engineering", ""]] as const) {
    ids[k] = (await prisma.user.create({ data: { email: `${k}@x.test`, name: `${k} Test`, passwordHash: "x", role, assignedFloors: floors } })).id;
  }
  for (const n of ["201", "202", "203", "204", "205", "206"]) room[n] = (await prisma.room.create({ data: { number: n, floor: 2, section: "2A", type: "STANDARD", status: "DIRTY" } })).id;
  // 201 Turn: Vorgast noch da, neuer Gast 13:00
  const dep = await stay(room["201"], "Abreisetest", -2, 0, "IN_HOUSE");
  const arr = await stay(room["201"], "Anreisetest", 0, 2, "EXPECTED");
  await prisma.dayRoomPlan.create({ data: { date: TODAY, roomId: room["201"], cleaningType: "SAME_DAY_TURN", stayId: dep.id, arrivingStayId: arr.id, eta: "13:00" } });
  await prisma.room.update({ where: { id: room["201"] }, data: { occupancy: "OCCUPIED", assignedToId: ids.anna, assignedOn: TODAY } });
  ids.arrival201 = (await prisma.arrival.create({ data: { roomId: room["201"], guestName: "Herr Anreisetest", status: "EXPECTED", eta: at("13:00"), source: "IMPORT", createdById: ids.fo } })).id;
}, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Teil 1 — Gast noch im Zimmer (K4, H10)", () => {
  it("Housekeeper-Start verlangt eine Bestätigung mit Klartext, danach geht es", async () => {
    const r = await applyStatusChange(sess("anna", "room_attendant"), room["201"], { status: "IN_PROGRESS" });
    expect(r).toMatchObject({ ok: false, status: 409, code: "GUEST_STILL_IN_ROOM" });
    expect(!r.ok && r.error).toContain("noch im Zimmer");
    expect(!r.ok && r.error).not.toContain("Abreisetest"); // kein Gastname
    expect((await applyStatusChange(sess("anna", "room_attendant"), room["201"], { status: "IN_PROGRESS", confirmGuestPresent: true })).ok).toBe(true);
    expect((await applyStatusChange(sess("anna", "room_attendant"), room["201"], { status: "CLEAN" })).ok).toBe(true);
  });

  it("Supervisor-Freigabe mit Vorgast: Rückfrage", async () => {
    expect(await applyStatusChange(sess("sup", "supervisor"), room["201"], { status: "INSPECTED" })).toMatchObject({ ok: false, code: "GUEST_STILL_IN_ROOM" });
    expect((await applyStatusChange(sess("sup", "supervisor"), room["201"], { status: "INSPECTED", confirmGuestPresent: true })).ok).toBe(true);
  });

  it("Late Check-out nach der Anreise → Konflikt-Meldung an Supervisor der Etage und DM; Front Office sieht „Konflikt“, Einchecken abgelehnt", async () => {
    as("fo", "front_office");
    expect((await lcoPatch(req({ time: "15:00" }, "PATCH"), ctx(room["201"]))).status).toBe(200);
    const ns = await prisma.notification.findMany({ where: { type: "ARRIVAL_CONFLICT", roomId: room["201"] } });
    expect(ns.map((n) => n.targetRole).sort()).toEqual(["duty_manager", "supervisor"]);
    expect(ns.every((n) => n.level === "warning" && !n.message.includes("test"))).toBe(true);
    const body = await (await arrivalsGet()).json();
    expect(body.arrivals.find((a: { roomId: string }) => a.roomId === room["201"])).toMatchObject({ conflict: true, prevGuest: { present: true, lateCheckout: "15:00" } });
    const res = await arrivalPatch(req({ status: "CHECKED_IN" }, "PATCH"), ctx(ids.arrival201));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CHECKIN_GUEST_PRESENT");
  });

  it("nach dem Check-out des Vorgasts: Einchecken möglich", async () => {
    as("fo", "front_office");
    expect((await checkoutPost(req(), ctx(room["201"]))).status).toBe(200);
    expect((await arrivalPatch(req({ status: "CHECKED_IN" }, "PATCH"), ctx(ids.arrival201))).status).toBe(200);
  });
});
