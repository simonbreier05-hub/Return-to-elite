import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** F7-Nachtrag: Abreise nur über Opera (ohne Check-out-Knopf) — der Import des Folgetags schließt den Aufenthalt ab. */
const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-f7n-"));
  return { dir: d, url: `file:${p.join(d, "test.db")}` };
});
vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient({ datasources: { db: { url } } }) };
});
vi.mock("@/lib/realtime", () => ({ broadcast: vi.fn() }));

import { prisma } from "@/lib/db";
import { closeDepartedImportStays } from "@/lib/guest/stayArchive";
import { importHistory } from "@/lib/import/history";
import { berlinDate } from "@/lib/dayplan/time";

const day = (iso: string, h = "10:00") => new Date(`${iso}T${h}:00Z`);
let roomId = "", userId = "";

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  userId = (await prisma.user.create({ data: { email: "fo@x.test", name: "fo", passwordHash: "x", role: "front_office" } })).id;
  roomId = (await prisma.room.create({ data: { number: "701", floor: 7, section: "7A", type: "STANDARD", status: "DIRTY", occupancy: "OCCUPIED" } })).id;
}, 60_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Abreise nur über Opera", () => {
  it("Aufenthalt mit Abreise gestern wird abgeschlossen: Status, Archiv, Profilvorschlag, Logbuch — Folgegast unberührt", async () => {
    const old = await prisma.stay.create({ data: { roomId, guestName: "Frau Test", checkIn: day("2026-11-14", "00:00"), checkOut: day("2026-11-18"), status: "IN_HOUSE", stayToken: "f7n-old-000000000000000000000000000", source: "IMPORT" } });
    const next = await prisma.stay.create({ data: { roomId, guestName: "Herr Neu", checkIn: day("2026-11-18", "00:00"), checkOut: day("2026-11-21"), status: "IN_HOUSE", stayToken: "f7n-new-000000000000000000000000000", source: "IMPORT" } });
    for (const d of ["2026-11-15", "2026-11-16"]) {
      await prisma.guestRequest.create({ data: { roomId, stayId: old.id, kind: "CLEAN_REQUEST", status: "DONE", detail: JSON.stringify({ timing: "LATER", time: "13:00" }), createdAt: day(d, "08:00") } });
    }
    const oldNote = await prisma.roomNote.create({ data: { roomId, authorId: userId, body: "alter Gast", createdAt: day("2026-11-16", "09:00") } });
    const newNote = await prisma.roomNote.create({ data: { roomId, authorId: userId, body: "neuer Gast", createdAt: day("2026-11-18", "15:00") } });

    expect(await closeDepartedImportStays("2026-11-19")).toBe(1);
    expect((await prisma.stay.findUniqueOrThrow({ where: { id: old.id } })).status).toBe("CHECKED_OUT");
    expect((await prisma.stay.findUniqueOrThrow({ where: { id: next.id } })).status).toBe("IN_HOUSE");
    expect((await prisma.roomNote.findUniqueOrThrow({ where: { id: oldNote.id } })).archivedAt).not.toBeNull();
    expect((await prisma.roomNote.findUniqueOrThrow({ where: { id: newNote.id } })).archivedAt).toBeNull();
    const s = await prisma.profileSuggestion.findUnique({ where: { stayId: old.id } });
    expect(s?.items).toContain("CLEAN_AFTER");
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "GUEST_DEPARTED_IMPORT" } });
    expect(log.meta).toContain(old.id);
    expect(log.meta).not.toContain("Test");
  });

  it("Review (H1): ein Aufenthalt, der heute noch in den Listen steht (keep), bleibt im Haus — auch mit altem Abreisedatum", async () => {
    const kept = await prisma.stay.create({ data: { roomId, guestName: "Verlängert", checkIn: day("2026-11-10", "00:00"), checkOut: day("2026-11-17"), status: "IN_HOUSE", stayToken: "f7n-keep-0000000000000000000000000", source: "IMPORT" } });
    expect(await closeDepartedImportStays("2026-11-19", new Date(), { keep: [["701", "2026-11-10"]] })).toBe(0);
    expect((await prisma.stay.findUniqueOrThrow({ where: { id: kept.id } })).status).toBe("IN_HOUSE");
    await prisma.stay.update({ where: { id: kept.id }, data: { status: "CANCELLED" } });
  });

  it("zweiter Lauf ändert nichts; verlängerter oder heutiger Aufenthalt bleibt im Haus", async () => {
    expect(await closeDepartedImportStays("2026-11-19")).toBe(0);
    const today = await prisma.stay.create({ data: { roomId, guestName: "Heute", checkIn: day("2026-11-17", "00:00"), checkOut: day("2026-11-19"), status: "IN_HOUSE", stayToken: "f7n-today-00000000000000000000000000", source: "IMPORT" } });
    expect(await closeDepartedImportStays("2026-11-19")).toBe(0);
    expect((await prisma.stay.findUniqueOrThrow({ where: { id: today.id } })).status).toBe("IN_HOUSE");
  });
});

describe("F4-Nachtrag (M8): Importverlauf des Tages", () => {
  it("übernommene und gelöschte Listen von heute, neueste zuerst, mit Person — ohne Gastdaten", async () => {
    const now = Date.now();
    // Review (M4): aus dem Logbuch — dieselbe Liste zweimal übernommen erscheint zweimal
    const today = berlinDate(new Date(now));
    const at = (msAgo: number) => new Date(Math.max(now - msAgo, new Date(`${today}T00:00:00Z`).getTime() + 1000 * (10 - msAgo / 60_000)));
    await prisma.auditLog.create({ data: { action: "IMPORT_APPLIED", userId, createdAt: at(3 * 60_000), meta: JSON.stringify({ type: "ARRIVALS", businessDate: today, rows: 10 }) } });
    await prisma.auditLog.create({ data: { action: "IMPORT_APPLIED", userId, createdAt: at(2 * 60_000), meta: JSON.stringify({ type: "ARRIVALS", businessDate: today, rows: 12 }) } });
    await prisma.auditLog.create({ data: { action: "IMPORT_APPLIED", userId, createdAt: new Date("2026-01-01T08:00:00Z"), meta: JSON.stringify({ type: "TRACES", businessDate: "2026-01-01", rows: 3 }) } });
    await prisma.auditLog.create({ data: { action: "IMPORT_LIST_DELETED", userId, createdAt: at(60_000), meta: JSON.stringify({ type: "FORECAST", businessDate: today }) } });
    const h = await importHistory(today);
    expect(h.map((x) => [x.type, x.action, x.rows])).toEqual([["FORECAST", "DELETED", null], ["ARRIVALS", "APPLIED", 12], ["ARRIVALS", "APPLIED", 10]]);
    expect(h[1].by).toBe("fo");
  });
});
