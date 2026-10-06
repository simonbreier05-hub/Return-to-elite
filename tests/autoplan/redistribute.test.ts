import { describe, expect, it } from "vitest";
import { proposePlan } from "@/lib/autoplan/propose";
import { remainingMinutes, suggestionSignature, suggestRedistribution, type LiveInput } from "@/lib/autoplan/redistribute";
import { estimateSpeeds } from "@/lib/autoplan/speed";
import { AUTOPLAN_WEIGHTS } from "@/lib/autoplan/weights";
import type { PlanRoom } from "@/lib/autoplan/types";
import { makeDay, makeInput, TEAM } from "./scenario";

function live(mutate: (rooms: PlanRoom[], current: Record<string, string | null>) => void = () => {}, absentIds: string[] = []): LiveInput {
  const rooms = makeDay(94).map((r) => ({ ...r }));
  const team = TEAM();
  const plan = proposePlan(makeInput(rooms, team));
  const current = { ...plan.assignment };
  mutate(rooms, current);
  return {
    rooms, present: team.filter((h) => !absentIds.includes(h.id)), absent: team.filter((h) => absentIds.includes(h.id)), current,
    weights: { ...AUTOPLAN_WEIGHTS }, maxFloors: 2, fullTimeTarget: 14, speeds: {}, minutesPerCredit: 25, earlyFinishMinutes: 45, maxMoves: 4,
  };
}
const byId = (l: LiveInput) => new Map(l.rooms.map((r) => [r.id, r]));

describe("Umverteilung bei Ausfall", () => {
  it("verteilt genau die nicht begonnenen Zimmer der abwesenden Kraft; Begonnenes bleibt", () => {
    const l = live((rooms, cur) => { rooms.filter((r) => cur[r.id] === "c").slice(0, 3).forEach((r) => { r.state = "STARTED"; }); }, ["c"]);
    const mine = l.rooms.filter((r) => l.current[r.id] === "c");
    const s = suggestRedistribution(l).find((x) => x.kind === "ABSENT")!;
    expect(s.moves.length).toBe(mine.filter((r) => r.state === "TODO").length);
    expect(s.moves.every((m) => m.fromId === "c" && m.toId !== "c")).toBe(true);
    expect(s.notMoved.filter((n) => n.reason === "STARTED").length).toBe(3);
    const moved = new Set(s.moves.map((m) => m.roomId));
    for (const r of mine.filter((x) => x.state === "STARTED")) expect(moved.has(r.id)).toBe(false);
  });

  it("gleiche harte Regeln: Stufe 1 bekommt keine anspruchsvollen Zimmer; Etagen und Credits bleiben vernünftig", () => {
    const l = live(() => {}, ["a"]);
    const s = suggestRedistribution(l).find((x) => x.kind === "ABSENT")!;
    const rooms = byId(l);
    const level = new Map(l.present.map((h) => [h.id, h.level]));
    for (const m of s.moves) if (level.get(m.toId)! < 2) expect(rooms.get(m.roomId)!.demanding).toEqual([]);
    const after = { ...l.current };
    for (const m of s.moves) after[m.roomId] = m.toId;
    for (const h of l.present) {
      const mine = l.rooms.filter((r) => after[r.id] === h.id);
      expect(mine.reduce((a, r) => a + r.credits, 0), h.id).toBeLessThan(21);
    }
  });

  it("nur die Zimmer der abwesenden Kraft ändern sich — alle anderen Zuteilungen bleiben", () => {
    const l = live(() => {}, ["b"]);
    const s = suggestRedistribution(l).find((x) => x.kind === "ABSENT")!;
    expect(new Set(s.moves.map((m) => m.roomId))).toEqual(new Set(l.rooms.filter((r) => l.current[r.id] === "b").map((r) => r.id)));
  });

  it("kein Ausfall, keine Vorschläge", () => {
    const s = suggestRedistribution(live());
    expect(s.filter((x) => x.kind === "ABSENT")).toEqual([]);
  });
});

describe("Früher fertig", () => {
  it("wer bald fertig ist, übernimmt wenige nicht begonnene Zimmer der am stärksten belasteten Kraft", () => {
    const l = live((rooms, cur) => {
      const d = rooms.filter((r) => cur[r.id] === "d");
      d.slice(0, d.length - 1).forEach((r) => { r.state = "DONE"; }); // d hat nur noch 1 Zimmer
    });
    const s = suggestRedistribution(l).find((x) => x.kind === "EARLY_FINISH" && x.params.to === "d")!;
    expect(s).toBeTruthy();
    expect(s.moves.length).toBeGreaterThan(0);
    expect(s.moves.length).toBeLessThanOrEqual(4);
    const rooms = byId(l);
    for (const m of s.moves) {
      expect(m.toId).toBe("d");
      expect(rooms.get(m.roomId)!.state).toBe("TODO");
      expect(l.current[m.roomId]).toBe(m.fromId);
    }
    // Die Restzeit-Lücke wird kleiner
    const before = remainingMinutes(l);
    const after = { ...l.current };
    for (const m of s.moves) after[m.roomId] = m.toId;
    const l2 = { ...l, current: after };
    const rem2 = remainingMinutes(l2);
    const gap = (r: Record<string, number>) => Math.max(...Object.values(r)) - Math.min(...Object.values(r));
    expect(gap(rem2)).toBeLessThan(gap(before));
  });

  it("begonnene Zimmer werden nie als Verschiebung vorgeschlagen", () => {
    const l = live((rooms, cur) => {
      rooms.forEach((r) => { if (cur[r.id] === "d") r.state = "DONE"; else if (r.number.endsWith("5")) r.state = "STARTED"; });
    });
    const rooms = byId(l);
    for (const s of suggestRedistribution(l)) for (const m of s.moves) expect(rooms.get(m.roomId)!.state).toBe("TODO");
  });

  it("Stufe 1 bekommt auch hier keine anspruchsvollen Zimmer (g ist fast fertig)", () => {
    const l = live((rooms, cur) => { rooms.filter((r) => cur[r.id] === "g").slice(1).forEach((r) => { r.state = "DONE"; }); });
    const rooms = byId(l);
    for (const s of suggestRedistribution(l)) for (const m of s.moves) if (m.toId === "g" || m.toId === "f") expect(rooms.get(m.roomId)!.demanding).toEqual([]);
  });

  it("gleichmäßig ausgelastet: keine Umverteilung", () => {
    expect(suggestRedistribution(live()).filter((x) => x.kind === "EARLY_FINISH")).toEqual([]);
  });

  it("schnellere Kraft (aus Zeitstempeln) gilt früher als fertig", () => {
    const l = live();
    l.speeds = { a: 10 }; // a braucht nur 10 min je Credit
    const rem = remainingMinutes(l);
    expect(rem.a).toBeLessThan(rem.b);
  });
});

describe("Neuer Turn / offenes Zimmer", () => {
  it("ein offenes Zimmer wird dem günstigsten geeigneten Housekeeper vorgeschlagen", () => {
    let openId = "";
    const l = live((rooms, cur) => { const r = rooms.find((x) => x.demanding.length)!; openId = r.id; cur[r.id] = null; });
    const s = suggestRedistribution(l).find((x) => x.kind === "UNASSIGNED")!;
    expect(s.moves).toHaveLength(1);
    expect(s.moves[0]).toMatchObject({ roomId: openId, fromId: null });
    const target = l.present.find((h) => h.id === s.moves[0].toId)!;
    expect(target.level).toBeGreaterThanOrEqual(2);
  });
});

describe("Kennung abgelehnter Vorschläge", () => {
  it("gleiche Verschiebungen → gleiche Kennung; andere Lage → andere", () => {
    const a = suggestionSignature({ kind: "ABSENT", moves: [{ roomId: "1", fromId: "x", toId: "y" }, { roomId: "2", fromId: "x", toId: "z" }] });
    const b = suggestionSignature({ kind: "ABSENT", moves: [{ roomId: "2", fromId: "x", toId: "z" }, { roomId: "1", fromId: "x", toId: "y" }] });
    const c = suggestionSignature({ kind: "ABSENT", moves: [{ roomId: "1", fromId: "x", toId: "q" }, { roomId: "2", fromId: "x", toId: "z" }] });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("Geschwindigkeit aus Zeitstempeln", () => {
  const min = (m: number) => m * 60_000;
  it("Minuten je Credit je Housekeeper, gleitend; zu wenige Messwerte → kein Wert", () => {
    const ev = [
      { hkId: "a", roomId: "r1", toStatus: "IN_PROGRESS", at: min(0) }, { hkId: "a", roomId: "r1", toStatus: "CLEAN", at: min(30) },
      { hkId: "a", roomId: "r2", toStatus: "IN_PROGRESS", at: min(40) }, { hkId: "a", roomId: "r2", toStatus: "CLEAN", at: min(60) },
      { hkId: "b", roomId: "r3", toStatus: "IN_PROGRESS", at: min(0) }, { hkId: "b", roomId: "r3", toStatus: "CLEAN", at: min(25) },
    ];
    const sp = estimateSpeeds(ev, { r1: 1, r2: 1, r3: 1 }, 25);
    expect(sp.a).toBeGreaterThan(20);
    expect(sp.a).toBeLessThan(30);
    expect(sp.b).toBeUndefined();
  });
});
