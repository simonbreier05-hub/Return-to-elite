import { describe, expect, it } from "vitest";
import { berlinToUtc } from "@/lib/dayplan/time";
import { isPurgeDue, latestScheduledPurge } from "@/lib/guestDataPurge";

describe("Nachtlöschung: Zeitplan und Nachholen", () => {
  const at = (iso: string) => new Date(iso);
  // Oktober 2026: Berlin = UTC+2 (Sommerzeit bis 25.10.), 22:00 Berlin = 20:00 UTC
  it("letzter geplanter Zeitpunkt: heute 22:00, solange es schon später ist, sonst gestern 22:00", () => {
    expect(latestScheduledPurge(at("2026-10-06T21:00:00Z"), 22)).toEqual(berlinToUtc("2026-10-06", "22:00"));
    expect(latestScheduledPurge(at("2026-10-06T21:00:00Z"), 22).toISOString()).toBe("2026-10-06T20:00:00.000Z");
    expect(latestScheduledPurge(at("2026-10-06T10:00:00Z"), 22).toISOString()).toBe("2026-10-05T20:00:00.000Z");
  });
  it("Winterzeit: 22:00 Berlin = 21:00 UTC", () => {
    expect(latestScheduledPurge(at("2026-12-01T23:00:00Z"), 22).toISOString()).toBe("2026-12-01T21:00:00.000Z");
  });
  it("vor 22:00 und gestern gelaufen → nicht fällig", () => {
    expect(isPurgeDue(at("2026-10-06T10:00:00Z"), at("2026-10-05T20:05:00Z"), 22)).toBe(false);
  });
  it("nach 22:00 und noch nicht gelaufen → fällig; danach nicht mehr (idempotent)", () => {
    expect(isPurgeDue(at("2026-10-06T20:10:00Z"), at("2026-10-05T20:05:00Z"), 22)).toBe(true);
    expect(isPurgeDue(at("2026-10-06T20:30:00Z"), at("2026-10-06T20:11:00Z"), 22)).toBe(false);
  });
  it("Ausfall: Server war über Nacht aus → am Morgen wird nachgeholt", () => {
    expect(isPurgeDue(at("2026-10-07T06:00:00Z"), at("2026-10-05T20:05:00Z"), 22)).toBe(true);
  });
  it("noch nie gelaufen → fällig", () => {
    expect(isPurgeDue(at("2026-10-06T10:00:00Z"), null, 22)).toBe(true);
  });
  it("Stunde 0 (Mitternacht) ist zulässig", () => {
    expect(latestScheduledPurge(at("2026-10-06T10:00:00Z"), 0).toISOString()).toBe("2026-10-05T22:00:00.000Z");
  });
});
