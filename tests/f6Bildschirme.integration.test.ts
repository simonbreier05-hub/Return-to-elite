import { execSync } from "node:child_process";
import { mkdirSync, existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** F6 (M3/B9, M17, M19, M11): Fotos nur Technik/Supervisor/DM und gelöscht nach Behebung, Suche ohne Gastfelder, Wäsche nur bestätigt. */
const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-f6-"));
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
import { berlinDate } from "@/lib/dayplan/time";
import { applyStatusChange } from "@/lib/rooms/applyStatusChange";
import { GET as uploadGet } from "@/app/api/uploads/[...path]/route";
import { GET as roomsGet } from "@/app/api/rooms/route";
import { sortReleaseQueue, etaState } from "@/lib/ui/supervisorHub";
import type { Role } from "@/lib/domain";

const ids: Record<string, string> = {};
const TODAY = berlinDate(new Date());
const FILE = `f6test-${Date.now()}.jpg`;
const UPLOADS = path.join(process.cwd(), "uploads");
const sess = (key: string, role: Role) => ({ userId: ids[key], name: key, role }) as never;
const as = (key: string, role: Role) => { getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: ids[key], name: key, role }); };

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  for (const [k, role] of [["anna", "room_attendant"], ["bea", "room_attendant"], ["sup", "supervisor"], ["dm", "duty_manager"], ["eng", "engineering"], ["fo", "front_office"], ["con", "concierge"], ["hm", "houseman"]] as const) {
    ids[k] = (await prisma.user.create({ data: { email: `${k}@x.test`, name: `${k} Test`, passwordHash: "x", role } })).id;
  }
  ids.r1 = (await prisma.room.create({ data: { number: "401", floor: 4, section: "4A", type: "STANDARD", status: "OUT_OF_ORDER", oooReason: "Wasser", occupancy: "VACANT" } })).id;
  ids.r2 = (await prisma.room.create({ data: { number: "402", floor: 4, section: "4A", type: "STANDARD", status: "IN_PROGRESS", assignedToId: ids.anna, assignedOn: TODAY } })).id;
  ids.r3 = (await prisma.room.create({ data: { number: "403", floor: 4, section: "4A", type: "STANDARD", status: "DIRTY", assignedToId: ids.bea, assignedOn: TODAY } })).id;
  await prisma.arrival.create({ data: { roomId: ids.r3, guestName: "Geheim, Gast", status: "EXPECTED", vip: true, eta: new Date(), createdById: ids.sup } });
  await prisma.dayRoomPlan.create({ data: { date: TODAY, roomId: ids.r2, cleaningType: "STAYOVER", laundryDue: true } });
  await prisma.dayRoomPlan.create({ data: { date: TODAY, roomId: ids.r3, cleaningType: "ARRIVAL" } });
  mkdirSync(UPLOADS, { recursive: true });
  writeFileSync(path.join(UPLOADS, FILE), "x");
  const d = await prisma.defect.create({ data: { roomId: ids.r1, category: "PLUMBING", note: "Rohr", photoPath: `/api/uploads/${FILE}`, reportedById: ids.anna } });
  ids.wo = (await prisma.workOrder.create({ data: { defectId: d.id, status: "RESOLVED", resolvedAt: new Date() } })).id;
  ids.defect = d.id;
}, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); rmSync(path.join(UPLOADS, FILE), { force: true }); });

describe("Mängel-Fotos (B9)", () => {
  it("Abruf: Housekeeper, Hausmann, Front Office, Concierge 403 — Technik, Supervisor, DM 200", async () => {
    const call = () => uploadGet(new NextRequest(`http://x/api/uploads/${FILE}`), { params: Promise.resolve({ path: [FILE] }) });
    for (const [k, role] of [["anna", "room_attendant"], ["hm", "houseman"], ["fo", "front_office"], ["con", "concierge"]] as const) { as(k, role); expect((await call()).status, role).toBe(403); }
    for (const [k, role] of [["eng", "engineering"], ["sup", "supervisor"], ["dm", "duty_manager"]] as const) { as(k, role); expect((await call()).status, role).toBe(200); }
  });

  it("nach „Mangel behoben“ + „wieder in Betrieb“ sind Datei und Verweis weg", async () => {
    expect((await applyStatusChange(sess("sup", "supervisor"), ids.r1, { status: "DIRTY" })).ok).toBe(true);
    expect((await prisma.defect.findUniqueOrThrow({ where: { id: ids.defect } })).photoPath).toBeNull();
    expect(existsSync(path.join(UPLOADS, FILE))).toBe(false);
  });
});

describe("Suche als Housekeeper (M17)", () => {
  it("fremdes Zimmer nur mit Nummer, Etage, Status — ohne Gast, VIP, Anreise", async () => {
    as("anna", "room_attendant");
    const body = await (await roomsGet(new NextRequest("http://x/api/rooms?q=403"))).json();
    const r = body.rooms.find((x: { number: string }) => x.number === "403");
    expect(r).toMatchObject({ number: "403", floor: 4, status: "DIRTY", foreign: true, arrivals: [] });
    expect(JSON.stringify(body)).not.toMatch(/Geheim|"vip":true/);
    const own = (await (await roomsGet(new NextRequest("http://x/api/rooms?q=402"))).json()).rooms[0];
    expect(own.foreign).toBeUndefined();
  });
});

describe("Wäschewechsel nur bestätigt (M19)", () => {
  it("Fertigmelden ohne Bestätigung bucht keinen Wechsel; mit Bestätigung schon", async () => {
    expect((await applyStatusChange(sess("anna", "room_attendant"), ids.r2, { status: "CLEAN" })).ok).toBe(true);
    expect((await prisma.room.findUniqueOrThrow({ where: { id: ids.r2 } })).lastLinenChangeAt).toBeNull();
    await prisma.room.update({ where: { id: ids.r2 }, data: { status: "IN_PROGRESS" } });
    expect((await applyStatusChange(sess("anna", "room_attendant"), ids.r2, { status: "CLEAN", laundryChanged: true })).ok).toBe(true);
    expect((await prisma.room.findUniqueOrThrow({ where: { id: ids.r2 } })).lastLinenChangeAt).not.toBeNull();
  });
});

describe("Freigabe-Warteschlange (M11)", () => {
  it("Sofort zuerst, dann früheste Anreise (VIP bei Gleichstand), dann Wartezeit; Anreise gefährdet in zwei Stufen", () => {
    const now = Date.now();
    const at = (min: number) => new Date(now + min * 60_000).toISOString();
    const q = sortReleaseQueue([
      { id: "wait", waitingMin: 90, arrival: null },
      { id: "late", waitingMin: 5, arrival: { eta: at(120), vip: false, neededNow: false } },
      { id: "vipSame", waitingMin: 5, arrival: { eta: at(60), vip: true, neededNow: false } },
      { id: "same", waitingMin: 30, arrival: { eta: at(60), vip: false, neededNow: false } },
      { id: "rush", waitingMin: 1, arrival: { eta: at(300), vip: false, neededNow: true } },
    ]);
    expect(q.map((x) => x.id)).toEqual(["rush", "vipSame", "same", "late", "wait"]);
    expect(etaState(at(-5), now)).toBe("overdue");
    expect(etaState(at(30), now)).toBe("soon");
    expect(etaState(at(200), now)).toBeNull();
  });
});

describe("Nachbesserung nach Review", () => {
  it("Housekeeper liest/schreibt Notizen nur an eigenen heutigen Zimmern (Leck über die Suche geschlossen)", async () => {
    const { GET: notesGet, POST: notesPost } = await import("@/app/api/rooms/[id]/notes/route");
    as("anna", "room_attendant");
    const foreign = await notesGet(new NextRequest(`http://x/api/rooms/${ids.r3}/notes`), { params: Promise.resolve({ id: ids.r3 }) });
    expect(foreign.status).toBe(403);
    const write = await notesPost(new NextRequest(`http://x/api/rooms/${ids.r3}/notes`, { method: "POST", body: JSON.stringify({ body: "x" }) }), { params: Promise.resolve({ id: ids.r3 }) });
    expect(write.status).toBe(403);
    const own = await notesGet(new NextRequest(`http://x/api/rooms/${ids.r2}/notes`), { params: Promise.resolve({ id: ids.r2 }) });
    expect(own.status).toBe(200);
    as("sup", "supervisor");
    expect((await notesGet(new NextRequest(`http://x/api/rooms/${ids.r3}/notes`), { params: Promise.resolve({ id: ids.r3 }) })).status).toBe(200);
  });

  it("Suche: fremdes Zimmer ohne Belegung/DND/Sperrgrund statt falscher Werte", async () => {
    as("anna", "room_attendant");
    const r = (await (await roomsGet(new NextRequest("http://x/api/rooms?q=403"))).json()).rooms.find((x: { number: string }) => x.number === "403");
    expect(r).not.toHaveProperty("occupancy");
    expect(r).not.toHaveProperty("guestDndActive");
    expect(r).not.toHaveProperty("blockReason");
  });

  it("Meldung an eine krank gemeldete Kraft geht an den Supervisor der Etage (M20)", async () => {
    const { notifyHousekeeperOfRoomChange } = await import("@/lib/rooms/notifyRoomChange");
    await prisma.user.update({ where: { id: ids.bea }, data: { sickDate: TODAY } });
    await prisma.notification.deleteMany();
    await notifyHousekeeperOfRoomChange({ roomId: ids.r3, kind: "RUSH", actorId: ids.sup });
    const all = await prisma.notification.findMany();
    expect(all.some((n) => n.targetUserId === ids.bea)).toBe(false);
    expect(all.some((n) => n.targetRole === "supervisor" && /abgemeldet/.test(n.message))).toBe(true);
    await prisma.user.update({ where: { id: ids.bea }, data: { sickDate: null } });
  });
});
