import { describe, expect, it } from "vitest";
import { proposePlan } from "@/lib/autoplan/propose";
import { buildResult } from "@/lib/autoplan/result";
import type { Assignment } from "@/lib/autoplan/types";
import { makeDay, makeInput, TEAM } from "../autoplan/scenario";

/** Entwurf bearbeiten ohne Datenbank: verschieben, entfernen, aus „offen“ hinzufügen, Kraft abwählen/zurückholen. */
describe("Entwurf bearbeiten (nur Rechnung, nichts live)", () => {
  const rooms = makeDay(70);
  const team = TEAM().filter((h) => h.id !== "g");
  const input = makeInput(rooms, team);
  const base = proposePlan(input).assignment;

  it("jedes Zimmer lässt sich jeder anwesenden Kraft zuteilen — Etagenlimit und Credit-Ziel nur als Warnung", () => {
    for (const hk of team) {
      const all: Assignment = Object.fromEntries(rooms.map((r) => [r.id, hk.id]));
      const res = buildResult(input, all);
      expect(res.unassigned).toEqual([]);
      expect(res.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(["CREDITS_OUT_OF_BAND"]));
    }
  });

  it("verschieben (Zimmer → Ziel), entfernen (offen) und aus den offenen hinzufügen", () => {
    const id = rooms[0].id, from = base[id]!, to = team.find((h) => h.id !== from)!.id;
    const moved = buildResult(input, { ...base, [id]: to });
    expect(moved.assignment[id]).toBe(to);
    expect(moved.unassigned).toEqual([]);
    const removed = buildResult(input, { ...base, [id]: null });
    expect(removed.unassigned).toEqual([id]);
    expect(removed.warnings.find((w) => w.code === "UNASSIGNED")?.message).toMatch(/1 Zimmer sind noch offen/);
    const added = buildResult(input, { ...removed.assignment, [id]: from });
    expect(added.unassigned).toEqual([]);
    expect(added.metrics.find((m) => m.hkId === from)!.rooms).toBe(buildResult(input, base).metrics.find((m) => m.hkId === from)!.rooms);
  });

  it("Summe gegen Ziel: Metriken liefern Credits und Zielband je Kraft", () => {
    const res = buildResult(input, base);
    for (const m of res.metrics) { expect(m.lo).toBeLessThan(m.hi); expect(m.credits).toBeGreaterThan(0); }
  });

  it("Kraft abwählen verteilt ihre Zimmer neu (nichts offen); wieder einplanen ist umkehrbar", () => {
    const without = proposePlan(makeInput(rooms, team.slice(1)));
    expect(without.unassigned).toEqual([]);
    expect(Object.values(without.assignment)).not.toContain(team[0].id);
    const again = proposePlan(makeInput(rooms, team));
    expect(again.unassigned).toEqual([]);
    expect(Object.values(again.assignment)).toContain(team[0].id);
    expect(again.assignment).toEqual(base); // gleiche Eingabe → gleicher Entwurf
  });

  it("zu wenige Kräfte / alle unter Ziel: trotzdem nichts offen (Regeln werden überschritten, Warnung statt Sperre)", () => {
    const res = proposePlan(makeInput(makeDay(120), team.slice(0, 2)));
    expect(res.unassigned).toEqual([]);
    expect(res.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(["TOO_MANY_FLOORS"]));
  });
});
