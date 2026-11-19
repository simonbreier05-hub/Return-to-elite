import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** F5 (H14, M2): Meldungen an den Duty Manager, Glocke seitenweise und gebündelt. Nur erfundene Daten. */
const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-f5-"));
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
import { setAbsent } from "@/lib/autoplan/service";
import { GET as notificationsGet, PATCH as notificationsPatch } from "@/app/api/notifications/route";
import { groupRoutine } from "@/lib/ui/notify";
import type { Role } from "@/lib/domain";

const ids: Record<string, string> = {};
const TODAY = berlinDate(new Date());
const as = (key: string, role: Role) => { getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: ids[key], name: key, role }); };
const get = async (q = "") => (await notificationsGet(new NextRequest(`http://x/api/notifications${q}`))).json();

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  for (const [k, role, floors] of [["sena", "room_attendant", ""], ["sup3", "supervisor", "3"], ["sup5", "supervisor", "5"], ["dm", "duty_manager", ""]] as const) {
    ids[k] = (await prisma.user.create({ data: { email: `${k}@x.test`, name: `${k} Test`, passwordHash: "x", role, assignedFloors: floors } })).id;
  }
  for (let i = 0; i < 4; i++) await prisma.room.create({ data: { number: `30${i}`, floor: 3, section: "3A", type: "STANDARD", status: "DIRTY", assignedToId: ids.sena, assignedOn: TODAY } });
}, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("H14: Krankmeldung", () => {
  it("geht direkt an den Duty Manager (dringend, mit Zimmerzahl) und an die Supervisoren der betroffenen Etage", async () => {
    await setAbsent(ids.sena, true, ids.sup3);
    const ns = await prisma.notification.findMany({ where: { type: "STAFF_SICK" } });
    const dm = ns.find((n) => n.targetRole === "duty_manager")!;
    expect(dm).toMatchObject({ level: "warning", messageKey: "notify.staffSick" });
    expect(dm.message).toContain("4 Zimmer offen");
    expect(ns.filter((n) => n.targetRole === "supervisor").map((n) => n.targetUserId)).toEqual([ids.sup3]); // nicht Etage 5
    await setAbsent(ids.sena, true, ids.sup3); // zweimal melden → keine zweite Meldung
    expect(await prisma.notification.count({ where: { type: "STAFF_SICK", targetRole: "duty_manager" } })).toBe(1);
  });
});

describe("M2: Glocke", () => {
  it("lädt seitenweise (kein Deckel 50), Filter „dringend“, „Alte schließen“ nur für ältere Tage", async () => {
    const now = Date.now();
    for (let i = 0; i < 130; i++) {
      await prisma.notification.create({ data: { type: "GUEST_CHECKED_OUT", level: i % 2 ? "info" : "warning", targetRole: "duty_manager", message: `Zimmer ${i}: Gast ausgecheckt.`, createdAt: new Date(now - i * 60_000) } });
    }
    await prisma.notification.create({ data: { type: "ETA_AT_RISK", level: "warning", targetRole: "duty_manager", message: "alt", createdAt: new Date(now - 3 * 86_400_000) } });
    as("dm", "duty_manager");
    const p1 = await get();
    expect(p1.notifications.length).toBe(60);
    expect(p1.nextBefore).toBeTruthy();
    const p2 = await get(`?before=${encodeURIComponent(p1.nextBefore)}`);
    expect(p2.notifications.length).toBe(60);
    expect(new Set([...p1.notifications, ...p2.notifications].map((n: { id: string }) => n.id)).size).toBe(120);
    const urgent = await get("?urgent=1&limit=200");
    expect(urgent.notifications.every((n: { level: string }) => n.level === "warning" || n.level === "critical")).toBe(true);
    await notificationsPatch(new NextRequest("http://x", { method: "PATCH", body: JSON.stringify({ olderThanToday: true }) }));
    const all = await get("?limit=200");
    const old = all.notifications.find((n: { message: string }) => n.message === "alt");
    expect(old.acknowledged).toBe(true);
    expect(all.notifications.filter((n: { acknowledged: boolean; message: string }) => n.message !== "alt" && n.acknowledged).length).toBe(0);
  });

  it("bündelt gleichartige Routine (ab 3 hintereinander), dringende Einzelmeldungen bleiben einzeln", () => {
    const list = [
      ...Array.from({ length: 28 }, (_, i) => ({ id: `c${i}`, type: "GUEST_CHECKED_OUT" })),
      { id: "x", type: "ROOM_BLOCKED_OCCUPIED" },
      { id: "y1", type: "GUEST_CHECKED_OUT" }, { id: "y2", type: "GUEST_CHECKED_OUT" },
    ];
    const g = groupRoutine(list);
    expect(g[0]).toMatchObject({ kind: "group", type: "GUEST_CHECKED_OUT" });
    expect(g[0].kind === "group" && g[0].items.length).toBe(28);
    expect(g.slice(1).map((x) => x.kind)).toEqual(["one", "one", "one"]);
  });
});

describe("Nachbesserung (Review)", () => {
  it("Seiten überspringen keine Meldungen mit gleichem Zeitstempel (Cursor Zeit|Id)", async () => {
    await prisma.notification.deleteMany();
    const t = new Date();
    for (let i = 0; i < 70; i++) await prisma.notification.create({ data: { type: "GUEST_CHECKED_OUT", level: "info", targetRole: "duty_manager", message: `x${i}`, createdAt: t } });
    as("dm", "duty_manager");
    const p1 = await get();
    const p2 = await get(`?before=${encodeURIComponent(p1.nextBefore)}`);
    expect(new Set([...p1.notifications, ...p2.notifications].map((n: { id: string }) => n.id)).size).toBe(70);
    expect(p2.nextBefore).toBeNull();
  });
});
