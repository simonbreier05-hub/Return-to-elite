import { describe, expect, it } from "vitest";
import { shortGuestName, timesInText } from "@/lib/lists/guestName";

describe("Gastname in Arbeitslisten", () => {
  it("importierter Name bleibt Anrede Titel Nachname", () => {
    expect(shortGuestName("Herr Dr. Krüger", "IMPORT")).toBe("Herr Dr. Krüger");
    expect(shortGuestName("Mr. Smith", "IMPORT")).toBe("Mr. Smith");
  });
  it("ohne Anrede nur der Nachname", () => {
    expect(shortGuestName("Meier", "IMPORT")).toBe("Meier");
  });
  it("von Hand erfasste volle Namen werden gekürzt — nie Vornamen", () => {
    expect(shortGuestName("Klaus Müller", "MANUAL")).toBe("Müller");
    expect(shortGuestName("Frau Anna Schmidt", "MANUAL")).toBe("Frau Schmidt");
    expect(shortGuestName("Dr. Peter Weber", "MANUAL")).toBe("Dr. Weber");
    expect(shortGuestName("Mrs. Jane Doe", undefined)).toBe("Mrs. Doe");
  });
  it("Schreibweise Nachname, Vorname wird erkannt", () => {
    expect(shortGuestName("Krüger, Hans Herr", "MANUAL")).toBe("Herr Krüger");
  });
  it("leer oder Platzhalter → kein Name", () => {
    expect(shortGuestName("", "IMPORT")).toBeNull();
    expect(shortGuestName("—", "IMPORT")).toBeNull();
    expect(shortGuestName(null)).toBeNull();
  });
});

describe("Zeitangaben im Trace-Text", () => {
  it("findet Uhrzeiten, sonst leer", () => {
    expect(timesInText("Twinbett bis 14:00 bitte, Rückbau 9.30")).toEqual(["14:00", "09:30"]);
    expect(timesInText("Zusatzbett")).toEqual([]);
  });
});
