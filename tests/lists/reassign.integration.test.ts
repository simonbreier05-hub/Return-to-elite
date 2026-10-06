import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-reassign-"));
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
import { GET as notificationsGet } from "@/app/api/notifications/route";
import { POST as assignPost } from "@/app/api/rooms/[id]/assign/route";
import { moveRoomBetweenAttendants } from "@/lib/rooms/moveRoomBetweenAttendants";

const ids: Record<string, string> = {};
const as = (key: string, role: string) => { getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: ids[key], name: key, role }); };
const mine = async (key: string, role: string) => { as(key, role); return (await (await notificationsGet()).json()).notifications as { type: string; message: string; targetUserId: string | null }[]; };

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  const user = async (k: string, role: string, extra: Record<string, unknown> = {}) => { ids[k] = (await prisma.user.create({ data: { email: `${k}@x.test`, name: `${k} Test`, passwordHash: "x", role, ...extra } })).id; };
  await user("hkA", "room_attendant"); await user("hkB", "room_attendant"); await user("hkC", "room_attendant");
  await user("sup2", "supervisor", { assignedFloors: "2" }); await user("sup3", "supervisor", { assignedFloors: "3" });
  await user("sup0", "supervisor"); await user("dm", "duty_manager");
  const mk = (n: string, floor: number, hk: string) => prisma.room.create({ data: { number: n, floor, section: `${floor}A`, type: "STANDARD", assignedToId: ids[hk], routeOrder: 0 } });
  ids.r203 = (await mk("203", 2, "hkA")).id; await mk("204", 2, "hkA");
  await mk("301", 3, "hkB"); // hkB arbeitet auf Etage 3
}, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Verschieben über Etagen: Meldungen", () => {
  it("Verschieben von Etage 2 zu einer Kraft von Etage 3: neue und alte Kraft sowie beide zuständigen Supervisoren werden gemeldet", async () => {
    as("sup0", "supervisor"); broadcastMock.mockReset();
    const res = await moveRoomBetweenAttendants({ userId: ids.sup0, name: "sup0", role: "supervisor" } as never, ids.r203, ids.hkB);
    expect(res.ok).toBe(true);
    const a = await mine("hkA", "room_attendant"), b = await mine("hkB", "room_attendant");
    expect(b.map((n) => n.type)).toEqual(["ROOM_ASSIGNED"]);
    expect(b[0].message).toBe("Zimmer 203 (Etage 2) wurde dir zugeteilt.");
    expect(a.map((n) => n.type)).toEqual(["ROOM_UNASSIGNED"]);
    expect(a[0].message).toBe("Zimmer 203 (Etage 2) wurde von deiner Liste genommen."); // keine Namen Dritter
    const s2 = await mine("sup2", "supervisor"), s3 = await mine("sup3", "supervisor");
    expect(s2.map((n) => n.type)).toEqual(["ROOM_MOVED"]); // Etage des Zimmers
    expect(s3.map((n) => n.type)).toEqual(["ROOM_MOVED"]); // Etage der neuen Kraft
    expect(s2[0].message).toContain("von hkA Test zu hkB Test");
    expect(s2[0].message).toContain("sup0 Test");
    expect(broadcastMock.mock.calls.filter((c) => c[0] === "notification:new")).toHaveLength(4);
  });

  it("jede Person sieht nur ihre eigenen Meldungen", async () => {
    expect(await mine("hkC", "room_attendant")).toEqual([]); // unbeteiligt
    expect(await mine("sup0", "supervisor")).toEqual([]); // wer es selbst getan hat, wird nicht gemeldet; ohne Etage nichts
    expect((await mine("hkA", "room_attendant")).every((n) => n.targetUserId === ids.hkA)).toBe(true);
    expect((await mine("dm", "duty_manager")).length).toBe(4); // Duty Manager sieht alle
  });

  it("wer verschiebt, bekommt keine Meldung dazu", async () => {
    await prisma.notification.deleteMany();
    as("sup2", "supervisor");
    await moveRoomBetweenAttendants({ userId: ids.sup2, name: "sup2", role: "supervisor" } as never, ids.r203, ids.hkA);
    expect((await mine("sup2", "supervisor")).filter((n) => n.type === "ROOM_MOVED")).toEqual([]);
    expect((await mine("sup3", "supervisor")).map((n) => n.type)).toEqual([]); // hkA arbeitet nur auf Etage 2, Etage 3 ist nicht betroffen
  });

  it("Zuteilen und Entfernen über die Zuteilungs-Route melden ebenfalls", async () => {
    await prisma.notification.deleteMany();
    as("sup0", "supervisor");
    const call = (attendantId: string | null) => { as("sup0", "supervisor"); return assignPost(new NextRequest("http://x", { method: "POST", body: JSON.stringify({ attendantId }) }), { params: Promise.resolve({ id: ids.r203 }) }); };
    expect((await call(null)).status).toBe(200); // von hkA entfernen
    expect((await mine("hkA", "room_attendant")).map((n) => n.message)).toEqual(["Zimmer 203 (Etage 2) wurde von deiner Liste genommen."]);
    await prisma.notification.deleteMany();
    expect((await call(ids.hkC)).status).toBe(200); // frei → hkC
    expect((await mine("hkC", "room_attendant")).map((n) => n.type)).toEqual(["ROOM_ASSIGNED"]);
    expect((await mine("hkA", "room_attendant"))).toEqual([]);
  });

  it("gleiche Zuteilung ändert nichts und meldet nichts", async () => {
    await prisma.notification.deleteMany();
    as("sup0", "supervisor");
    const res = await assignPost(new NextRequest("http://x", { method: "POST", body: JSON.stringify({ attendantId: ids.hkC }) }), { params: Promise.resolve({ id: ids.r203 }) });
    expect(res.status).toBe(200);
    expect(await prisma.notification.count()).toBe(0);
  });

  it("Meldungstexte enthalten keine Gastdaten und keine Typ-/Stufen-Daten", async () => {
    await prisma.notification.deleteMany();
    as("sup0", "supervisor");
    await moveRoomBetweenAttendants({ userId: ids.sup0, name: "sup0", role: "supervisor" } as never, ids.r203, ids.hkB);
    const all = JSON.stringify(await prisma.notification.findMany());
    expect(all).not.toMatch(/hkType|hkLevel|VOLLZEIT|AZUBI|Stufe|guest/i);
  });
});
