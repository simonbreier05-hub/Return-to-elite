import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** Tageswechsel des Zimmerstatus (dayplan/rollover.ts) + liegen gebliebene Abreisen im Zuteilungsvorschlag (autoplan/load.ts). */
const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-rollover-"));
  return { dir: d, url: `file:${p.join(d, "test.db")}` };
});
vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient({ datasources: { db: { url } } }) };
});
vi.mock("@/lib/realtime", () => ({ broadcast: () => undefined }));

import { prisma } from "@/lib/db";
import { isControlRoom, rolloverAction, rolloverStatuses } from "@/lib/dayplan/rollover";
import { loadDay } from "@/lib/autoplan/load";

const TODAY = "2026-11-01";
const YESTERDAY = "2026-10-31";
const NOW = new Date("2026-11-01T06:30:00Z"); // 07:30 Berlin
const YDAY_AT = new Date("2026-10-31T13:00:00Z");

describe("rolloverAction (rein)", () => {
  const a = (cleaningType: string | null, status: string, statusSinceDay = YESTERDAY) => rolloverAction({ cleaningType, status, statusSinceDay, date: TODAY });
  it("gestern gereinigter Bleiber/Abreise/Turn → DIRTY", () => {
    expect(a("STAYOVER", "CLEAN")).toBe("RESET_DIRTY");
    expect(a("DEPARTURE", "INSPECTED")).toBe("RESET_DIRTY");
    expect(a("SAME_DAY_TURN", "CLEAN")).toBe("RESET_DIRTY");
  });
  it("heute schon gereinigt (Nachimport) → unverändert", () => {
    expect(a("STAYOVER", "CLEAN", TODAY)).toBe("KEEP");
  });
  it("liegen geblieben (DIRTY, DND/BLOCKED, IN_PROGRESS, OOO) → unverändert", () => {
    for (const st of ["DIRTY", "BLOCKED", "IN_PROGRESS", "PICKUP", "OUT_OF_ORDER", "OUT_OF_SERVICE", "DEFECT_REPORTED", "GREEN_OPT_OUT"]) {
      expect(a("STAYOVER", st)).toBe("KEEP");
      expect(a("DEPARTURE", st)).toBe("KEEP");
    }
  });
  it("Anreise in gereinigtes Zimmer → Kontrolle, Status bleibt", () => {
    expect(a("ARRIVAL", "CLEAN")).toBe("CONTROL");
    expect(a("ARRIVAL", "INSPECTED")).toBe("CONTROL");
    expect(a("ARRIVAL", "DIRTY")).toBe("KEEP");
    expect(isControlRoom("ARRIVAL", "CLEAN")).toBe(true);
    expect(isControlRoom("SAME_DAY_TURN", "CLEAN")).toBe(false);
  });
  it("Zimmer ohne Eintrag heute → unverändert", () => {
    expect(a(null, "CLEAN")).toBe("KEEP");
  });
});

beforeAll(() => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("rolloverStatuses + loadDay (Wegwerf-DB)", () => {
  let userId = "";
  const ids: Record<string, string> = {};
  const room = async (number: string, status: string, statusSince = YDAY_AT) => {
    ids[number] = (await prisma.room.create({ data: { number, floor: 1, section: "1A", type: "STANDARD", status, statusSince } })).id;
  };
  const plan = (date: string, number: string, cleaningType: string) => prisma.dayRoomPlan.create({ data: { date, roomId: ids[number], cleaningType } });
  const statusOf = async (n: string) => (await prisma.room.findUnique({ where: { id: ids[n] } }))!.status;

  it("bereitet Zimmer und Tagespläne vor", async () => {
    userId = (await prisma.user.create({ data: { email: "sup@test", name: "Sup", passwordHash: "x", role: "supervisor" } })).id;
    await room("101", "CLEAN"); // Bleiber, gestern gereinigt
    await room("102", "BLOCKED"); // Bleiber, gestern DND
    await room("103", "CLEAN", new Date("2026-11-01T06:00:00Z")); // Bleiber, heute schon gereinigt
    await room("104", "CLEAN"); // gestern Abreise gereinigt, heute Anreise → Kontrolle
    await room("105", "DIRTY"); // gestern Abreise liegen geblieben, heute nichts
    await room("106", "DIRTY"); // gestern Abreise liegen geblieben, heute Anreise
    await room("107", "OUT_OF_ORDER"); // Bleiber außer Betrieb
    for (const [n, t] of [["101", "STAYOVER"], ["102", "STAYOVER"], ["103", "STAYOVER"], ["104", "DEPARTURE"], ["105", "DEPARTURE"], ["106", "DEPARTURE"]] as const) await plan(YESTERDAY, n, t);
    for (const [n, t] of [["101", "STAYOVER"], ["102", "STAYOVER"], ["103", "STAYOVER"], ["104", "ARRIVAL"], ["106", "ARRIVAL"], ["107", "STAYOVER"]] as const) await plan(TODAY, n, t);
  });

  it("anderer Tag als heute → nichts passiert", async () => {
    const r = await rolloverStatuses(TODAY, userId, new Date("2026-10-31T20:00:00Z"));
    expect(r.skipped).toBe(true);
    expect(await statusOf("101")).toBe("CLEAN");
  });

  it("setzt nur gestern gereinigte Arbeitszimmer zurück, Liegengebliebenes bleibt", async () => {
    const r = await rolloverStatuses(TODAY, userId, NOW);
    expect(r.reset).toEqual(["101"]);
    expect(r.control).toEqual(["104"]);
    expect(await statusOf("101")).toBe("DIRTY");
    expect(await statusOf("102")).toBe("BLOCKED");
    expect(await statusOf("103")).toBe("CLEAN");
    expect(await statusOf("104")).toBe("CLEAN");
    expect(await statusOf("105")).toBe("DIRTY");
    expect(await statusOf("107")).toBe("OUT_OF_ORDER");
    const log = await prisma.auditLog.findMany({ where: { action: "STATUS_ROLLOVER" } });
    expect(log.map((l) => [l.roomId, l.fromStatus, l.toStatus])).toEqual([[ids["101"], "CLEAN", "DIRTY"]]);
  });

  it("zweiter Lauf am selben Tag ändert nichts (idempotent)", async () => {
    const r = await rolloverStatuses(TODAY, userId, new Date(NOW.getTime() + 3_600_000));
    expect(r.reset).toEqual([]);
  });

  it("Zuteilungsvorschlag nimmt liegen gebliebene Abreisen vom Vortag mit", async () => {
    const day = await loadDay(TODAY);
    const kinds = Object.fromEntries(day.rooms.map((r) => [r.number, r.kind]));
    expect(kinds["101"]).toBe("STAYOVER");
    expect(kinds["102"]).toBe("STAYOVER"); // DND vom Vortag bleibt Arbeit
    expect(kinds["105"]).toBe("DEPARTURE"); // liegen geblieben, heute kein Eintrag
    expect(kinds["106"]).toBe("TURN"); // liegen geblieben + Anreise heute
    expect(kinds["104"]).toBeUndefined(); // sauber, nur Kontrolle
    expect(kinds["107"]).toBeUndefined(); // außer Betrieb
  });
});
