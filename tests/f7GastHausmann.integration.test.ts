import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** F7 (H13, H16, M10, M15, M18, M21, M24): Altlasten, Gaststatus, Hausmann vom Vortag, keine Doppelten, Opera-Hinweise, Concierge. */
const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-f7-"));
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
import { loadRoomRows } from "@/lib/lists/dayRows";
import { getHousemanList } from "@/lib/lists/housemanList";
import { ensureRecurringTasks } from "@/lib/houseman/recurring";
import { getGuestStatusFeed } from "@/lib/guestStatusFeed";
import { runGuestAction } from "@/lib/guestActions";
import { cleanAfterFromTraces } from "@/lib/lists/traceCleanAfter";
import { ensureEngineeringOrdersFromTraces } from "@/lib/engineering/operaTraces";
import { GUEST_SYSTEM_EMAIL } from "@/lib/guest";
import { POST as checkoutPost } from "@/app/api/rooms/[id]/checkout/route";
import { GET as notesGet } from "@/app/api/rooms/[id]/notes/route";
import { GET as tasksGet } from "@/app/api/roomtasks/route";
import { PATCH as taskPatch } from "@/app/api/roomtasks/[id]/route";
import { PATCH as exPatch, DELETE as exDelete } from "@/app/api/excursions/[id]/route";
import type { Role } from "@/lib/domain";

const ids: Record<string, string> = {};
const TODAY = berlinDate(new Date());
const YDAY = berlinDate(new Date(Date.now() - 86_400_000));
const yesterday = new Date(Date.now() - 86_400_000);
const sess = (key: string, role: Role) => ({ userId: ids[key], name: key, role }) as never;
const as = (key: string, role: Role) => { getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: ids[key], name: key, role }); };
const p = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (body: unknown, method = "POST") => new NextRequest("http://x", { method, body: JSON.stringify(body) });

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  for (const [k, role, email] of [["anna", "room_attendant"], ["sup", "supervisor"], ["dm", "duty_manager"], ["fo", "front_office"], ["hm", "houseman"], ["con", "concierge"], ["con2", "concierge"], ["guest", "guest", GUEST_SYSTEM_EMAIL]] as const) {
    ids[k] = (await prisma.user.create({ data: { email: email ?? `${k}@x.test`, name: `${k} Test`, passwordHash: "x", role } })).id;
  }
  const mk = (number: string, extra: Record<string, unknown> = {}) => prisma.room.create({ data: { number, floor: 5, section: "5A", type: "STANDARD", status: "DIRTY", ...extra } });
  ids.r1 = (await mk("501", { assignedToId: ids.anna, assignedOn: TODAY })).id;
  ids.r2 = (await mk("502")).id;
  ids.r3 = (await mk("503")).id;
  ids.r4 = (await mk("504", { assignedToId: ids.anna, assignedOn: TODAY })).id;
  // Vorgast in 502 reist heute ab; seine Notiz und sein Wunsch dürfen beim nächsten Gast nicht auftauchen
  ids.stayOld = (await prisma.stay.create({ data: { roomId: ids.r2, guestName: "Herr Alt", checkIn: new Date(Date.now() - 3 * 86_400_000), checkOut: new Date(), status: "IN_HOUSE", stayToken: "f7-old-0000000000000000000000000000" } })).id;
  await prisma.dayRoomPlan.create({ data: { date: TODAY, roomId: ids.r2, cleaningType: "DEPARTURE", stayId: ids.stayOld } });
  await prisma.dayRoomPlan.create({ data: { date: TODAY, roomId: ids.r1, cleaningType: "STAYOVER" } });
  await prisma.dayRoomPlan.create({ data: { date: TODAY, roomId: ids.r3, cleaningType: "STAYOVER" } });
  await prisma.dayRoomPlan.create({ data: { date: TODAY, roomId: ids.r4, cleaningType: "STAYOVER" } });
  await prisma.roomNote.create({ data: { roomId: ids.r2, authorId: ids.fo, body: "Zimmerwechsel freigegeben (Vorgast)" } });
  await prisma.guestRequest.create({ data: { roomId: ids.r2, kind: "CLEAN_REQUEST", detail: JSON.stringify({ timing: "NOW" }) } });
  // Gastwunsch von gestern in 501
  await prisma.guestRequest.create({ data: { roomId: ids.r1, kind: "CLEAN_REQUEST", detail: JSON.stringify({ timing: "LATER", time: "13:00" }), createdAt: yesterday } });
  // heutiger Wunsch in 504 — läuft mit dem Status mit
  ids.wish = (await prisma.guestRequest.create({ data: { roomId: ids.r4, kind: "CLEAN_REQUEST", detail: JSON.stringify({ timing: "NOW" }) } })).id;
}, 120_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Altlasten (H13)", () => {
  it("Gastwunsch von gestern setzt heute keine Priorität und keine Uhrzeit", async () => {
    const [row] = await loadRoomRows(TODAY, { roomIds: [ids.r1] }, null);
    expect(row.serviceNow).toBe(false);
    expect(row.cleanAfter).toBeNull();
  });

  it("nach dem Check-out: Notiz und Wunsch des Vorgasts sind archiviert — Listen leer, Supervisor sieht das Archiv", async () => {
    as("fo", "front_office");
    expect((await checkoutPost(new NextRequest("http://x", { method: "POST" }), p(ids.r2))).status).toBe(200);
    const [row] = await loadRoomRows(TODAY, { roomIds: [ids.r2] }, null);
    expect(row.hints).toEqual([]);
    expect(row.serviceNow).toBe(false);
    as("sup", "supervisor");
    expect((await (await notesGet(new NextRequest(`http://x/api/rooms/${ids.r2}/notes`), p(ids.r2))).json()).notes).toEqual([]);
    const archived = (await (await notesGet(new NextRequest(`http://x/api/rooms/${ids.r2}/notes?archived=1`), p(ids.r2))).json()).notes;
    expect(archived.map((n: { body: string }) => n.body)).toContain("Zimmerwechsel freigegeben (Vorgast)");
    as("fo", "front_office");
    expect((await (await notesGet(new NextRequest(`http://x/api/rooms/${ids.r2}/notes?archived=1`), p(ids.r2))).json()).notes).toEqual([]);
    const req = await prisma.guestRequest.findFirstOrThrow({ where: { roomId: ids.r2 } });
    expect(req.status).toBe("CANCELLED");
    expect(req.archivedAt).not.toBeNull();
  });

  it("Notizen, die nicht von heute sind, tragen ein Datum", async () => {
    await prisma.roomNote.create({ data: { roomId: ids.r3, authorId: ids.sup, body: "Fenster klemmt", createdAt: yesterday } });
    const [row] = await loadRoomRows(TODAY, { roomIds: [ids.r3] }, null);
    const [, m, d] = YDAY.split("-");
    expect(row.hints[0].body).toBe(`(${d}.${m}.) Fenster klemmt`);
  });
});

describe("Gaststatus (M10)", () => {
  it("Start → „In Bearbeitung“, fertig → „Erledigt“", async () => {
    expect((await applyStatusChange(sess("anna", "room_attendant"), ids.r4, { status: "IN_PROGRESS" })).ok).toBe(true);
    expect((await prisma.guestRequest.findUniqueOrThrow({ where: { id: ids.wish } })).status).toBe("IN_PROGRESS");
    expect((await applyStatusChange(sess("anna", "room_attendant"), ids.r4, { status: "CLEAN" })).ok).toBe(true);
    const feed = await getGuestStatusFeed(ids.r4);
    expect(feed.items.find((i) => i.id === ids.wish)?.status).toBe("DONE");
  });
});

describe("Gastbildschirm (M18, Aufgabe 7)", () => {
  it("6000 Zeichen werden abgelehnt (Grenze 2000 am Server)", async () => {
    const res = await runGuestAction("notes", { id: ids.r3, number: "503" }, json({ body: "x".repeat(6000) }));
    expect(res.status).toBe(400);
  });
  it("Green Option am selben Tag zurücknehmbar", async () => {
    expect((await runGuestAction("green", { id: ids.r3, number: "503" }, json({}))).status).toBe(201);
    expect((await runGuestAction("green-cancel", { id: ids.r3, number: "503" }, json({}))).status).toBe(200);
    const g = await prisma.guestRequest.findFirstOrThrow({ where: { roomId: ids.r3, kind: "GREEN" } });
    expect(g.status).toBe("CANCELLED");
  });
});

describe("Hausmann (H16, M15)", () => {
  it("offene Aufgabe vom Vortag erscheint oben mit „seit“; die des abgereisten Gasts fällt weg", async () => {
    await prisma.trace.create({ data: { roomId: ids.r3, code: "BB", date: YDAY, text: "Babybett", dept: "HOUSEMAN", dedupeKey: "a", source: "TRACES" } });
    await prisma.trace.create({ data: { roomId: ids.r2, stayId: ids.stayOld, code: "ZB", date: YDAY, text: "Zusatzbett", dept: "HOUSEMAN", dedupeKey: "b", source: "TRACES" } });
    await prisma.trace.create({ data: { roomId: ids.r1, code: "TW", date: TODAY, text: "Twinbett", dept: "HOUSEMAN", dedupeKey: "c", source: "TRACES" } });
    const list = await getHousemanList(null, null, null);
    expect(list.items.map((i) => i.text)).toEqual(["Babybett", "Twinbett"]);
    expect(list.items[0].since).toBe(YDAY);
  });

  it("wiederkehrende Aufgabe: ist die letzte noch offen, keine zweite — „überfällig seit“", async () => {
    const rt = await prisma.recurringTask.create({ data: { roomId: ids.r3, label: "Blumen gießen", everyDays: 1, startDate: YDAY, lastCreatedOn: YDAY, createdById: ids.sup } });
    await prisma.roomTask.create({ data: { roomId: ids.r3, type: "SONSTIGES", note: "Blumen gießen", createdById: ids.sup, createdAt: yesterday, recurringTaskId: rt.id } });
    await ensureRecurringTasks(TODAY);
    const open = await prisma.roomTask.findMany({ where: { note: "Blumen gießen", status: "OPEN" } });
    expect(open).toHaveLength(1);
    expect(open[0].overdueSince).toBe(YDAY);
  });

  it("Aufschieben (Hausmann) und Einmal-Aufgabe mit Datum", async () => {
    const t = await prisma.roomTask.create({ data: { roomId: ids.r1, type: "SONSTIGES", note: "Lampe", createdById: ids.sup } });
    await prisma.roomTask.create({ data: { roomId: ids.r1, type: "SONSTIGES", note: "Später", createdById: ids.sup, dueDate: "2099-01-01" } });
    as("hm", "houseman");
    const res = await taskPatch(json({ action: "DEFER", reason: "Teil fehlt" }, "PATCH"), p(t.id));
    expect(res.status).toBe(200);
    const list = (await (await tasksGet()).json()).roomTasks as { note: string; since: string | null }[];
    expect(list.find((x) => x.note === "Lampe")?.since).toBe(TODAY);
    expect(list.some((x) => x.note === "Später")).toBe(false);
  });
});

describe("Opera-Hinweise (M21)", () => {
  it("„cleaning after 13:00“ zählt wie „Reinigung ab 13 Uhr“", () => {
    expect(cleanAfterFromTraces([{ text: "Guest asks: cleaning after 13:00 please" }])).toBe("13:00");
    expect(cleanAfterFromTraces([{ text: "clean after 2pm" }])).toBe("14:00");
    expect(cleanAfterFromTraces([{ text: "Reinigung ab 11 Uhr" }])).toBe("11:00");
    expect(cleanAfterFromTraces([{ text: "Extra Kissen" }])).toBeNull();
  });
  it("Technik-Hinweis wird genau ein Auftrag beim Techniker", async () => {
    await prisma.trace.create({ data: { roomId: ids.r1, code: "ENG", date: TODAY, text: "Heizung tropft", dept: "ENGINEERING", dedupeKey: "e", source: "TRACES" } });
    expect(await ensureEngineeringOrdersFromTraces(TODAY)).toBe(1);
    expect(await ensureEngineeringOrdersFromTraces(TODAY)).toBe(0);
    const d = await prisma.defect.findFirstOrThrow({ where: { roomId: ids.r1 }, include: { workOrder: true } });
    expect(d.note).toBe("Opera-Hinweis: Heizung tropft");
    expect(d.workOrder?.status).toBe("OPEN");
  });
});

describe("Concierge (M24)", () => {
  it("eigenen Ausflug ändern und löschen; fremden nicht", async () => {
    const ex = await prisma.excursion.create({ data: { roomId: ids.r1, startsAt: new Date(), endsAt: new Date(Date.now() + 3_600_000), createdById: ids.con } });
    as("con2", "concierge");
    expect((await exPatch(json({ note: "x" }, "PATCH"), p(ex.id))).status).toBe(403);
    expect((await exDelete(new NextRequest("http://x", { method: "DELETE" }), p(ex.id))).status).toBe(403);
    as("con", "concierge");
    expect((await exPatch(json({ endsAt: new Date(Date.now() + 7_200_000).toISOString(), note: "Museum" }, "PATCH"), p(ex.id))).status).toBe(200);
    expect((await prisma.excursion.findUniqueOrThrow({ where: { id: ex.id } })).note).toBe("Museum");
    expect((await exDelete(new NextRequest("http://x", { method: "DELETE" }), p(ex.id))).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: { in: ["EXCURSION_UPDATED", "EXCURSION_DELETED"] } } })).toBe(2);
  });
});

describe("Nachbesserung nach Review", () => {
  it("Technik-Trace: nach der Nachtlöschung (leerer Text) kein neuer leerer Auftrag; Opera-Text wird nachts gelöscht", async () => {
    const { purgeOperaOrderNotes, OPERA_NOTE_PURGED } = await import("@/lib/engineering/operaTraces");
    await prisma.trace.updateMany({ where: { dept: "ENGINEERING" }, data: { text: "" } });
    expect(await ensureEngineeringOrdersFromTraces(TODAY)).toBe(0);
    expect(await purgeOperaOrderNotes()).toBe(1);
    expect((await prisma.defect.findFirstOrThrow({ where: { roomId: ids.r1 } })).note).toBe(OPERA_NOTE_PURGED);
    const reporter = await prisma.defect.findFirstOrThrow({ where: { roomId: ids.r1 }, include: { reportedBy: true } });
    expect(reporter.reportedBy.name).toBe("Opera-Import");
  });

  it("Hausmann-Übertrag: nach der Nachtlöschung (leerer Text) sichtbar mit Code statt leer, kein Doppel mit heute", async () => {
    await prisma.trace.updateMany({ where: { dept: "HOUSEMAN", date: YDAY }, data: { text: "" } });
    await prisma.trace.create({ data: { roomId: ids.r3, code: "BB", date: TODAY, text: "Babybett", dept: "HOUSEMAN", dedupeKey: "d", source: "TRACES" } });
    const list = await getHousemanList(null, null, null);
    expect(list.items.filter((i) => i.roomId === ids.r3)).toHaveLength(1);
    expect(list.items.every((i) => i.text.trim().length > 0)).toBe(true);
  });

  it("Turn: Notiz für den anreisenden Gast von heute bleibt beim Check-out stehen", async () => {
    const room = await prisma.room.create({ data: { number: "505", floor: 5, section: "5A", type: "STANDARD", status: "DIRTY" } });
    const old = await prisma.stay.create({ data: { roomId: room.id, guestName: "A", checkIn: new Date(Date.now() - 3 * 86_400_000), checkOut: new Date(), status: "IN_HOUSE", stayToken: "f7-turn-a-000000000000000000000000" } });
    const neu = await prisma.stay.create({ data: { roomId: room.id, guestName: "B", checkIn: new Date(), checkOut: new Date(Date.now() + 2 * 86_400_000), status: "EXPECTED", stayToken: "f7-turn-b-000000000000000000000000" } });
    await prisma.dayRoomPlan.create({ data: { date: TODAY, roomId: room.id, cleaningType: "SAME_DAY_TURN", stayId: old.id, arrivingStayId: neu.id } });
    await prisma.roomNote.create({ data: { roomId: room.id, authorId: ids.fo, body: "Vorgast: alt", createdAt: yesterday } });
    await prisma.roomNote.create({ data: { roomId: room.id, authorId: ids.fo, body: "Neuer Gast: VIP-Blumen" } });
    as("fo", "front_office");
    expect((await checkoutPost(new NextRequest("http://x", { method: "POST" }), p(room.id))).status).toBe(200);
    const [row] = await loadRoomRows(TODAY, { roomIds: [room.id] }, null);
    expect(row.hints.map((h) => h.body)).toEqual(["Neuer Gast: VIP-Blumen"]);
  });

  it("Grund beim Aufschieben wird nachts gelöscht", async () => {
    const { purgeGuestDataNow } = await import("@/lib/guestDataPurge");
    await purgeGuestDataNow();
    expect(await prisma.roomTask.count({ where: { deferReason: { not: null } } })).toBe(0);
    expect(JSON.stringify(await prisma.auditLog.findMany({ where: { action: "ROOM_TASK_DEFERRED" } }))).not.toMatch(/Teil fehlt/);
  });
});
