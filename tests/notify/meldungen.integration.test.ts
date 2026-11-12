import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Paket O1: neue Meldungsstellen gehen an die richtige Person (targetUserId) und enthalten nie Gastnamen.
 * Wegwerf-DB (SQLite), erfundene Namen.
 */
const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-o1-"));
  return { dir: d, url: `file:${p.join(d, "test.db")}` };
});
vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient({ datasources: { db: { url } } }) };
});
const getSessionMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: (...a: unknown[]) => getSessionMock(...a) }));
vi.mock("@/lib/realtime", () => ({ broadcast: vi.fn(), emitTo: vi.fn() }));

import { prisma } from "@/lib/db";
import { berlinDate } from "@/lib/dayplan/time";
import { applyStatusChange } from "@/lib/rooms/applyStatusChange";
import { runEscalations } from "@/lib/escalations";
import { notifyListUpdate } from "@/lib/rooms/notifyListUpdate";
import { GET as notificationsGet, PATCH as notificationsPatch } from "@/app/api/notifications/route";
import { PATCH as workorderPatch } from "@/app/api/workorders/[id]/route";
import { PATCH as arrivalPatch } from "@/app/api/arrivals/[id]/route";
import { POST as excursionPost } from "@/app/api/excursions/route";
import { PATCH as roomtaskPatch } from "@/app/api/roomtasks/[id]/route";

const GUEST = "Gastmann"; // erfundener Nachname; darf in keiner Meldung stehen
const ids: Record<string, string> = {};
const TODAY = berlinDate(new Date());
const as = (key: string, role: string) => { getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: ids[key], name: key, role }); };
const req = (body: unknown, method = "PATCH") => new NextRequest("http://x/api", { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const all = () => prisma.notification.findMany({ orderBy: { createdAt: "asc" } });
const noGuestName = (list: { message: string; messageVars: string | null }[]) => {
  for (const x of list) expect(`${x.message} ${x.messageVars ?? ""}`).not.toContain(GUEST);
};
async function fresh() {
  await prisma.notification.deleteMany();
}

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  const user = async (k: string, role: string, extra: Record<string, unknown> = {}) => {
    ids[k] = (await prisma.user.create({ data: { email: `${k}@x.test`, name: `${k} Test`, passwordHash: "x", role, ...extra } })).id;
  };
  await user("hkA", "room_attendant"); await user("hkB", "room_attendant"); await user("hkOld", "room_attendant");
  await user("sup3", "supervisor", { assignedFloors: "3" }); await user("sup4", "supervisor", { assignedFloors: "4" });
  await user("fo", "front_office"); await user("con", "concierge"); await user("eng", "engineering"); await user("hm", "houseman");
  await user("dm", "duty_manager"); await user("guest", "guest");
  const mk = async (n: string, floor: number, extra: Record<string, unknown> = {}) =>
    (ids[`r${n}`] = (await prisma.room.create({ data: { number: n, floor, section: `${floor}A`, type: "STANDARD", ...extra } })).id);
  await mk("301", 3, { status: "CLEAN", assignedToId: ids.hkA, assignedOn: TODAY });
  await mk("302", 3, { status: "DIRTY", assignedToId: ids.hkA, assignedOn: TODAY });
  await mk("303", 3, { status: "DIRTY", assignedToId: ids.hkOld, assignedOn: "2020-01-01" }); // Zuteilung von „gestern“
}, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Ablehnung/Nacharbeit → zuständige HK", () => {
  it("Supervisor setzt CLEAN → PICKUP: nur die heutige Kraft bekommt eine dringende Meldung, ohne Notiztext", async () => {
    await fresh();
    const res = await applyStatusChange({ userId: ids.sup3, name: "sup3", role: "supervisor" } as never, ids.r301, { status: "PICKUP", note: `Bad nicht sauber, ${GUEST} beschwert` });
    expect(res.ok).toBe(true);
    const list = await all();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ type: "ROOM_REWORK", level: "warning", targetRole: "room_attendant", targetUserId: ids.hkA, roomId: ids.r301 });
    expect(list[0].message).not.toMatch(/Bad nicht sauber/);
    noGuestName(list);
  });
});

describe("Mangel behoben → meldende und zuständige HK", () => {
  it("meldet zuständige HK und die meldende Kraft (verschieden), nie den Gast-Zugang", async () => {
    await fresh();
    const mkWo = async (reporter: string) => {
      const d = await prisma.defect.create({ data: { roomId: ids.r302, category: "PLUMBING", note: "Hahn tropft", reportedById: ids[reporter] } });
      return (await prisma.workOrder.create({ data: { defectId: d.id, status: "IN_PROGRESS" } })).id;
    };
    const wo1 = await mkWo("hkB");
    as("eng", "engineering");
    expect((await workorderPatch(req({ status: "RESOLVED" }), ctx(wo1))).status).toBe(200);
    const list = await all();
    const targets = list.filter((x) => x.type === "DEFECT_FIXED").map((x) => x.targetUserId).sort();
    expect(targets).toEqual([ids.hkA, ids.hkB].sort());
    expect(list.some((x) => x.type === "WORK_ORDER_RESOLVED" && x.targetRole === "supervisor")).toBe(true);

    await fresh();
    const wo2 = await mkWo("guest");
    expect((await workorderPatch(req({ status: "RESOLVED" }), ctx(wo2))).status).toBe(200);
    expect((await all()).filter((x) => x.type === "DEFECT_FIXED").map((x) => x.targetUserId)).toEqual([ids.hkA]);
  });
});

describe("FO „Sofort“/VIP-Frühanreise → Supervisor der Etage + HK", () => {
  it("neededNow: Supervisor Etage 3 (nicht Etage 4) und zuständige HK, ohne Gastnamen", async () => {
    await fresh();
    const a = await prisma.arrival.create({ data: { roomId: ids.r302, guestName: `Herr ${GUEST}`, createdById: ids.fo } });
    as("fo", "front_office");
    expect((await arrivalPatch(req({ neededNow: true }), ctx(a.id))).status).toBe(200);
    const list = await all();
    expect(list.filter((x) => x.type === "ARRIVAL_PRIORITY").map((x) => x.targetUserId)).toEqual([ids.sup3]);
    expect(list.filter((x) => x.targetRole === "room_attendant").map((x) => x.targetUserId)).toEqual([ids.hkA]);
    noGuestName(list);
    // Nochmal speichern ohne Änderung: keine zweite Meldung an den Supervisor
    await fresh();
    await arrivalPatch(req({ neededNow: true }), ctx(a.id));
    expect((await all()).filter((x) => x.type === "ARRIVAL_PRIORITY")).toHaveLength(0);
  });
  it("VIP + Frühanreise gesetzt → Supervisor der Etage", async () => {
    await fresh();
    const a = await prisma.arrival.create({ data: { roomId: ids.r301, guestName: `Frau ${GUEST}`, createdById: ids.fo } });
    as("fo", "front_office");
    await arrivalPatch(req({ vip: true, earlyCheckIn: true }), ctx(a.id));
    const sup = (await all()).filter((x) => x.type === "ARRIVAL_PRIORITY");
    expect(sup).toHaveLength(1);
    expect(sup[0].messageKey).toBe("notify.arrivalVipEarly");
  });
});

describe("Ausflug → zuständige HK", () => {
  it("angelegt: HK bekommt „Gast außer Haus“ (ohne Gastnamen); „bald zurück“ einmal über den Ticker", async () => {
    await fresh();
    as("con", "concierge");
    const now = Date.now();
    const res = await excursionPost(req({ roomNumber: "302", guestName: `Herr ${GUEST}`, startsAt: new Date(now - 60_000).toISOString(), endsAt: new Date(now + 30 * 60_000).toISOString() }, "POST"));
    expect(res.status).toBe(201);
    let list = await all();
    expect(list.map((x) => [x.type, x.targetUserId])).toEqual([["EXCURSION", ids.hkA]]);
    await runEscalations(new Date());
    await runEscalations(new Date());
    list = (await all()).filter((x) => x.type === "EXCURSION");
    expect(list).toHaveLength(2);
    expect(list[1].messageVars).toContain("changeEXCURSION_SOON");
    noGuestName(await all());
  });
});

describe("Hand-Aufgabe erledigt → Supervisor der Etage", () => {
  it("RoomTask DONE meldet den Supervisor der Etage, nicht den der anderen Etage", async () => {
    await fresh();
    const t = await prisma.roomTask.create({ data: { roomId: ids.r302, type: "SONSTIGES", note: "Bett umbauen", createdById: ids.sup3 } });
    as("hm", "houseman");
    expect((await roomtaskPatch(req({ status: "DONE" }), ctx(t.id))).status).toBe(200);
    const list = await all();
    expect(list.map((x) => [x.type, x.targetUserId])).toEqual([["HOUSEMAN_TASK_DONE", ids.sup3]]);
    expect(list[0].message).not.toContain("Bett umbauen");
  });
});

describe("Gastnamen raus aus bestehenden Meldungen", () => {
  it("Zimmer freigegeben (FO) und Anreise gefährdet (Supervisor) ohne Gastnamen", async () => {
    await fresh();
    const r = await prisma.room.create({ data: { number: "401", floor: 4, section: "4A", type: "STANDARD", status: "CLEAN" } });
    await prisma.arrival.create({ data: { roomId: r.id, guestName: `Herr ${GUEST}`, vip: true, createdById: ids.fo } });
    await prisma.arrival.create({ data: { roomId: ids.r303, guestName: `Frau ${GUEST}`, eta: new Date(Date.now() + 5 * 60_000), createdById: ids.fo } });
    await applyStatusChange({ userId: ids.sup4, name: "sup4", role: "supervisor" } as never, r.id, { status: "INSPECTED" });
    await runEscalations(new Date());
    const list = await all();
    expect(list.some((x) => x.type === "ROOM_RELEASED")).toBe(true);
    expect(list.some((x) => x.type === "ETA_AT_RISK")).toBe(true);
    noGuestName(list);
  });
});

describe("Nachimport meldet nur heutige Zuteilungen", () => {
  it("Zimmer mit Zuteilung von gestern: keine HK-Meldung", async () => {
    await fresh();
    await notifyListUpdate({ date: TODAY, actorId: ids.dm, changes: [{ number: "303", floor: 3, roomId: ids.r303, from: "STAYOVER", to: "DEPARTURE" }, { number: "302", floor: 3, roomId: ids.r302, from: "STAYOVER", to: "DEPARTURE" }], newTraces: [], source: "IMPORT" });
    const hkTargets = (await all()).filter((x) => x.targetRole === "room_attendant").map((x) => x.targetUserId);
    expect(hkTargets).toEqual([ids.hkA]);
  });
});

describe("Gelesen je Person (NotificationRead)", () => {
  const mk = (data: Record<string, unknown>) => prisma.notification.create({ data: { type: "X", level: "info", message: "m", ...data } as never });
  const readBy = async (key: string, role: string) => {
    as(key, role);
    const g = await (await notificationsGet()).json();
    return Object.fromEntries((g.notifications as { id: string; acknowledged: boolean }[]).map((x) => [x.id, x.acknowledged]));
  };

  it("Duty Manager: liest alle, sein „Alle gelesen“ ändert keine fremde Glocke", async () => {
    await fresh();
    const forHk = await mk({ targetRole: "room_attendant", targetUserId: ids.hkA });
    const forDm = await mk({ targetRole: "duty_manager" });
    as("dm", "duty_manager");
    const g = await (await notificationsGet()).json();
    expect(g.notifications).toHaveLength(2); // Übersicht bleibt
    expect(g.me).toEqual({ role: "duty_manager", userId: ids.dm });
    await notificationsPatch(req({ all: true }));
    expect(await readBy("dm", "duty_manager")).toEqual({ [forHk.id]: true, [forDm.id]: true }); // für ihn selbst gelesen
    expect((await readBy("hkA", "room_attendant"))[forHk.id]).toBe(false); // HK-Glocke bleibt ungelesen
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: forHk.id } })).acknowledged).toBe(false); // Altspalte unberührt
  });

  it("Rollen-Meldung: HK A quittiert → HK B bleibt ungelesen; doppelt quittieren ist harmlos", async () => {
    await fresh();
    const role = await mk({ targetRole: "room_attendant" });
    as("hkA", "room_attendant");
    await notificationsPatch(req({ id: role.id }));
    await notificationsPatch(req({ id: role.id }));
    await notificationsPatch(req({ all: true }));
    expect(await prisma.notificationRead.count({ where: { notificationId: role.id } })).toBe(1);
    expect((await readBy("hkA", "room_attendant"))[role.id]).toBe(true);
    expect((await readBy("hkB", "room_attendant"))[role.id]).toBe(false);
  });

  it("fremde Meldungen kann man nicht quittieren; Altbestand (acknowledged) gilt als gelesen", async () => {
    await fresh();
    const other = await mk({ targetRole: "room_attendant", targetUserId: ids.hkB });
    const legacy = await mk({ targetRole: "room_attendant", acknowledged: true });
    as("hkA", "room_attendant");
    await notificationsPatch(req({ id: other.id }));
    expect(await prisma.notificationRead.count({ where: { notificationId: other.id } })).toBe(0);
    expect((await readBy("hkB", "room_attendant"))[legacy.id]).toBe(true);
  });

  it("Meldung gelöscht → Lesezeilen fallen mit weg", async () => {
    await fresh();
    const n = await mk({ targetRole: "room_attendant" });
    as("hkA", "room_attendant");
    await notificationsPatch(req({ id: n.id }));
    await prisma.notification.delete({ where: { id: n.id } });
    expect(await prisma.notificationRead.count({ where: { notificationId: n.id } })).toBe(0);
  });
});
