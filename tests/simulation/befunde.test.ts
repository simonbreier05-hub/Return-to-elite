/**
 * Wächter-Tests zur Simulation „5 Hoteltage“ (docs/simulation/Fehlerbericht_Simulation_v2.md).
 *
 * Jeder Fall beschreibt das SOLL. Bekannte, noch offene Befunde sind mit `it.fails` markiert: Der Fall ist heute rot,
 * die Suite bleibt trotzdem grün. Sobald ein Fix-Paket den Befund behebt, schlägt `it.fails` an („erwartet rot, ist grün“) —
 * dann `.fails` entfernen. Die Befund-ID (z. B. K1) steht im Namen und im Bericht.
 *
 * Nur reine Funktionen und Quelltext-Prüfungen — keine Datenbank, keine Gastdaten.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { planBoardStatus } from "@/lib/dayplan/boardStatus";
import { computeDayNumbers, type DayNumberRow } from "@/lib/dayplan/dayNumbers";
import { LEGAL_TRANSITIONS, ROLE_ALLOWED_TARGETS } from "@/lib/stateMachine";
import { isGuestLocale } from "@/lib/guestI18n/translations";
import { isRecurringDue } from "@/lib/houseman/recurring";

const src = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const dayStart = new Date("2026-11-19T00:00:00+01:00");
const yesterday = new Date("2026-11-18T10:00:00+01:00");

describe("K1 Morgenstatus: gestern nicht gereinigt darf nicht „geprüft“ werden", () => {
  it("ein gestern schmutzig gebliebenes Zimmer ohne Eintrag im heutigen Plan bleibt schmutzig", () => {
    const { updates } = planBoardStatus({
      rooms: [{ id: "r126", status: "DIRTY", statusSince: yesterday }],
      needsCleaning: new Set(), marker: {}, dayStart,
    });
    expect(updates.find((u) => u.id === "r126")?.status).not.toBe("INSPECTED");
  });

  it("ein heute schon bearbeitetes Zimmer bleibt unberührt (gilt schon)", () => {
    const { updates } = planBoardStatus({
      rooms: [{ id: "r1", status: "DIRTY", statusSince: new Date("2026-11-19T08:00:00+01:00") }],
      needsCleaning: new Set(), marker: {}, dayStart,
    });
    expect(updates).toEqual([]);
  });

  it("gesperrte Zimmer fasst der Morgenstatus nie an (gilt schon — deshalb braucht die Sperre ein eigenes Ende, Befund H4)", () => {
    const { updates } = planBoardStatus({
      rooms: [{ id: "r322", status: "OUT_OF_ORDER", statusSince: yesterday }],
      needsCleaning: new Set(["r322"]), marker: {}, dayStart,
    });
    expect(updates).toEqual([]);
  });
});

describe("K3 Tageszahlen: nachträglich zugeteilte Zimmer ohne Tagesplan-Eintrag zählen mit", () => {
  const row = (over: Partial<DayNumberRow>): DayNumberRow => ({
    id: "x", number: "105", floor: 1, kind: "DEPARTURE", laundryDue: false, nightsKnown: false, status: "DIRTY", occupied: false, assignedToId: "hk1", assignedToday: true, ...over,
  });

  it("ein Zimmer aus dem Tagesplan zählt als zu reinigen (gilt schon)", () => {
    expect(computeDayNumbers({ rows: [row({})], inventory: 145 }).toClean).toBe(1);
  });

  it("ein heute zugeteiltes, schmutziges Zimmer ohne Tagesplan-Art zählt als zu reinigen", () => {
    // Heute: solche Zimmer haben keine Art (in der Liste `kind: null`) und fallen aus allen Zahlen (Tag 4: 70 statt 96).
    const rows = [row({ kind: null as unknown as DayNumberRow["kind"] })];
    expect(computeDayNumbers({ rows, inventory: 145 }).toClean).toBe(1);
  });
});

describe("K2 Live-Kanal: nur für angemeldete Geräte", () => {
  it("server.js prüft die Anmeldung, bevor ein Gerät Live-Nachrichten bekommt", () => {
    expect(src("server.js")).toMatch(/io\.use\(/);
  });

  it("realtime.ts sendet keine Rundnachricht an alle (io.emit) mehr", () => {
    expect(src("src/lib/realtime.ts")).not.toMatch(/\bio\.emit\(/);
  });
});

describe("H4 Sperren: „außer Betrieb“ endet", () => {
  it("Zurück in Betrieb ist erlaubt: OUT_OF_ORDER/OUT_OF_SERVICE → DIRTY (gilt schon)", () => {
    expect(LEGAL_TRANSITIONS.OUT_OF_ORDER).toContain("DIRTY");
    expect(LEGAL_TRANSITIONS.OUT_OF_SERVICE).toContain("DIRTY");
  });

  it("der Minutentakt (escalations.ts) wertet das Ende der Sperre (oooUntil) aus", () => {
    expect(src("src/lib/escalations.ts")).toMatch(/oooUntil/);
  });

  it("der Techniker darf sperren, aber nie freigeben (gilt schon)", () => {
    expect(ROLE_ALLOWED_TARGETS.engineering).toContain("OUT_OF_ORDER");
    expect(ROLE_ALLOWED_TARGETS.engineering).not.toContain("INSPECTED");
  });
});

describe("H7 Check-out lässt sich zurücknehmen", () => {
  it("die Check-out-Route kennt ein Zurücknehmen (DELETE)", () => {
    expect(src("src/app/api/rooms/[id]/checkout/route.ts")).toMatch(/export async function DELETE/);
  });
});

describe("H11 Krankmeldung bleibt beim Team-Speichern erhalten", () => {
  it("saveTeam setzt eine heutige Krankmeldung nicht still zurück", () => {
    // Heute: Kraft ist in der Auswahl UND heute krank gemeldet → absentDate wird auf null gesetzt (teamData.ts).
    expect(src("src/lib/planung/teamData.ts")).not.toMatch(/if \(u\.absentDate === date\) await prisma\.user\.update\(\{ where: \{ id: u\.id \}, data: \{ absentDate: null \} \}\)/);
  });
});

describe("M2 Meldungen: der Duty Manager verliert nichts hinter einem 50er-Deckel", () => {
  it("GET /api/notifications schneidet nicht pauschal bei 50 ab", () => {
    expect(src("src/app/api/notifications/route.ts")).not.toMatch(/take: 50/);
  });
});

describe("M14 Gastsprache (B12): mehr als Deutsch und Englisch", () => {
  it("Deutsch und Englisch gehen (gilt schon)", () => {
    expect(isGuestLocale("de")).toBe(true);
    expect(isGuestLocale("en")).toBe(true);
  });

  it.fails("Französisch, Spanisch und Chinesisch werden als Gastsprache angenommen", () => {
    expect(["fr", "es", "zh"].every(isGuestLocale)).toBe(true);
  });
});

describe("B7 wiederkehrende Hausmann-Aufgaben (gilt schon)", () => {
  it("alle 2 Tage ab Startdatum, sonst nicht", () => {
    const t = { startDate: "2026-11-16", everyDays: 2, active: true };
    expect(isRecurringDue(t, "2026-11-18")).toBe(true);
    expect(isRecurringDue(t, "2026-11-19")).toBe(false);
  });
});
