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

import { DELETE as checkoutDelete } from "@/app/api/rooms/[id]/checkout/route";
import { PATCH as guestRequestPatch } from "@/app/api/guest-requests/[id]/route";

describe("Teil 2 — Check-out zurücknehmen, DND aufheben (H7, M22)", () => {
  it("Rücknahme stellt den Stand wieder her: Aufenthalt im Haus, Zimmer belegt, Logbuch, Korrekturmeldung", async () => {
    const dep = await stay(room["202"], "Rücknahmetest", -2, 0, "IN_HOUSE");
    await prisma.dayRoomPlan.create({ data: { date: TODAY, roomId: room["202"], cleaningType: "DEPARTURE", stayId: dep.id } });
    await prisma.room.update({ where: { id: room["202"] }, data: { occupancy: "OCCUPIED", assignedToId: ids.anna, assignedOn: TODAY } });
    as("fo", "front_office");
    expect((await checkoutPost(req(), ctx(room["202"]))).status).toBe(200);
    expect((await prisma.stay.findUniqueOrThrow({ where: { id: dep.id } })).status).toBe("CHECKED_OUT");
    for (const [k, role] of [["anna", "room_attendant"], ["con", "concierge"], ["hm", "houseman"], ["eng", "engineering"]] as const) {
      as(k, role);
      expect((await checkoutDelete(req(undefined, "DELETE"), ctx(room["202"]))).status).toBe(403);
    }
    as("sup", "supervisor");
    expect((await checkoutDelete(req(undefined, "DELETE"), ctx(room["202"]))).status).toBe(200);
    expect((await prisma.stay.findUniqueOrThrow({ where: { id: dep.id } })).status).toBe("IN_HOUSE");
    expect((await prisma.room.findUniqueOrThrow({ where: { id: room["202"] } })).occupancy).toBe("OCCUPIED");
    expect(await prisma.auditLog.count({ where: { action: "GUEST_CHECKOUT_REVERTED", roomId: room["202"] } })).toBe(1);
    expect(await prisma.notification.count({ where: { type: "GUEST_CHECKOUT_REVERTED", roomId: room["202"], targetUserId: ids.anna } })).toBe(1);
  });

  it("Rücknahme geht nicht, wenn der neue Gast eines Turns schon eingecheckt ist", async () => {
    await prisma.stay.updateMany({ where: { roomId: room["201"], guestLastName: "Anreisetest" }, data: { status: "IN_HOUSE" } });
    as("dm", "duty_manager");
    const res = await checkoutDelete(req(undefined, "DELETE"), ctx(room["201"]));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("NEW_GUEST_CHECKED_IN");
  });

  it("Front Office hebt ein Gast-DND auf (Logbuch, Housekeeperin gemeldet), darf aber sonst keine Gastwünsche ändern", async () => {
    const dnd = await prisma.guestRequest.create({ data: { roomId: room["202"], kind: "DND", detail: "{}" } });
    const wish = await prisma.guestRequest.create({ data: { roomId: room["202"], kind: "CLEAN_REQUEST", detail: "{}" } });
    as("fo", "front_office");
    expect((await guestRequestPatch(req({ status: "DONE" }, "PATCH"), ctx(wish.id))).status).toBe(403);
    expect((await guestRequestPatch(req({ status: "DONE" }, "PATCH"), ctx(dnd.id))).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: "GUEST_DND_LIFTED", roomId: room["202"] } })).toBe(1);
    as("anna", "room_attendant");
    expect((await guestRequestPatch(req({ status: "DONE" }, "PATCH"), ctx(dnd.id))).status).toBe(403);
  });
});

import { POST as earlyPost } from "@/app/api/rooms/[id]/early-departure/route";
import { POST as roomChangePost } from "@/app/api/rooms/[id]/room-change/route";
import { GET as departuresGet } from "@/app/api/front-office/departures/route";
import { resolveGuestAccessByRoomCode } from "@/lib/guestServer";
import { loadRoomRows } from "@/lib/lists/dayRows";

describe("Teil 3 — Vorzeitige Abreise (H8)", () => {
  it("Bleiber reist heute ab: Art Abreise (Handeingabe), Meldung an die Housekeeperin; andere Rollen 403", async () => {
    const s = await stay(room["203"], "Frühabreisetest", -1, 3, "IN_HOUSE");
    await prisma.dayRoomPlan.create({ data: { date: TODAY, roomId: room["203"], cleaningType: "STAYOVER", stayId: s.id } });
    await prisma.room.update({ where: { id: room["203"] }, data: { occupancy: "OCCUPIED", assignedToId: ids.anna, assignedOn: TODAY } });
    as("anna", "room_attendant");
    expect((await earlyPost(req(), ctx(room["203"]))).status).toBe(403);
    as("fo", "front_office");
    expect((await earlyPost(req(), ctx(room["203"]))).status).toBe(200);
    expect(await prisma.dayRoomPlan.findUniqueOrThrow({ where: { date_roomId: { date: TODAY, roomId: room["203"] } } })).toMatchObject({ cleaningType: "DEPARTURE", typeOverridden: true, derivedType: "STAYOVER" });
    expect(await prisma.notification.count({ where: { type: "LIST_UPDATED", targetUserId: ids.anna } })).toBe(1);
    // danach normaler Check-out
    expect((await checkoutPost(req(), ctx(room["203"]))).status).toBe(200);
    expect((await prisma.stay.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("CHECKED_OUT");
  });
});

describe("Teil 4 — Zimmerwechsel (H9, B5 neu)", () => {
  it("FO wechselt 204 → 205: Aufenthalt wandert, alter Code neutral, neuer grüßt; Kennzeichen, Wünsche, Meldungen", async () => {
    const s = await stay(room["204"], "Wechseltest", -1, 2, "IN_HOUSE");
    await prisma.dayRoomPlan.create({ data: { date: TODAY, roomId: room["204"], cleaningType: "STAYOVER", stayId: s.id } });
    await prisma.room.update({ where: { id: room["204"] }, data: { occupancy: "OCCUPIED", status: "INSPECTED", guestAccessCode: "code204", assignedToId: ids.anna, assignedOn: TODAY } });
    await prisma.room.update({ where: { id: room["205"] }, data: { occupancy: "VACANT", status: "INSPECTED", guestAccessCode: "code205" } });
    await prisma.room.update({ where: { id: room["206"] }, data: { occupancy: "VACANT", status: "DIRTY" } }); // nicht geprüft → kein Ziel
    const wish = await prisma.guestRequest.create({ data: { roomId: room["204"], kind: "CLEAN_REQUEST", detail: "{}" } });
    const note = await prisma.roomNote.create({ data: { roomId: room["204"], authorId: ids.sup, body: "Fenster klemmt" } });
    expect((await resolveGuestAccessByRoomCode("code204"))?.stay.id).toBe(s.id);

    for (const [k, role] of [["anna", "room_attendant"], ["con", "concierge"], ["hm", "houseman"], ["eng", "engineering"]] as const) {
      as(k, role);
      expect((await roomChangePost(req({ toRoomId: room["205"], reason: "Lärm" }), ctx(room["204"]))).status).toBe(403);
    }
    as("fo", "front_office");
    expect((await roomChangePost(req({ toRoomId: room["206"], reason: "Lärm" }), ctx(room["204"]))).status).toBe(409); // Ziel nicht geprüft
    expect((await roomChangePost(req({ toRoomId: room["205"], reason: "Lärm" }), ctx(room["204"]))).status).toBe(200);

    expect((await prisma.stay.findUniqueOrThrow({ where: { id: s.id } })).roomId).toBe(room["205"]);
    expect(await resolveGuestAccessByRoomCode("code204")).toBeNull(); // altes Zimmer sofort neutral
    expect((await resolveGuestAccessByRoomCode("code205"))?.stay.id).toBe(s.id); // neues grüßt den Gast
    expect(await prisma.room.findUniqueOrThrow({ where: { id: room["204"] } })).toMatchObject({ status: "DIRTY", occupancy: "VACANT" });
    expect(await prisma.room.findUniqueOrThrow({ where: { id: room["205"] } })).toMatchObject({ occupancy: "OCCUPIED" });
    expect((await prisma.guestRequest.findUniqueOrThrow({ where: { id: wish.id } })).roomId).toBe(room["205"]); // Wunsch wandert mit
    expect((await prisma.roomNote.findUniqueOrThrow({ where: { id: note.id } })).roomId).toBe(room["204"]); // Notiz bleibt

    const rows = await loadRoomRows(TODAY, { roomIds: [room["204"], room["205"]] }, null);
    expect(rows.find((r) => r.id === room["204"])).toMatchObject({ kind: "DEPARTURE", roomChangeTo: "205" });
    expect(rows.find((r) => r.id === room["205"])).toMatchObject({ kind: "STAYOVER", roomChangeFrom: "204" });
    const ns = await prisma.notification.findMany({ where: { type: "ROOM_CHANGE" } });
    expect(new Set(ns.map((n) => n.targetRole))).toEqual(new Set(["supervisor", "duty_manager", "front_office", "room_attendant"]));
    expect(ns.every((n) => !n.message.includes("Wechseltest"))).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "ROOM_CHANGE" } })).toBe(1);
    // altes Zimmer ist kein Check-out in der FO-Liste
    const deps = await (await departuresGet()).json();
    expect(deps.departures?.some?.((d: { roomId: string }) => d.roomId === room["204"]) ?? false).toBe(false);

    // Kennzeichen bleibt bis zur Freigabe
    await prisma.room.update({ where: { id: room["204"] }, data: { status: "INSPECTED" } });
    expect((await loadRoomRows(TODAY, { roomIds: [room["204"]] }, null))[0].roomChangeTo).toBeNull();
  });

  it("Supervisor und DM dürfen ebenfalls wechseln; Nachimport macht den Wechsel nicht rückgängig (Handeingabe)", async () => {
    await prisma.room.update({ where: { id: room["206"] }, data: { status: "INSPECTED" } });
    as("sup", "supervisor");
    expect((await roomChangePost(req({ toRoomId: room["206"], reason: "Klima defekt" }), ctx(room["205"]))).status).toBe(200);
    const p = await prisma.dayRoomPlan.findUniqueOrThrow({ where: { date_roomId: { date: TODAY, roomId: room["205"] } } });
    expect(p).toMatchObject({ cleaningType: "DEPARTURE", typeOverridden: true, roomChangeTo: "206" });
  });
});

import { GET as targetsGet } from "@/app/api/rooms/room-change-targets/route";
import { GET as foDndGet } from "@/app/api/front-office/dnd/route";

describe("Nachbesserung (Review)", () => {
  it("Zimmerwechsel aus einem gesperrten Zimmer: Sperre bleibt (nur Supervisor/DM heben sie auf)", async () => {
    const a = (await prisma.room.create({ data: { number: "207", floor: 2, section: "2A", type: "STANDARD", status: "OUT_OF_ORDER", oooReason: "Wasserschaden", occupancy: "OCCUPIED" } })).id;
    const b = (await prisma.room.create({ data: { number: "208", floor: 2, section: "2A", type: "STANDARD", status: "INSPECTED", occupancy: "VACANT" } })).id;
    await stay(a, "Sperrtest", -1, 2, "IN_HOUSE");
    as("fo", "front_office");
    expect((await roomChangePost(req({ toRoomId: b, reason: "Wasserschaden" }), ctx(a))).status).toBe(200);
    expect(await prisma.room.findUniqueOrThrow({ where: { id: a } })).toMatchObject({ status: "OUT_OF_ORDER", oooReason: "Wasserschaden", occupancy: "VACANT" });
  });

  it("alle neuen Wege: Housekeeper, Concierge, Hausmann und Technik bekommen 403", async () => {
    const dnd = await prisma.guestRequest.create({ data: { roomId: room["206"], kind: "DND", detail: "{}" } });
    for (const [k, role] of [["anna", "room_attendant"], ["con", "concierge"], ["hm", "houseman"], ["eng", "engineering"]] as const) {
      as(k, role);
      expect((await earlyPost(req(), ctx(room["206"]))).status).toBe(403);
      expect((await guestRequestPatch(req({ status: "DONE" }, "PATCH"), ctx(dnd.id))).status).toBe(403);
      expect((await targetsGet()).status).toBe(403);
      expect((await foDndGet()).status).toBe(403);
      expect((await roomChangePost(req({ toRoomId: room["205"], reason: "x" }), ctx(room["206"]))).status).toBe(403);
      expect((await checkoutDelete(req(undefined, "DELETE"), ctx(room["206"]))).status).toBe(403);
    }
  });
});
