import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** F4 (H3, H11, Frage 12): Handzuteilung mit Warnung, Krankmeldung bleibt, Präferenz-Etagen nur DM. Nur erfundene Daten. */
const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-f4-"));
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
import { PATCH as hkPatch } from "@/app/api/housekeepers/[id]/route";
import { POST as assignPost } from "@/app/api/rooms/[id]/assign/route";
import { POST as bulkAssignPost } from "@/app/api/rooms/bulk-assign/route";
import { saveTeam } from "@/lib/planung/teamData";
import { setAbsent } from "@/lib/autoplan/service";
import type { Role } from "@/lib/domain";

const ids: Record<string, string> = {};
const TODAY = berlinDate(new Date());
const as = (key: string, role: Role) => { getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: ids[key], name: key, role }); };
const req = (body: object, method = "POST") => new NextRequest("http://x", { method, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  for (const [k, role, level] of [["p", "room_attendant", 1], ["m", "room_attendant", 3], ["sup", "supervisor", 2], ["dm", "duty_manager", 2]] as const) {
    ids[k] = (await prisma.user.create({ data: { email: `${k}@x.test`, name: `${k} Test`, passwordHash: "x", role, hkLevel: level } })).id;
  }
  ids.suite = (await prisma.room.create({ data: { number: "501", floor: 5, section: "5A", type: "SUITE", status: "DIRTY" } })).id;
  ids.std = (await prisma.room.create({ data: { number: "502", floor: 5, section: "5A", type: "STANDARD", status: "DIRTY" } })).id;
}, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("F4: Präferenz-Etagen nur DM (Frage 12)", () => {
  it("Supervisor 403, Duty Manager darf", async () => {
    as("sup", "supervisor");
    expect((await hkPatch(req({ homeFloors: [2, 3] }, "PATCH"), ctx(ids.p))).status).toBe(403);
    as("dm", "duty_manager");
    expect((await hkPatch(req({ homeFloors: [2, 3] }, "PATCH"), ctx(ids.p))).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.p } })).homeFloors).toBe("2,3");
  });
});

describe("F4: Zuteilen von Hand (H3)", () => {
  it("Suite an Stufe 1 → Warnung (409), mit Bestätigung erlaubt", async () => {
    as("sup", "supervisor");
    const r = await assignPost(req({ attendantId: ids.p }), ctx(ids.suite));
    expect(r.status).toBe(409);
    const body = await r.json();
    expect(body.code).toBe("ASSIGN_WARNINGS");
    expect(body.warnings.map((w: { code: string }) => w.code)).toContain("LEVEL1_DEMANDING");
    expect((await assignPost(req({ attendantId: ids.p, confirmWarnings: true }), ctx(ids.suite))).status).toBe(200);
  });

  it("Standardzimmer an Stufe 3 ohne Warnung; Mehrfachauswahl prüft genauso", async () => {
    as("sup", "supervisor");
    expect((await assignPost(req({ attendantId: ids.m }), ctx(ids.std))).status).toBe(200);
    const r = await bulkAssignPost(req({ roomIds: [ids.suite], attendantId: ids.p }));
    expect(r.status).toBe(200); // schon bei p — keine Änderung, keine Rückfrage
    await prisma.room.update({ where: { id: ids.suite }, data: { assignedToId: null } });
    expect((await bulkAssignPost(req({ roomIds: [ids.suite], attendantId: ids.p }))).status).toBe(409);
  });
});

describe("F4: Krankmeldung bleibt (H11)", () => {
  it("Team-Speichern mit der kranken Kraft in der Auswahl setzt sie nicht zurück; Zuteilen warnt „krank“", async () => {
    await setAbsent(ids.m, true, ids.sup);
    await saveTeam(TODAY, { hk: [ids.p, ids.m], sup: [ids.sup], hm: [] }, ids.dm);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.m } })).absentDate).toBe(TODAY);
    as("sup", "supervisor");
    const r = await bulkAssignPost(req({ roomIds: [ids.std], attendantId: ids.m }));
    // 502 ist schon bei m (keine Änderung) — neues Zimmer prüfen
    const extra = (await prisma.room.create({ data: { number: "503", floor: 5, section: "5A", type: "STANDARD", status: "DIRTY" } })).id;
    const r2 = await assignPost(req({ attendantId: ids.m }), ctx(extra));
    expect(r.status).toBe(200);
    expect(r2.status).toBe(409);
    expect((await r2.json()).warnings.map((w: { code: string }) => w.code)).toContain("ABSENT_TODAY");
    // aktiv zurücknehmen (Supervisor/DM) geht
    await setAbsent(ids.m, false, ids.sup);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.m } })).absentDate).toBeNull();
  });
});
