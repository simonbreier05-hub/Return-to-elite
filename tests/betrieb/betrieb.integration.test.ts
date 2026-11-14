/**
 * Betrieb L2 — Wege mit Datenbank (Wegwerf-SQLite, erfundene Daten): Green Option, Checkout + Meldungen, Late Check-out,
 * wiederkehrende Hausmann-Aufgaben, Einzel-Freigabe, Fotos nach Rolle, DND-Erinnerung.
 */
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-betrieb-"));
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
import { GUEST_SYSTEM_EMAIL } from "@/lib/guest";
import { runGuestAction } from "@/lib/guestActions";
import { loadRoomRows } from "@/lib/lists/dayRows";
import { POST as checkoutPost } from "@/app/api/rooms/[id]/checkout/route";
import { PATCH as lateCheckoutPatch } from "@/app/api/rooms/[id]/late-checkout/route";
import { GET as departuresGet } from "@/app/api/front-office/departures/route";
import { POST as recurringPost } from "@/app/api/recurring-tasks/route";
import { GET as roomTasksGet } from "@/app/api/roomtasks/route";
import { POST as bulkStatusPost } from "@/app/api/rooms/bulk-status/route";
import { GET as roomsGet } from "@/app/api/rooms/route";
import { runEscalations } from "@/lib/escalations";

vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-11-14T09:00:00Z")); // 10:00 Berlin
const D = "2026-11-14";
const ids: Record<string, string> = {};
const room: Record<string, string> = {};
const as = (key: string, role: string) => { getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: ids[key], name: `${key} Test`, role }); };
const req = (body?: unknown) => new NextRequest("http://x.test/api", { method: "POST", body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" } });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  const user = async (key: string, r: string, email = `${key}@x.test`) => { ids[key] = (await prisma.user.create({ data: { email, name: `${key} Test`, passwordHash: "x", role: r, assignedFloors: r === "supervisor" ? "3" : "" } })).id; };
  await user("anna", "room_attendant");
  await user("sup", "supervisor");
  await user("fo", "front_office");
  await user("hm", "houseman");
  await user("eng", "engineering");
  await user("guest", "guest", GUEST_SYSTEM_EMAIL);
  const mk = async (n: string, kind: string, extra: { laundry?: boolean; status?: string; blockReason?: string } = {}) => {
    const r = await prisma.room.create({ data: { number: n, floor: 3, section: "3A", type: "CLASSIC", credit: 1.5, status: extra.status ?? "DIRTY", blockReason: extra.blockReason ?? null, assignedToId: ids.anna, assignedOn: D } });
    room[n] = r.id;
    const stay = await prisma.stay.create({ data: { roomId: r.id, guestName: "Herr Test", source: "IMPORT", checkIn: new Date("2026-11-12T00:00:00Z"), checkOut: new Date(`${D}T10:00:00Z`), status: "IN_HOUSE", stayToken: `t-${n}` } });
    await prisma.dayRoomPlan.create({ data: { date: D, roomId: r.id, cleaningType: kind, laundryDue: !!extra.laundry, stayId: stay.id } });
  };
  await mk("301", "STAYOVER", { laundry: true });
  await mk("302", "SAME_DAY_TURN");
  await mk("303", "DEPARTURE");
  await mk("304", "STAYOVER", { status: "BLOCKED", blockReason: "DND" });
  await mk("305", "CLEAN_DUMMY" as never);
  await prisma.dayRoomPlan.updateMany({ where: { roomId: room["305"] }, data: { cleaningType: "STAYOVER" } });
  await prisma.room.updateMany({ where: { id: { in: [room["301"], room["305"]] } }, data: { status: "CLEAN" } });
  const d = await prisma.defect.create({ data: { roomId: room["301"], category: "OTHER", note: "Lampe", photoPath: "/api/uploads/x.jpg", reportedById: ids.anna } });
  await prisma.workOrder.create({ data: { defectId: d.id } });
}, 120_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Punkt 11 — Green Option", () => {
  it("setzt den Wäschewechsel heute aus, sichtbar in der Liste; zweimal wählen legt nichts doppelt an", async () => {
    let [r] = await loadRoomRows(D, { roomIds: [room["301"]] }, ["HOUSEKEEPING"]);
    expect(r).toMatchObject({ laundry: true, green: false });
    expect((await runGuestAction("green", { id: room["301"], number: "301" }, req({}))).status).toBe(201);
    expect((await runGuestAction("green", { id: room["301"], number: "301" }, req({}))).status).toBe(200);
    expect(await prisma.guestRequest.count({ where: { roomId: room["301"], kind: "GREEN" } })).toBe(1);
    [r] = await loadRoomRows(D, { roomIds: [room["301"]] }, ["HOUSEKEEPING"]);
    expect(r).toMatchObject({ laundry: false, green: true });
    const n = await prisma.notification.findFirst({ where: { roomId: room["301"], targetUserId: ids.anna } });
    expect(n?.message).not.toContain("Test"); // keine Gastnamen
  });
});

describe("Punkt 3 — Ausgecheckt und Late Check-out", () => {
  it("Front Office meldet ausgecheckt: Stay CHECKED_OUT, Housekeeperin dringend gemeldet, Supervisor der Etage gemeldet", async () => {
    as("fo", "front_office");
    expect((await checkoutPost(req({}), ctx(room["302"]))).status).toBe(200);
    const stay = await prisma.stay.findFirstOrThrow({ where: { roomId: room["302"] } });
    expect(stay.status).toBe("CHECKED_OUT");
    const hk = await prisma.notification.findFirst({ where: { roomId: room["302"], targetUserId: ids.anna, type: "GUEST_CHECKED_OUT" } });
    expect(hk?.level).toBe("warning");
    expect(await prisma.notification.count({ where: { roomId: room["302"], type: "GUEST_CHECKED_OUT", targetRole: "supervisor" } })).toBeGreaterThanOrEqual(1);
    const [row] = await loadRoomRows(D, { roomIds: [room["302"]] }, ["HOUSEKEEPING"]);
    expect(row.checkedOut).toBe(true);
    // zweimal melden ändert nichts
    const before = await prisma.notification.count();
    expect((await checkoutPost(req({}), ctx(room["302"]))).status).toBe(200);
    expect(await prisma.notification.count()).toBe(before);
  });
  it("Housekeeper darf nicht melden; Bleiber ohne Abreise → 409", async () => {
    as("anna", "room_attendant");
    expect((await checkoutPost(req({}), ctx(room["303"]))).status).toBe(403);
    as("fo", "front_office");
    expect((await checkoutPost(req({}), ctx(room["301"]))).status).toBe(409);
  });
  it("Late Check-out: Front Office setzt von Hand (bleibt beim Import), Supervisor darf es nicht; Abreisen-Liste zeigt es", async () => {
    as("sup", "supervisor");
    expect((await lateCheckoutPatch(new NextRequest("http://x.test", { method: "PATCH", body: JSON.stringify({ time: "13:30" }) }), ctx(room["303"]))).status).toBe(403);
    as("fo", "front_office");
    expect((await lateCheckoutPatch(new NextRequest("http://x.test", { method: "PATCH", body: JSON.stringify({ time: "13:30" }) }), ctx(room["303"]))).status).toBe(200);
    const p = await prisma.dayRoomPlan.findFirstOrThrow({ where: { roomId: room["303"] } });
    expect(p).toMatchObject({ lateCheckout: "13:30", lateCheckoutManual: true });
    const list = await (await departuresGet()).json();
    expect(list.departures.find((d: { number: string }) => d.number === "303")).toMatchObject({ lateCheckout: "13:30", checkedOut: false, guest: "Herr Test" }); // Punkt 13: „Anrede Titel Nachname“
    expect(list.departures.find((d: { number: string }) => d.number === "302")).toMatchObject({ checkedOut: true });
    expect(JSON.stringify(list)).not.toMatch(/stayToken|fullName|adults/); // keine weiteren Gastdaten
  });
});

describe("Punkt 9 — wiederkehrende Hausmann-Aufgaben", () => {
  it("Hausmann legt an; heute fällig → genau eine Aufgabe, auch bei mehrfachem Laden", async () => {
    as("hm", "houseman");
    expect((await recurringPost(req({ roomNumber: "305", label: "Blumen gießen", everyDays: 2 }))).status).toBe(201);
    await roomTasksGet();
    const body = await (await roomTasksGet()).json();
    const tasks = body.roomTasks.filter((t: { note: string }) => t.note === "Blumen gießen");
    expect(tasks).toHaveLength(1);
    expect(tasks[0].type).toBe("SONSTIGES");
  });
  it("Housekeeper dürfen keine anlegen", async () => {
    as("anna", "room_attendant");
    expect((await recurringPost(req({ roomNumber: "305", label: "X", everyDays: 1 }))).status).toBe(403);
  });
});

describe("Punkt 5 — Abnahme nur einzeln", () => {
  it("mehrere Zimmer auf einmal freigeben → 400 RELEASE_SINGLE_ONLY, nichts geändert", async () => {
    as("sup", "supervisor");
    const res = await bulkStatusPost(req({ roomIds: [room["301"], room["305"]], status: "INSPECTED" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("RELEASE_SINGLE_ONLY");
    expect(await prisma.room.count({ where: { id: { in: [room["301"], room["305"]] }, status: "INSPECTED" } })).toBe(0);
  });
});

describe("Punkt 8 — Mängel-Fotos nach Rolle", () => {
  it("Housekeeper bekommt keinen Foto-Pfad, Technik schon", async () => {
    const pathFor = async (key: string, role: string) => {
      as(key, role);
      const body = await (await roomsGet(new NextRequest("http://x.test/api/rooms"))).json();
      return body.rooms.find((r: { number: string }) => r.number === "301")?.defects?.[0]?.photoPath;
    };
    expect(await pathFor("anna", "room_attendant")).toBeNull();
    expect(await pathFor("eng", "engineering")).toBe("/api/uploads/x.jpg");
  });
});

describe("Punkt 4 — DND-Erinnerung ab 12:00", () => {
  it("vor 12 nichts; ab 12 einmal an Housekeeperin und Supervisor; zweiter Lauf nichts; Liste zeigt „Karte hängen“", async () => {
    await runEscalations(new Date("2026-11-14T10:30:00Z")); // 11:30 Berlin
    expect(await prisma.notification.count({ where: { type: "DND_REMINDER" } })).toBe(0);
    const noon = new Date("2026-11-14T11:15:00Z"); // 12:15 Berlin
    vi.setSystemTime(noon);
    await runEscalations(noon);
    expect(await prisma.notification.count({ where: { type: "DND_REMINDER", targetUserId: ids.anna, roomId: room["304"] } })).toBe(1);
    expect(await prisma.notification.count({ where: { type: "DND_REMINDER", targetRole: "supervisor", roomId: room["304"] } })).toBe(1);
    await runEscalations(new Date("2026-11-14T11:20:00Z"));
    expect(await prisma.notification.count({ where: { type: "DND_REMINDER" } })).toBe(2);
    const [row] = await loadRoomRows(D, { roomIds: [room["304"]] }, null, { now: noon });
    expect(row.dndCard).toBe(true);
    vi.setSystemTime(new Date("2026-11-14T09:00:00Z"));
  });
});
