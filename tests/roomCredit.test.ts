import { describe, expect, it } from "vitest";
import { computeRoomCredit } from "@/lib/rooms/roomCredit";
import { ROOM_TYPE_DEFAULT_CREDITS } from "@/lib/domain";

const credits = ROOM_TYPE_DEFAULT_CREDITS;

describe("computeRoomCredit (Plan-1b: Credit = Zimmerkategorie)", () => {
  it("Standard 1, Deluxe 1,25, Junior Suite 1,5, alle weiteren Suiten 2", () => {
    expect(computeRoomCredit({ type: "CLASSIC", credits })).toBe(1);
    expect(computeRoomCredit({ type: "SUPERIOR", credits })).toBe(1);
    expect(computeRoomCredit({ type: "DELUXE", credits })).toBe(1.25);
    expect(computeRoomCredit({ type: "JUNIOR_SUITE", credits })).toBe(1.5);
    expect(computeRoomCredit({ type: "SUITE", credits })).toBe(2);
    expect(computeRoomCredit({ type: "PENTHOUSE", credits })).toBe(2);
  });
  it("noch nicht erfasste Zimmerart zählt 1", () => {
    expect(computeRoomCredit({ type: "UNVERIFIED", credits })).toBe(1);
  });
  it("Hauswert aus den Einstellungen gewinnt", () => {
    expect(computeRoomCredit({ type: "DELUXE", credits: { ...credits, DELUXE: 1.4 } })).toBe(1.4);
  });
});
