import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-del-"));
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
import { IMPORT_TYPES, type ImportType } from "@/lib/domain";
import { traceKey } from "@/lib/dayplan/traceKey";
import { applyBatch, missingAppliedLists } from "@/lib/import/store";
import { planStatus } from "@/lib/import/deleteList";
import { DELETE as deleteList } from "@/app/api/import/lists/[type]/route";
import { GET as statusGet } from "@/app/api/import/status/route";

// Erfundene Testdaten, kein echter Gast.
const D = "2026-09-22";
const ids: Record<string, string> = {};
const as = (key: string | null, role = "supervisor") => { getSessionMock.mockReset(); getSessionMock.mockResolvedValue(key ? { userId: ids[key], name: key, role } : null); };
const del = (type: string, q = "") => deleteList(new NextRequest(`http://x/api/import/lists/${type}?date=${D}${q}`, { method: "DELETE" }), { params: Promise.resolve({ type }) });
const status = async () => (await statusGet(new NextRequest(`http://x/api/import/status?date=${D}`))).json();

const ROWS: Record<string, unknown[]> = {
  DEPARTURES: [{ room: "201", arrDate: "2026-09-20" }, { room: "202", arrDate: D }],
  ARRIVALS: [
    { room: "202", arrDate: D, traces: [{ code: "XBED", date: D, text: "Zusatzbett bitte" }] },
    { room: "203", arrDate: D, traces: [{ code: "FLWR", date: D, text: "Blumen aufs Zimmer" }, { code: "TWIN", date: D, text: "Twin aufbauen" }] },
  ],
  TRACES: [{ room: "202", code: "XBED", date: D, text: "Zusatzbett bitte" }],
  INHOUSE: [{ room: "201", arrDate: "2026-09-20" }],
};
/** Übernommene Liste wie nach storeBatch + applyBatch (nur die Felder, die Löschen braucht). */
async function applied(type: ImportType, date = D) {
  const rows = ROWS[type] ?? [];
  const b = await prisma.importBatch.create({ data: {
    type, status: "APPLIED", businessDate: date, fileHash: `h-${type}-${Math.random()}`, appliedAt: new Date(), uploadedById: ids.sup, rowCount: rows.length,
    rows: { create: rows.map((r) => ({ kind: type, room: (r as { room: string }).room, payload: JSON.stringify(r) })) },
  } });
  if (type === "FORECAST") await prisma.forecastDay.create({ data: { date, occupiedRooms: 1, arrivals: 1, departures: 1, occupancyPct: 1, outOfOrder: 0, dayUse: 0, noShow: 0, persons: 1, batchId: b.id } });
  return b;
}
const stay = (roomId: string, arr: string, name: string) => prisma.stay.create({ data: { roomId, guestName: name, source: "IMPORT", checkIn: new Date(`${arr}T00:00:00Z`), checkOut: new Date("2026-09-25T10:00:00Z"), stayToken: `t-${roomId}-${arr}` } });
const trace = (roomId: string, room: string, code: string, text: string, source: string, extra: object = {}) =>
  prisma.trace.create({ data: { roomId, code, date: D, text, dept: "HOUSEKEEPING", dedupeKey: traceKey(room, code, D, text), source, ...extra } });

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  for (const [k, role] of [["sup", "supervisor"], ["dm", "duty_manager"], ["hk", "room_attendant"], ["fo", "front_office"]] as const) {
    ids[k] = (await prisma.user.create({ data: { email: `${k}@x.test`, name: `${k} Test`, passwordHash: "x", role } })).id;
  }
  for (const n of ["201", "202", "203"]) ids[n] = (await prisma.room.create({ data: { number: n, floor: 2, section: "2A", type: "STANDARD" } })).id;
}, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Liste löschen: Gate", () => {
  it("nach dem Löschen fehlt die Liste wieder im Gate; ein neuer Import ersetzt sie", async () => {
    as("sup");
    for (const ty of IMPORT_TYPES) await applied(ty);
    expect(await missingAppliedLists(D)).toEqual([]);
    expect(Object.values((await status()).status).every(Boolean)).toBe(true);

    const res = await del("TRACES");
    expect(res.status).toBe(200);
    expect(await missingAppliedLists(D)).toEqual(["TRACES"]);
    expect((await status()).status.TRACES).toBeNull();
    expect(broadcastMock).toHaveBeenCalledWith("import:deleted", { type: "TRACES", businessDate: D });

    // Erneut löschen: nichts mehr da
    expect((await del("TRACES")).status).toBe(404);

    // Neuer Import (Vorschau → Übernehmen) ersetzt; ein zweiter Nachimport wird als Ersetzen protokolliert
    const mk = () => prisma.importBatch.create({ data: { type: "TRACES", businessDate: D, fileHash: `n${Math.random()}`, uploadedById: ids.sup, rowCount: 1,
      rows: { create: ROWS.TRACES.map((r) => ({ kind: "TRACE", room: "202", payload: JSON.stringify(r) })) } } });
    await applyBatch((await mk()).id, ids.sup);
    expect(await missingAppliedLists(D)).toEqual([]);
    await applyBatch((await mk()).id, ids.sup);
    expect(await prisma.importBatch.count({ where: { type: "TRACES", businessDate: D, status: "APPLIED" } })).toBe(1);
    const rep = await prisma.auditLog.findFirst({ where: { action: "IMPORT_REPLACED" } });
    expect(JSON.parse(rep!.meta!)).toMatchObject({ type: "TRACES", businessDate: D, replaced: 1 });
  });

  it("Listen eines anderen Betriebstags zählen nicht", async () => {
    expect(await missingAppliedLists("2026-09-23")).toEqual([...IMPORT_TYPES]);
  });

  it("Logbuch: Liste, Betriebstag, Nutzer — ohne Gastdaten", async () => {
    const log = await prisma.auditLog.findFirst({ where: { action: "IMPORT_LIST_DELETED" } });
    expect(log?.userId).toBe(ids.sup);
    expect(JSON.parse(log!.meta!)).toMatchObject({ type: "TRACES", businessDate: D });
    expect(log!.meta).not.toMatch(/Zusatzbett|guestName|"name"|"text"/);
  });
});

describe("Liste löschen: Rollen", () => {
  it("Housekeeper und Front Office dürfen weder löschen noch den Stand lesen; ohne Anmeldung 401", async () => {
    for (const k of ["hk", "fo"]) {
      as(k, k === "hk" ? "room_attendant" : "front_office");
      expect((await del("INHOUSE")).status).toBe(403);
      expect((await statusGet(new NextRequest(`http://x/api/import/status?date=${D}`))).status).toBe(403);
    }
    as(null);
    expect((await del("INHOUSE")).status).toBe(401);
    expect(await missingAppliedLists(D)).toEqual([]); // nichts gelöscht
  });

  it("Duty Manager darf löschen; unbekannte Liste → 400", async () => {
    as("dm", "duty_manager");
    expect((await del("NOPE")).status).toBe(400);
    expect((await del("INHOUSE")).status).toBe(200);
    expect(await missingAppliedLists(D)).toEqual(["INHOUSE"]);
    await applied("INHOUSE");
  });
});

describe("Liste löschen: Gastdaten und Traces", () => {
  it("entfernt nur, was allein aus dieser Liste stammt", async () => {
    as("sup");
    const s202 = await stay(ids["202"], D, "Herr Testmann"); // auch in Departures → bleibt
    const s203 = await stay(ids["203"], D, "Frau Probe"); // nur Arrivals → weg
    await prisma.dayRoomPlan.create({ data: { date: D, roomId: ids["203"], cleaningType: "ARRIVAL", arrivingStayId: s203.id } });
    await prisma.arrival.create({ data: { roomId: ids["203"], guestName: "Frau Probe", source: "IMPORT", status: "EXPECTED", createdById: ids.sup } });
    await prisma.arrival.create({ data: { roomId: ids["203"], guestName: "Manuell", source: "MANUAL", status: "EXPECTED", createdById: ids.sup } });
    const tShared = await trace(ids["202"], "202", "XBED", "Zusatzbett bitte", "ARRIVALS"); // auch in Traces → bleibt
    const tOnly = await trace(ids["203"], "203", "FLWR", "Blumen aufs Zimmer", "ARRIVALS"); // nur Arrivals → weg
    const task = await prisma.roomTask.create({ data: { roomId: ids["203"], type: "TWIN_SETUP", createdById: ids.sup } });
    const tTask = await trace(ids["203"], "203", "TWIN", "Twin aufbauen", "ARRIVALS", { roomTaskId: task.id }); // Hausmann-Aufgabe → bleibt

    const body = await (await del("ARRIVALS")).json();
    expect(body.removed).toMatchObject({ stays: 1, traces: 1, arrivals: 1 });
    expect(await prisma.stay.findUnique({ where: { id: s202.id } })).not.toBeNull();
    expect(await prisma.stay.findUnique({ where: { id: s203.id } })).toBeNull();
    expect((await prisma.dayRoomPlan.findFirst({ where: { roomId: ids["203"] } }))?.arrivingStayId).toBeNull();
    expect(await prisma.arrival.count({ where: { roomId: ids["203"] } })).toBe(1); // nur die manuelle bleibt
    expect(await prisma.trace.findUnique({ where: { id: tShared.id } })).not.toBeNull();
    expect(await prisma.trace.findUnique({ where: { id: tOnly.id } })).toBeNull();
    expect(await prisma.trace.findUnique({ where: { id: tTask.id } })).not.toBeNull();
    await applied("ARRIVALS");
  });

  it("Forecast löschen entfernt seine Forecast-Tage", async () => {
    expect(await prisma.forecastDay.count({ where: { date: D } })).toBe(1);
    expect((await del("FORECAST")).status).toBe(200);
    expect(await prisma.forecastDay.count({ where: { date: D } })).toBe(0);
    await applied("FORECAST");
  });
});

describe("Liste löschen bei bestätigtem Plan", () => {
  it("fragt nach (409), löscht mit keepPlan; Plan bleibt, Hinweis „Listen geändert“", async () => {
    as("sup");
    await new Promise((r) => setTimeout(r, 10));
    const p = await prisma.autoPlanProposal.create({ data: { date: D, status: "CONFIRMED", createdById: ids.sup, payload: "{}", confirmedAt: new Date(Date.now() + 5) } });
    expect(await planStatus(D)).toEqual({ confirmed: true, listsChanged: false });

    const first = await del("INHOUSE");
    expect(first.status).toBe(409);
    expect((await first.json()).planConfirmed).toBe(true);
    expect(await missingAppliedLists(D)).toEqual([]);

    expect((await del("INHOUSE", "&keepPlan=1")).status).toBe(200);
    expect((await prisma.autoPlanProposal.findUnique({ where: { id: p.id } }))?.status).toBe("CONFIRMED");
    expect(await planStatus(D)).toEqual({ confirmed: true, listsChanged: true });
    expect((await status()).plan).toEqual({ confirmed: true, listsChanged: true });
  });
});
