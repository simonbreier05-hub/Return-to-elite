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
import { berlinDate } from "@/lib/dayplan/time";
import { GET as notificationsGet } from "@/app/api/notifications/route";
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
