import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { floorStats, houseTotals } from "@/lib/planung/model";

const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-house-"));
  return { dir: d, url: `file:${p.join(d, "test.db")}` };
});
vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient({ datasources: { db: { url } } }) };
});
import { prisma } from "@/lib/db";
import { getHouseData } from "@/lib/planung/house";

beforeAll(() => { execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" }); }, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Haus-Daten (gemeinsame Abfrage)", () => {
  it("vor dem ersten Import: alle Kacheln leer, hasData false, Etage 5 ohne 501–512", async () => {
    for (let f = 1; f <= 5; f++) {
      const nums = f === 5 ? Array.from({ length: 10 }, (_, i) => 513 + i) : Array.from({ length: 12 }, (_, i) => f * 100 + 1 + i);
      for (const n of nums) await prisma.room.create({ data: { number: String(n), floor: f, section: `${f}A`, type: "STANDARD" } });
    }
    const h = await getHouseData();
    expect(h.hasData).toBe(false);
    expect(h.date).toBeNull();
    const f5 = h.floors.find((f) => f.floor === 5)!;
    expect(f5.tiles).toHaveLength(10);
    expect(f5.tiles.every((t) => Number(t.number) >= 513)).toBe(true);
    expect(houseTotals(h.floors).occupied).toBe(0);
  });

  it("mit Tagesplan: Kacheln und Etagenbalken kommen aus derselben DayRoomPlan-Abfrage", async () => {
    const rooms = await prisma.room.findMany({ orderBy: { number: "asc" } });
    const types = ["DEPARTURE", "SAME_DAY_TURN", "STAYOVER", "STAYOVER", "ARRIVAL"];
    for (const [i, r] of rooms.slice(0, 20).entries()) {
      await prisma.dayRoomPlan.create({ data: { date: "2026-09-22", roomId: r.id, cleaningType: types[i % 5], vip: i === 3, laundryDue: i === 2, eta: i % 5 === 1 ? "14:00" : null } });
    }
    const h = await getHouseData();
    expect(h).toMatchObject({ hasData: true, date: "2026-09-22" });
    const f1 = floorStats(h.floors.find((f) => f.floor === 1)!);
    expect(f1.total).toBe(12);
    expect(f1.occupied).toBe(10); // 12 Zimmer, 2 davon Anreise (i=4,9) zählen nicht als belegt
    expect(h.floors.find((f) => f.floor === 1)!.tiles.find((t) => t.number === "104")).toMatchObject({ kind: "STAYOVER", vip: true });
    const turn = h.floors.flatMap((f) => f.tiles).find((t) => t.kind === "TURN")!;
    expect(turn.eta).toBe("14:00");
  });

  it("Supervisor-Badges aus der bestehenden Etagenzuweisung: Buchstabe + Helligkeitsstufe, keine Gastdaten", async () => {
    await prisma.user.create({ data: { email: "p@x.test", name: "Petra Test", passwordHash: "x", role: "supervisor", assignedFloors: "1,2" } });
    await prisma.user.create({ data: { email: "j@x.test", name: "Jonas Test", passwordHash: "x", role: "supervisor", assignedFloors: "3" } });
    const h = await getHouseData();
    expect(h.supervisors[1]).toMatchObject({ letter: "P", tone: 2 }); // alphabetisch: Jonas (Stufe 1), Petra (Stufe 2)
    expect(h.supervisors[2]).toMatchObject({ letter: "P", tone: 2 });
    expect(h.supervisors[3]!.letter).toBe("J");
    expect(h.supervisors[4]).toBeUndefined();
    expect(JSON.stringify(h)).not.toMatch(/guest|Mr\.|Mrs\./i);
  });
});
