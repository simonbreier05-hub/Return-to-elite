import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-lists-"));
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
import { GET as housekeeperGet } from "@/app/api/lists/housekeeper/route";
import { GET as roomsGet } from "@/app/api/rooms/route";

const D = "2026-09-22";
const ids: Record<string, string> = {};

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  const user = async (key: string, role: string) => { ids[key] = (await prisma.user.create({ data: { email: `${key}@x.test`, name: `${key} Test`, passwordHash: "x", role } })).id; };
  await user("anna", "room_attendant"); await user("bea", "room_attendant"); await user("sup", "supervisor");
  const batch = await prisma.importBatch.create({ data: { type: "DEPARTURES", status: "APPLIED", businessDate: D, fileHash: "h", appliedAt: new Date(), uploadedById: ids.sup } as never });
  void batch;

  const mkStay = async (room: string, name: string, source: string, adults: number, children: number, vip = false) =>
    (await prisma.stay.create({ data: { roomId: room, guestName: name, source, adults, children, vip, checkIn: new Date(`${D}T00:00:00Z`), checkOut: new Date("2026-09-24T10:00:00Z"), stayToken: `t-${room}-${name}` } })).id;
  const rooms: { n: string; hk: string; order: number | null; kind: string; guest?: [string, string, number, number, boolean?]; laundry?: boolean }[] = [
    { n: "201", hk: "anna", order: 2, kind: "DEPARTURE", guest: ["Herr Dr. Krüger", "IMPORT", 2, 1, true] },
    { n: "202", hk: "anna", order: 1, kind: "STAYOVER", guest: ["Mr. Smith", "IMPORT", 1, 0], laundry: true },
    { n: "203", hk: "anna", order: 3, kind: "STAYOVER", guest: ["Meier", "IMPORT", 2, 0] },
    { n: "204", hk: "anna", order: 4, kind: "SAME_DAY_TURN", guest: ["Klaus Müller", "MANUAL", 2, 0] },
    { n: "205", hk: "bea", order: 1, kind: "DEPARTURE", guest: ["Frau Fremd", "IMPORT", 1, 0] },
  ];
  for (const r of rooms) {
    const room = await prisma.room.create({ data: { number: r.n, floor: 2, section: "2A", type: "STANDARD", status: r.n === "202" ? "CLEAN" : "DIRTY", assignedToId: ids[r.hk], assignedOn: D, routeOrder: r.order } });
    const stayId = r.guest ? await mkStay(room.id, r.guest[0], r.guest[1], r.guest[2], r.guest[3], !!r.guest[4]) : null;
    await prisma.dayRoomPlan.create({ data: { date: D, roomId: room.id, cleaningType: r.kind, laundryDue: !!r.laundry, stayId, arrivingStayId: r.kind === "SAME_DAY_TURN" ? stayId : null } });
    if (r.n === "201") {
      await prisma.trace.create({ data: { roomId: room.id, code: "HK", date: D, text: "Allergikerbettwäsche", dept: "HOUSEKEEPING", dedupeKey: "k1", source: "TRACES" } });
      await prisma.trace.create({ data: { roomId: room.id, code: "TWIN", date: D, text: "Twinbett", dept: "HOUSEMAN", dedupeKey: "k2", source: "TRACES" } });
      await prisma.trace.create({ data: { roomId: room.id, code: "ENG", date: D, text: "Klimaanlage prüfen", dept: "ENGINEERING", dedupeKey: "k3", source: "TRACES" } });
    }
  }
  // Alte Zuteilung von gestern ohne Tagesplan: darf nicht erscheinen
  await prisma.room.create({ data: { number: "299", floor: 2, section: "2A", type: "STANDARD", assignedToId: ids.anna, assignedOn: "2026-09-20" } });
}, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Zimmermädchen-Liste", () => {
  it("liefert nur die eigenen Zimmer in Laufplan-Reihenfolge, ohne alte Zuteilungen", async () => {
    getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: ids.anna, name: "anna Test", role: "room_attendant" });
    const body = await (await housekeeperGet()).json();
    expect(body.rooms.map((r: { number: string }) => r.number)).toEqual(["202", "201", "203", "204"]);
    expect(body.date).toBe(D);
  });

  it("Gastname: Anrede + Titel + Nachname; ohne Anrede nur Nachname; nie Vornamen; Personenzahl", async () => {
    getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: ids.anna, name: "anna Test", role: "room_attendant" });
    const body = await (await housekeeperGet()).json();
    const by = Object.fromEntries(body.rooms.map((r: { number: string }) => [r.number, r]));
    expect(by["201"]).toMatchObject({ guest: "Herr Dr. Krüger", pax: 3, vip: true, kind: "DEPARTURE" });
    expect(by["202"]).toMatchObject({ guest: "Mr. Smith", pax: 1, laundry: true });
    expect(by["203"].guest).toBe("Meier");
    expect(by["204"].guest).toBe("Müller"); // von Hand erfasst: „Klaus Müller" → nur Nachname
  });

  it("Server liefert den vollen Namen nicht aus: keine Vornamen, keine Altersfelder, keine fremden Zimmer im Text", async () => {
    getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: ids.anna, name: "anna Test", role: "room_attendant" });
    const raw = JSON.stringify(await (await housekeeperGet()).json());
    expect(raw).not.toContain("Klaus");
    expect(raw).not.toContain("Fremd"); // Gast aus Beas Zimmer
    expect(raw).not.toMatch(/"(age|birth|children|adults|firstName|fullName)"/i);
  });

  it("Traces: nur Housekeeping — keine Hausmann-/Technik-Traces", async () => {
    getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: ids.anna, name: "anna Test", role: "room_attendant" });
    const body = await (await housekeeperGet()).json();
    const r201 = body.rooms.find((r: { number: string }) => r.number === "201");
    expect(r201.traces.map((t: { text: string }) => t.text)).toEqual(["Allergikerbettwäsche"]);
    expect(JSON.stringify(body)).not.toContain("Klimaanlage");
  });

  it("Kopf: Fortschritt x von y und Credits-Summe (Bleiber × 0,7)", async () => {
    getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: ids.anna, name: "anna Test", role: "room_attendant" });
    const { progress } = await (await housekeeperGet()).json();
    expect(progress.total).toBe(4);
    expect(progress.done).toBe(1); // 202 ist CLEAN
    expect(progress.creditsTotal).toBeGreaterThan(0);
    expect(progress.creditsDone).toBeGreaterThan(0);
    expect(progress.creditsDone).toBeLessThan(progress.creditsTotal);
  });

  it("Rollen: Gast/anderer Rolle → 401/403 (Supervisor hat keine eigene Zimmerliste)", async () => {
    getSessionMock.mockReset(); getSessionMock.mockResolvedValue(null);
    expect((await housekeeperGet()).status).toBe(401);
    getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: ids.sup, name: "sup", role: "supervisor" });
    expect((await housekeeperGet()).status).toBe(403);
    getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: "x", name: "x", role: "houseman" });
    expect((await housekeeperGet()).status).toBe(403);
  });

  it("/api/rooms kürzt von Hand erfasste Gastnamen für Housekeeper, Supervisor sieht den Eintrag", async () => {
    const room = await prisma.room.findUnique({ where: { number: "201" } });
    await prisma.arrival.create({ data: { roomId: room!.id, guestName: "Klaus Müller", source: "MANUAL", createdById: ids.sup } });
    getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: ids.anna, name: "anna Test", role: "room_attendant" });
    const hk = JSON.stringify(await (await roomsGet(new NextRequest("http://x/api/rooms?mine=1"))).json());
    expect(hk).not.toContain("Klaus");
    expect(hk).toContain("Müller");
    getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: ids.sup, name: "sup", role: "duty_manager" });
    const dm = JSON.stringify(await (await roomsGet(new NextRequest("http://x/api/rooms"))).json());
    expect(dm).toContain("Klaus Müller");
  });
});
