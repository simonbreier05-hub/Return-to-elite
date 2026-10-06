import { describe, expect, it } from "vitest";
import { creditFactor } from "@/lib/rooms/stayoverCredit";
import { DEFAULT_SETTINGS } from "@/lib/domain";

describe("Credit-Faktor (eine Definition für Vorschlag und Listen)", () => {
  const s = { stayoverFactor: DEFAULT_SETTINGS.stayoverFactor, stayoverLaundryFactor: DEFAULT_SETTINGS.stayoverLaundryFactor };
  it("Standard: Bleiber normal 0,5, mit Wäschewechsel voll", () => {
    expect(creditFactor("STAYOVER", false, s)).toBe(0.5);
    expect(creditFactor("STAYOVER", true, s)).toBe(1);
  });
  it("Abreise und Turn immer voll", () => {
    expect(creditFactor("DEPARTURE", false, s)).toBe(1);
    expect(creditFactor("TURN", true, s)).toBe(1);
  });
  it("Hausregel aus den Einstellungen überschreibt", () => {
    expect(creditFactor("STAYOVER", false, { ...s, stayoverFactor: 0.6 })).toBe(0.6);
  });
});
