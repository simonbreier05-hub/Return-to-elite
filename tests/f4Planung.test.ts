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
  it("Stufe 1 bekommt anspruchsvolle Zimmer nur aus dem Überhang (Simon 19.11.) — dann mit Warnung ganz oben", () => {
    const relaxed = new Set(res.warnings.find((w) => w.code === "LEVEL_RULE_RELAXED")?.roomIds ?? []);
    for (const [roomId, hkId] of Object.entries(res.assignment)) {
      if (hkId && level.get(hkId) === 1 && byId.get(roomId)!.demanding.length) expect(relaxed.has(roomId), `${hkId}:${byId.get(roomId)!.number}`).toBe(true);
    }
    if (relaxed.size) expect(res.warnings.findIndex((x) => x.code === "LEVEL_RULE_RELAXED")).toBeLessThanOrEqual(1);
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

  it("Warnungen sind gebündelt: höchstens eine Zeile je Kraft und Art „Stufe 1“ bzw. eine Zeile „offen“", () => {
    const l1 = res.warnings.filter((w) => w.code === "LEVEL1_DEMANDING");
    expect(new Set(l1.map((w) => `${w.hkId}|${w.message.split(":")[0]}`)).size).toBe(l1.length);
    expect(res.warnings.filter((w) => w.code === "DEMANDING_UNASSIGNED").length).toBeLessThanOrEqual(1);
  });

  it("kein Widerspruch: nie gleichzeitig „mehr Kräfte als nötig“ und „nicht vor Schichtende fertig“", () => {
    const codes = new Set(res.warnings.map((w) => w.code));
    expect(codes.has("TOO_MANY_STAFF") && codes.has("OVER_SHIFT")).toBe(false);
  });
});

describe("F4 Kapazität (Entscheidung Simon 19.11.): Stufen-Regel nur, solange die passenden Kräfte es schaffen", () => {
  // Extremfall aus dem Review: 5 Kräfte, nur eine ab Stufe 2, alle Suiten des Testhauses — vorher bekam sie alle
  const suites = makeDay(94).filter((r) => r.demanding.includes("SUITE")).slice(0, 27);
  const plain = makeDay(94).filter((r) => r.demanding.length === 0).slice(0, 25);
  const five = [hk("m", "VOLLZEIT", 3), hk("p", "VOLLZEIT", 1), hk("l", "VOLLZEIT", 1), hk("i", "VOLLZEIT", 1), hk("j", "VOLLZEIT", 1)];
  const r = proposePlan(makeInput([...suites, ...plain], five));
  const mine = (id: string) => Object.values(r.assignment).filter((h) => h === id).length;

  it("die eine passende Kraft bleibt in ihrer Zimmervorgabe (höchstens 13), der Rest geht an die anderen", () => {
    expect(mine("m")).toBeLessThanOrEqual(13);
    expect(r.unassigned).toEqual([]);
    const level1Suites = suites.filter((s) => r.assignment[s.id] !== "m");
    expect(level1Suites.length).toBeGreaterThanOrEqual(suites.length - 13);
    expect(suites.length).toBeGreaterThan(13); // Szenario muss den Überhang wirklich erzeugen
  });

  it("deutliche Warnung ganz oben und je Stufe-1-Kraft eine Zeile mit Zimmernummern", () => {
    const top = r.warnings.findIndex((w) => w.code === "LEVEL_RULE_RELAXED");
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top).toBeLessThanOrEqual(1);
    expect(r.warnings[top].message).toContain("Stufe 1");
    const l1 = r.warnings.filter((w) => w.code === "LEVEL1_DEMANDING" && w.message.includes("nicht reicht"));
    expect(l1.length).toBeGreaterThan(0);
    for (const w of l1) expect(["p", "l", "i", "j"]).toContain(w.hkId);
  });

  it("reicht die Kapazität, bleibt alles wie bisher: kein Überhang, Stufe 1 ohne anspruchsvolle Zimmer", () => {
    const few = proposePlan(makeInput([...suites.slice(0, 8), ...plain], five));
    expect(few.warnings.some((w) => w.code === "LEVEL_RULE_RELAXED")).toBe(false);
    for (const s of suites.slice(0, 8)) expect(few.assignment[s.id]).toBe("m");
  });

  it("„keine Suiten“ bleibt hart, auch im Überhang", () => {
    const noSuite = [hk("m", "VOLLZEIT", 3), hk("p", "VOLLZEIT", 1, { restrictions: ["NO_SUITE"] }), hk("l", "VOLLZEIT", 1)];
    const x = proposePlan(makeInput([...suites.slice(0, 20), ...plain.slice(0, 10)], noSuite));
    for (const s of suites.slice(0, 20)) expect(x.assignment[s.id], s.number).not.toBe("p");
  });
});

describe("Simon 20.11.: Zimmeranzahl überwiegt auch „keine Suiten“", () => {
  it("reicht niemand ohne „keine Suiten“, bekommt die Kraft mit Einschränkung den Überhang — mit Warnung, nichts offen", () => {
    const suites = makeDay(94).filter((r) => r.demanding.includes("SUITE")).slice(0, 18);
    const team = [hk("m", "VOLLZEIT", 3), hk("p", "VOLLZEIT", 3, { restrictions: ["NO_SUITE"] })];
    const r = proposePlan(makeInput(suites, team));
    expect(r.unassigned).toEqual([]);
    expect(Object.values(r.assignment).filter((h) => h === "m").length).toBeLessThanOrEqual(13);
    expect(r.warnings.some((w) => w.code === "RESTRICTION" && w.hkId === "p")).toBe(true);
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

describe("F4: Suite nach Zimmertyp, auch mit Credit-Schwelle", () => {
  it("„keine Suiten“ bekommt keine Suite, auch wenn deren Credit unter der Schwelle liegt", () => {
    const suites = makeDay(60).filter((r) => r.demanding.includes("SUITE")).slice(0, 4).map((r) => ({ ...r, credits: 1 }));
    const plain = makeDay(60).filter((r) => r.demanding.length === 0).slice(0, 10);
    const r = proposePlan({ ...makeInput([...suites, ...plain], [hk("x", "VOLLZEIT", 3), hk("y", "VOLLZEIT", 2, { restrictions: ["NO_SUITE"] })]), maxSuites: 2, suiteMinCredit: 1.5 });
    for (const s of suites) expect(r.assignment[s.id], s.number).not.toBe("y");
  });
});

