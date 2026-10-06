import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** Zuteilungsvorschlag und Live-Umverteilung gegen eine echte (Wegwerf-)SQLite-DB. */
const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-autoplan-"));
  return { dir: d, url: `file:${p.join(d, "test.db")}` };
});
vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient({ datasources: { db: { url } } }) };
});

import { prisma } from "@/lib/db";
import { checkRedistribution, confirmProposal, decideSuggestion, listSuggestions, proposeForDate, setAbsent } from "@/lib/autoplan/service";
import { berlinDate } from "@/lib/dayplan/time";
import type { Session } from "@/lib/auth";

const DATE = berlinDate(new Date());
let sup: Session;
const hkId: Record<string, string> = {};
const roomId: Record<string, string> = {};

beforeAll(() => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

const dbRoom = (n: string) => prisma.room.findUniqueOrThrow({ where: { number: n } });

describe("Zuteilungsvorschlag und Umverteilung (Wegwerf-DB)", () => {
  it("bereitet Haus, Team und Tagesplan vor", async () => {
    const u = await prisma.user.create({ data: { email: "sup@x.test", name: "Sup", passwordHash: "x", role: "supervisor" } });
    sup = { userId: u.id, name: "Sup", role: "supervisor" };
    for (const [key, name, type, level] of [["a", "Anna", "VOLLZEIT", 3], ["b", "Bea", "VOLLZEIT", 2], ["c", "Cem", "VOLLZEIT", 1], ["d", "Dora", "AZUBI", 1]] as const) {
      hkId[key] = (await prisma.user.create({ data: { email: `${key}@x.test`, name, passwordHash: "x", role: "room_attendant", hkType: type, hkLevel: level } })).id;
    }
    for (let i = 1; i <= 30; i++) {
      const number = String(100 + i);
      const type = i % 10 === 0 ? "SUITE" : "STANDARD";
      const r = await prisma.room.create({ data: { number, floor: i <= 15 ? 1 : 2, section: i <= 15 ? "1A" : "2A", type, isAntiAllergic: i === 18, interconnectingGroup: i === 4 ? "105" : i === 5 ? "104" : null } });
      roomId[number] = r.id;
      const cleaningType = i % 6 === 0 ? "SAME_DAY_TURN" : i % 3 === 0 ? "DEPARTURE" : "STAYOVER";
      await prisma.dayRoomPlan.create({ data: { date: DATE, roomId: r.id, cleaningType, laundryDue: cleaningType === "STAYOVER" && i % 4 === 0, vip: i === 7, eta: cleaningType === "SAME_DAY_TURN" ? "14:00" : null } });
    }
  });

  let proposalId = "";
  it("Entwurf berechnen: nichts wird live; Stufe 1 bekommt nichts Anspruchsvolles; Stufe/Typ stehen nicht im Protokoll", async () => {
    const r = await proposeForDate(DATE, sup.userId);
    proposalId = r.proposalId;
    expect(r.payload.result.unassigned).toEqual([]);
    expect(await prisma.room.count({ where: { assignedToId: { not: null } } })).toBe(0);
    const demanding = new Set(r.payload.input.rooms.filter((x) => x.demanding.length).map((x) => x.id));
    for (const k of ["c", "d"]) for (const id of r.payload.result.routes.find((x) => x.hkId === hkId[k])!.roomIds) expect(demanding.has(id), `${k}:${id}`).toBe(false);
    const logs = JSON.stringify(await prisma.auditLog.findMany());
    expect(logs).not.toMatch(/Stufe|hkLevel|VOLLZEIT|AZUBI|Anna|Bea|Cem|Dora/);
  });

  it("Bestätigen: Handänderung wird übernommen und als Abweichung gespeichert; Route, Datum, Tagesnummern gesetzt", async () => {
    const row = await prisma.autoPlanProposal.findUniqueOrThrow({ where: { id: proposalId } });
    const { result } = JSON.parse(row.payload);
    const final = { ...result.assignment };
    const move = Object.keys(final).find((id) => final[id] === hkId.a && !result.reasons[id].join(" ").includes("VIP"))!;
    final[move] = hkId.b;
    const out = await confirmProposal(proposalId, final, sup);
    expect(out).toMatchObject({ changed: 1, open: 0 });
    const rooms = await prisma.room.findMany({ where: { assignedToId: { not: null } } });
    expect(rooms.length).toBe(30);
    expect(rooms.every((r) => r.assignedOn === DATE && r.routeOrder !== null)).toBe(true);
    expect((await prisma.room.findUniqueOrThrow({ where: { id: move } })).assignedToId).toBe(hkId.b);
    const dev = JSON.parse((await prisma.autoPlanProposal.findUniqueOrThrow({ where: { id: proposalId } })).deviations!);
    expect(dev).toHaveLength(1);
    expect(dev[0]).toMatchObject({ from: hkId.a, to: hkId.b });
    const aud = await prisma.auditLog.findFirstOrThrow({ where: { action: "AUTOPLAN_CONFIRMED" } });
    expect(JSON.parse(aud.meta!)).toMatchObject({ changed: 1 });
    await expect(confirmProposal(proposalId, final, sup)).rejects.toThrow(/nicht mehr offen/);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: hkId.a } })).dailyNumber).not.toBeNull();
  });

  it("neuer Vorschlag: heutige Zuteilung ist fest, gestrige nicht; begonnene Zimmer bleiben", async () => {
    await prisma.room.update({ where: { number: "102" }, data: { assignedOn: "2000-01-01" } }); // veraltet → wieder frei
    const started = await dbRoom("103");
    await prisma.room.update({ where: { id: started.id }, data: { status: "IN_PROGRESS" } });
    const r = await proposeForDate(DATE, sup.userId);
    const rooms = new Map(r.payload.input.rooms.map((x) => [x.number, x]));
    expect(rooms.get("101")!.fixedTo).not.toBeNull(); // heute zugeteilt = fest
    expect(rooms.get("102")!.fixedTo).toBeNull();
    expect(rooms.get("103")!.fixedTo).toBe(started.assignedToId);
    expect(rooms.get("103")!.state).toBe("STARTED");
    for (const x of r.payload.input.rooms.filter((y) => y.fixedTo)) expect(r.payload.result.assignment[x.id]).toBe(x.fixedTo);
    // Feste Zimmer lassen sich nicht umbiegen
    const bad = { ...r.payload.result.assignment, [started.id]: hkId.d };
    await expect(confirmProposal(r.proposalId, bad, sup)).rejects.toThrow(/fest zugeteilt/);
    await prisma.room.update({ where: { id: started.id }, data: { status: "DIRTY" } });
    await prisma.autoPlanProposal.updateMany({ data: { status: "SUPERSEDED" } });
  });

  it("Ausfall: ein Tap erzeugt einen konkreten Vorschlag; Ablehnen ist dauerhaft, Änderung der Lage nicht", async () => {
    // Zimmer von Bea: eins begonnen
    const bea = await prisma.room.findMany({ where: { assignedToId: hkId.b }, orderBy: { number: "asc" } });
    const begun = bea[0];
    await prisma.room.update({ where: { id: begun.id }, data: { status: "IN_PROGRESS" } });
    const r = await setAbsent(hkId.b, true, sup.userId);
    expect(r.created).toBeGreaterThanOrEqual(1); // Ausfall (+ ggf. offenes Zimmer aus dem Vortest)
    const list = await listSuggestions(DATE);
    const s = list.suggestions.find((x) => x.kind === "ABSENT")!;
    expect(s).toBeTruthy();
    expect(s.moves.length).toBe(bea.length - 1); // nur nicht begonnene
    expect(s.moves.every((m) => m.toId !== hkId.b && m.fromId === hkId.b)).toBe(true);
    expect(s.moves.map((m) => m.roomId)).not.toContain(begun.id);
    // Stufe 1 bekommt nichts Anspruchsvolles
    const demanding = new Set((await prisma.room.findMany({ where: { OR: [{ type: "SUITE" }, { number: "118" }] } })).map((x) => x.id));
    for (const m of s.moves) if ([hkId.c, hkId.d].includes(m.toId)) expect(demanding.has(m.roomId)).toBe(false);
    // Ablehnen → bei gleicher Lage nicht erneut
    await decideSuggestion(s.id, "reject", sup);
    expect((await checkRedistribution(DATE)).created).toBe(0);
    expect((await listSuggestions(DATE)).suggestions.some((x) => x.kind === "ABSENT")).toBe(false);
    // Lage ändert sich (weiteres Zimmer begonnen) → neuer Vorschlag
    await prisma.room.update({ where: { id: bea[1].id }, data: { status: "IN_PROGRESS" } });
    expect((await checkRedistribution(DATE)).created).toBeGreaterThanOrEqual(1);
    expect((await listSuggestions(DATE)).suggestions.some((x) => x.kind === "ABSENT")).toBe(true);
  });

  it("Bestätigen verschiebt nur nicht begonnene Zimmer; Ändern erlaubt anderes Ziel", async () => {
    const s = (await listSuggestions(DATE)).suggestions.find((x) => x.kind === "ABSENT")!;
    const first = s.moves[0];
    const alt = [hkId.a, hkId.c, hkId.d].find((id) => id !== first.toId)!;
    const demanding = (await prisma.room.findUniqueOrThrow({ where: { id: first.roomId } })).type === "SUITE";
    const target = demanding ? hkId.a : alt; // Änderung nur auf geeignete Kraft
    const out = await decideSuggestion(s.id, "confirm", sup, [{ roomId: first.roomId, toId: target }]);
    expect(out.skipped).toBe(0);
    expect(out.applied).toBe(s.moves.length);
    expect((await prisma.room.findUniqueOrThrow({ where: { id: first.roomId } })).assignedToId).toBe(target);
    const left = await prisma.room.findMany({ where: { assignedToId: hkId.b, status: { not: "IN_PROGRESS" } } });
    expect(left).toHaveLength(0);
    const aud = await prisma.auditLog.findFirstOrThrow({ where: { action: "REDISTRIBUTION_CONFIRMED" } });
    expect(JSON.parse(aud.meta!)).toMatchObject({ changed: true });
  });

  it("früher fertig: Housekeeper mit fast leerem Plan bekommt Zimmer der am stärksten belasteten Kraft", async () => {
    await setAbsent(hkId.b, false, sup.userId);
    await prisma.room.updateMany({ where: { assignedToId: hkId.d, id: { not: (await prisma.room.findFirstOrThrow({ where: { assignedToId: hkId.d }, orderBy: { number: "asc" } })).id } }, data: { status: "CLEAN" } });
    await prisma.room.updateMany({ where: { assignedToId: hkId.b }, data: { status: "DIRTY" } });
    await prisma.autoPlanProposal.updateMany({ data: { status: "SUPERSEDED" } });
    const r = await checkRedistribution(DATE);
    const list = (await listSuggestions(DATE)).suggestions.filter((x) => x.kind === "EARLY_FINISH");
    expect(r.created).toBeGreaterThanOrEqual(1);
    expect(list.length).toBeGreaterThanOrEqual(1);
    for (const s of list) {
      expect(s.moves.length).toBeLessThanOrEqual(4);
      for (const m of s.moves) {
        const room = await prisma.room.findUniqueOrThrow({ where: { id: m.roomId } });
        expect(["DIRTY", "PICKUP", "BLOCKED"]).toContain(room.status);
      }
    }
  });

  it("Protokoll und Meldungen enthalten keine Namen oder Stufen", async () => {
    const dump = JSON.stringify([await prisma.auditLog.findMany(), await prisma.notification.findMany()]);
    expect(dump).not.toMatch(/Anna|Bea|Cem|Dora|hkLevel|Stufe/);
  });
});
