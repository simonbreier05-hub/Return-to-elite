import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** F8: Opera-Profil-Vorschlag nach Abreise — regelbasiert, einmal je Aufenthalt, nur Duty Manager, keine Gesundheitsdaten. */
const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-f8-"));
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
import { EXCLUDED_PROFILE_TYPES, isExcludedTrace, profileItemsFrom, purgeProfileSuggestions } from "@/lib/guest/profileSuggestion";
import { POST as checkoutPost, DELETE as checkoutDelete } from "@/app/api/rooms/[id]/checkout/route";
import { GET as listGet } from "@/app/api/profile-suggestions/route";
import { PATCH as itemPatch } from "@/app/api/profile-suggestions/[id]/route";
import type { Role } from "@/lib/domain";

const ids: Record<string, string> = {};
const TODAY = berlinDate(new Date());
const dayAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const as = (key: string, role: Role) => { getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: ids[key], name: key, role }); };
const p = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (method: string, body?: unknown) => new NextRequest("http://x", { method, ...(body ? { body: JSON.stringify(body) } : {}) });

async function departingStay(number: string, token: string) {
  const room = await prisma.room.create({ data: { number, floor: 6, section: "6A", type: "STANDARD", status: "DIRTY", occupancy: "OCCUPIED" } });
  const stay = await prisma.stay.create({ data: { roomId: room.id, guestName: "Herr Dr. Test", guestSalutation: "Herr", guestTitle: "Dr.", guestLastName: "Test 014", checkIn: dayAgo(4), checkOut: new Date(), status: "IN_HOUSE", stayToken: token } });
  await prisma.dayRoomPlan.create({ data: { date: TODAY, roomId: room.id, cleaningType: "DEPARTURE", stayId: stay.id } });
  return { room: room.id, stay: stay.id };
}

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  for (const [k, role] of [["dm", "duty_manager"], ["sup", "supervisor"], ["fo", "front_office"], ["hk", "room_attendant"]] as const) {
    ids[k] = (await prisma.user.create({ data: { email: `${k}@x.test`, name: `${k} Test`, passwordHash: "x", role } })).id;
  }
  // 601: Muster (2× „Reinigung ab 13:00“, 2× Green, Babybett) + Allergie-Trace + Freitext-Notiz
  const a = await departingStay("601", "f8-a-00000000000000000000000000000");
  Object.assign(ids, { roomA: a.room, stayA: a.stay });
  for (const d of [3, 2]) {
    await prisma.guestRequest.create({ data: { roomId: a.room, kind: "CLEAN_REQUEST", detail: JSON.stringify({ timing: "LATER", time: "13:00" }), createdAt: dayAgo(d) } });
    await prisma.guestRequest.create({ data: { roomId: a.room, kind: "GREEN", status: "DONE", createdAt: dayAgo(d) } });
  }
  await prisma.trace.create({ data: { roomId: a.room, stayId: a.stay, code: "BB", date: berlinDate(dayAgo(3)), text: "Babybett aufstellen", dept: "HOUSEMAN", dedupeKey: "a1", source: "TRACES" } });
  await prisma.trace.create({ data: { roomId: a.room, stayId: a.stay, code: "ALG", date: berlinDate(dayAgo(3)), text: "Allergie gegen Federn", dept: "HOUSEKEEPING", dedupeKey: "a2", source: "TRACES" } });
  await prisma.trace.create({ data: { roomId: a.room, stayId: a.stay, code: "ALG", date: berlinDate(dayAgo(2)), text: "Allergie gegen Federn", dept: "HOUSEKEEPING", dedupeKey: "a3", source: "TRACES" } });
  await prisma.roomNote.create({ data: { roomId: a.room, authorId: ids.fo, body: "Gast hat sich über Lärm beschwert" } });
  // 602: kein Muster (nur ein Wunsch)
  const b = await departingStay("602", "f8-b-00000000000000000000000000000");
  Object.assign(ids, { roomB: b.room, stayB: b.stay });
  await prisma.guestRequest.create({ data: { roomId: b.room, kind: "CLEAN_REQUEST", detail: JSON.stringify({ timing: "LATER", time: "11:00" }), createdAt: dayAgo(1) } });
}, 120_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Regeln (rein)", () => {
  it("Gesundheitsdaten und Beschwerden sind ausgeschlossen (Konstante)", () => {
    for (const x of ["ALLERG", "DIET", "MEDIC", "COMPLAINT", "BESCHWERDE"]) expect(EXCLUDED_PROFILE_TYPES).toContain(x);
    expect(isExcludedTrace({ code: "ALG", text: "Allergie gegen Federn" })).toBe(true);
    expect(isExcludedTrace({ code: "DIET", text: "glutenfrei" })).toBe(true);
    expect(isExcludedTrace({ code: "PIL", text: "Extra Kissen" })).toBe(false);
  });
  it("kein Punkt aus Opera-Codes oder Freitext — auch nicht nach der Nachtlöschung (leerer Text)", () => {
    const traces = [{ code: "ALG", text: "", date: "2026-11-01" }, { code: "ALG", text: "", date: "2026-11-02" }, { code: "PIL", text: "Extra Kissen bitte, Herr X", date: "2026-11-01" }, { code: "PIL", text: "Extra Kissen", date: "2026-11-02" }];
    expect(profileItemsFrom({ cleanWishes: [], green: [], traces })).toEqual([]);
    for (const x of ["HALAL", "SCHWANGER", "DIABET", "ACCESSIB"]) expect(EXCLUDED_PROFILE_TYPES).toContain(x);
  });
});

describe("Check-out erzeugt den Vorschlag", () => {
  it("2× gleicher Wunsch → genau ein Vorschlag; Allergie und Freitext erscheinen nie", async () => {
    as("fo", "front_office");
    expect((await checkoutPost(req("POST"), p(ids.roomA))).status).toBe(200);
    const all = await prisma.profileSuggestion.findMany();
    expect(all).toHaveLength(1);
    const items = JSON.parse(all[0].items) as { code: string; vars?: Record<string, string> }[];
    expect(items.map((i) => i.code).sort()).toEqual(["BABY_COT", "CLEAN_AFTER", "NO_DAILY_LINEN"]);
    expect(items.find((i) => i.code === "CLEAN_AFTER")?.vars?.time).toBe("13:00");
    expect(all[0].items).not.toMatch(/Allerg|ALG|Federn|Lärm|beschwert/i);
  });

  it("Aufenthalt ohne Muster erzeugt keinen Vorschlag", async () => {
    as("fo", "front_office");
    expect((await checkoutPost(req("POST"), p(ids.roomB))).status).toBe(200);
    expect(await prisma.profileSuggestion.count({ where: { stayId: ids.stayB } })).toBe(0);
  });

  it("Check-out zurücknehmen und erneut auschecken erzeugt keinen zweiten", async () => {
    as("fo", "front_office");
    expect((await checkoutDelete(req("DELETE"), p(ids.roomA))).status).toBe(200);
    expect((await checkoutPost(req("POST"), p(ids.roomA))).status).toBe(200);
    expect(await prisma.profileSuggestion.count({ where: { stayId: ids.stayA } })).toBe(1);
  });
});

describe("Rechte und Erledigen", () => {
  it("Supervisor, Front Office, Housekeeper bekommen 403; DM sieht „Herr Dr. Test 014“", async () => {
    const s = await prisma.profileSuggestion.findFirstOrThrow();
    for (const [k, role] of [["sup", "supervisor"], ["fo", "front_office"], ["hk", "room_attendant"]] as const) {
      as(k, role);
      expect((await listGet()).status, role).toBe(403);
      expect((await itemPatch(req("PATCH", { all: true }), p(s.id))).status, role).toBe(403);
    }
    as("dm", "duty_manager");
    const body = await (await listGet()).json();
    expect(body.suggestions[0].guest).toBe("Herr Dr. Test 014");
  });

  it("alle Punkte erledigt → Vorschlag gelöscht; Logbuch ohne Gastnamen", async () => {
    const s = await prisma.profileSuggestion.findFirstOrThrow();
    as("dm", "duty_manager");
    expect((await (await itemPatch(req("PATCH", { index: 0, status: "DISCARDED" }), p(s.id))).json()).deleted).toBeUndefined();
    expect((await (await itemPatch(req("PATCH", { all: true }), p(s.id))).json()).deleted).toBe(true);
    expect(await prisma.profileSuggestion.count()).toBe(0);
    const logs = await prisma.auditLog.findMany({ where: { action: { startsWith: "PROFILE_SUGGESTION" } } });
    expect(logs.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toMatch(/Test 014|Herr Dr/);
  });

  it("Vorschlag älter als 30 Tage wird von der Nachtlöschung entfernt", async () => {
    await prisma.profileSuggestion.create({ data: { stayId: "alt", roomNumber: "699", departure: dayAgo(31), items: "[]", createdAt: dayAgo(31) } });
    await prisma.profileSuggestion.create({ data: { stayId: "neu", roomNumber: "698", departure: dayAgo(1), items: "[]" } });
    expect(await purgeProfileSuggestions()).toBe(1);
    expect((await prisma.profileSuggestion.findMany()).map((x) => x.stayId)).toEqual(["neu"]);
  });
});

describe("Nachbesserung nach Review", () => {
  it("Turn: Babybett des Neuankömmlings wird nicht dem abreisenden Gast zugeschrieben", async () => {
    const t = await departingStay("603", "f8-c-00000000000000000000000000000");
    const neu = await prisma.stay.create({ data: { roomId: t.room, guestName: "Neu", checkIn: new Date(), checkOut: dayAgo(-2), status: "EXPECTED", stayToken: "f8-d-00000000000000000000000000000" } });
    await prisma.trace.create({ data: { roomId: t.room, stayId: neu.id, code: "BB", date: TODAY, text: "Baby cot", dept: "HOUSEMAN", dedupeKey: "c1", source: "TRACES" } });
    for (const d of [3, 2]) await prisma.guestRequest.create({ data: { roomId: t.room, kind: "GREEN", status: "DONE", createdAt: dayAgo(d) } });
    as("fo", "front_office");
    expect((await checkoutPost(req("POST"), p(t.room))).status).toBe(200);
    const s = await prisma.profileSuggestion.findUniqueOrThrow({ where: { stayId: t.stay } });
    expect((JSON.parse(s.items) as { code: string }[]).map((i) => i.code)).toEqual(["NO_DAILY_LINEN"]);
    ids.stayC = t.stay; ids.roomC = t.room;
  });

  it("alle erledigt → Check-out zurücknehmen → erneut auschecken: kein zweiter Vorschlag", async () => {
    const s = await prisma.profileSuggestion.findUniqueOrThrow({ where: { stayId: ids.stayC } });
    as("dm", "duty_manager");
    expect((await (await itemPatch(req("PATCH", { all: true }), p(s.id))).json()).deleted).toBe(true);
    as("fo", "front_office");
    expect((await checkoutDelete(req("DELETE"), p(ids.roomC))).status).toBe(200);
    expect((await checkoutPost(req("POST"), p(ids.roomC))).status).toBe(200);
    expect(await prisma.profileSuggestion.count({ where: { stayId: ids.stayC } })).toBe(0);
    as("dm", "duty_manager");
    expect((await itemPatch(req("PATCH", { all: true }), p(s.id))).status).toBe(404);
  });

  it("Nachtlöschung leert Namen im Vorschlag jede Nacht", async () => {
    await prisma.profileSuggestion.create({ data: { stayId: "namen", roomNumber: "697", guestSalutation: "Frau", guestLastName: "Probst", departure: new Date(), items: "[]" } });
    await purgeProfileSuggestions();
    const s = await prisma.profileSuggestion.findUniqueOrThrow({ where: { stayId: "namen" } });
    expect([s.guestSalutation, s.guestTitle, s.guestLastName]).toEqual([null, null, null]);
  });
});
