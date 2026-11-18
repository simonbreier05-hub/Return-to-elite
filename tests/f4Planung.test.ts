import { describe, expect, it } from "vitest";
import { proposePlan } from "@/lib/autoplan/propose";
import { isSuite } from "@/lib/autoplan/types";
import { hk, makeDay, makeInput } from "./autoplan/scenario";

/**
 * F4 (H2, M6, M7; Entscheidungen Frage 1 und 2): Tag-3-Szenario — 5 Kräfte, davon 3× Stufe 1, 85 Zimmer.
 * Der Vorschlag gibt Stufe 1 nie Suite/VIP/Allergiker/viele Traces; was niemand Passendes bekommen kann, bleibt offen mit Hinweis.
 */
const rooms = makeDay(85, { vipEvery: 4 });
const team = [hk("m", "VOLLZEIT", 3), hk("a", "VOLLZEIT", 2), hk("p", "VOLLZEIT", 1), hk("l", "VOLLZEIT", 1), hk("i", "VOLLZEIT", 1)];
const input = { ...makeInput(rooms, team), maxSuites: 2 };
const res = proposePlan(input);
const byId = new Map(rooms.map((r) => [r.id, r]));
const level = new Map(team.map((h) => [h.id, h.level]));

describe("F4: Tag-3-Szenario (3× Stufe 1)", () => {
  it("keine Suite, kein VIP, kein Allergiker-Zimmer bei Stufe 1 im Vorschlag", () => {
    for (const [roomId, hkId] of Object.entries(res.assignment)) {
      if (hkId && level.get(hkId) === 1) expect(byId.get(roomId)!.demanding, `${hkId}:${byId.get(roomId)!.number}`).toEqual([]);
    }
  });

  it("nicht deckbare anspruchsvolle Zimmer bleiben offen — ein Hinweis mit Zimmernummern ganz oben", () => {
    const open = res.unassigned.map((id) => byId.get(id)!);
    expect(open.every((r) => r.demanding.length > 0)).toBe(true);
    if (open.length) {
      const w = res.warnings.find((x) => x.code === "DEMANDING_UNASSIGNED")!;
      expect(w.message).toContain(open[0].number);
      expect(res.warnings.findIndex((x) => x.code === "DEMANDING_UNASSIGNED")).toBeLessThanOrEqual(1);
    }
  });

  it("Warnungen sind gebündelt: höchstens eine Zeile je Art „Stufe 1“ bzw. „offen“", () => {
    expect(res.warnings.filter((w) => w.code === "LEVEL1_DEMANDING").length).toBeLessThanOrEqual(1);
    expect(res.warnings.filter((w) => w.code === "DEMANDING_UNASSIGNED").length).toBeLessThanOrEqual(1);
  });

  it("kein Widerspruch: nie gleichzeitig „mehr Kräfte als nötig“ und „nicht vor Schichtende fertig“", () => {
    const codes = new Set(res.warnings.map((w) => w.code));
    expect(codes.has("TOO_MANY_STAFF") && codes.has("OVER_SHIFT")).toBe(false);
  });
});

describe("F4 (P4): Suiten gleichmäßig", () => {
  it("bei Engpass ist die höchste Suitenzahl je Kraft so klein wie möglich (Unterschied höchstens 1 unter Stufe 2/3)", () => {
    // 2 erfahrene Kräfte, 6 Suiten, max. 2 je Kraft → Engpass: 3 + 3 statt 4 + 2
    const suiteRooms = makeDay(60).filter((r) => r.demanding.includes("SUITE")).slice(0, 6);
    const plain = makeDay(60).filter((r) => r.demanding.length === 0).slice(0, 14);
    const r = proposePlan({ ...makeInput([...suiteRooms, ...plain], [hk("x", "VOLLZEIT", 3), hk("y", "VOLLZEIT", 2)]), maxSuites: 2 });
    const count = (id: string) => Object.entries(r.assignment).filter(([rid, h]) => h === id && isSuite(suiteRooms.concat(plain).find((x) => x.id === rid)!)).length;
    expect(Math.abs(count("x") - count("y"))).toBeLessThanOrEqual(1);
  });
});
