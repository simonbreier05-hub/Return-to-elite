import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** Betriebstag-Gate gegen eine Wegwerf-SQLite-DB: Listen von gestern zählen nicht, „Trotzdem verwenden“ wird protokolliert. */
const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-stale-"));
  return { dir: d, url: `file:${p.join(d, "test.db")}` };
});
vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient({ datasources: { db: { url } } }) };
});

import { prisma } from "@/lib/db";
import { acceptStaleList, applyBatch, listBlockersNow, storeBatch } from "@/lib/import/store";
import { IMPORT_TYPES } from "@/lib/domain";
import type { ParseResult } from "@/lib/import/types";

const NOW = new Date("2026-10-23T08:00:00Z");
let userId = "";

const empty = (type: (typeof IMPORT_TYPES)[number], reportDate: string | null): ParseResult<never> =>
  ({ type, rows: [], issues: [], reportDate, periodFrom: type === "ARRIVALS" ? reportDate : null, periodTo: null, pagesSeen: 1, pagesTotal: 1, dates: { format: "DMY", via: "unique" } }) as ParseResult<never>;

async function put(type: (typeof IMPORT_TYPES)[number], date: string | null, hash: string) {
  const { batch } = await storeBatch({ result: empty(type, date), uploadedById: userId, fileHash: hash.repeat(64).slice(0, 64), knownRooms: new Set() });
  await applyBatch(batch.id, userId);
  return batch;
}

beforeAll(() => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Betriebstag-Gate (Wegwerf-DB)", () => {
  it("Liste ohne Druckdatum wird nicht kritisch, sondern bekommt den Betriebstag", async () => {
    userId = (await prisma.user.create({ data: { email: "sup@test", name: "Sup", passwordHash: "x", role: "supervisor" } })).id;
    const { batch, critical, issues } = await storeBatch({ result: empty("FORECAST", null), uploadedById: userId, fileHash: "e".repeat(64), knownRooms: new Set() });
    expect(critical).toBe(false);
    expect(issues.map((i) => i.code)).toContain("NO_PRINT_DATE");
    expect(batch.businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await prisma.importBatch.deleteMany();
  });

  it("alte Stände (06.10.) blockieren; fehlende Typen werden genannt", async () => {
    await put("DEPARTURES", "2026-10-06", "a");
    await put("TRACES", "2026-10-06", "b");
    await put("INHOUSE", "2026-10-06", "c");
    const b = await listBlockersNow(NOW);
    expect(b.missing.sort()).toEqual(["ARRIVALS", "FORECAST"]);
    expect(b.stale.map((s) => s.type).sort()).toEqual(["DEPARTURES", "INHOUSE", "TRACES"]);
  });

  it("aktuelle Listen + Bestätigung der alten → frei; Bestätigung steht im Logbuch ohne Gastdaten", async () => {
    await put("FORECAST", "2026-10-23", "d");
    await put("ARRIVALS", "2026-10-23", "f");
    for (const t of ["DEPARTURES", "TRACES", "INHOUSE"] as const) await acceptStaleList(t, userId);
    const b = await listBlockersNow(NOW);
    expect(b.missing).toEqual([]);
    expect(b.stale).toEqual([]);
    const logs = await prisma.auditLog.findMany({ where: { action: "IMPORT_STALE_ACCEPTED" } });
    expect(logs).toHaveLength(3);
    expect(logs.every((l) => !/guestName|"name"|"text"/.test(l.meta ?? ""))).toBe(true);
  });

  it("ein Nachimport (neuer Stand) braucht keine alte Bestätigung mehr, wenn er aktuell ist", async () => {
    await put("DEPARTURES", "2026-10-23", "9");
    expect((await listBlockersNow(NOW)).stale).toEqual([]);
  });
});
