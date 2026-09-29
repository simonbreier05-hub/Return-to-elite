import { describe, expect, it } from "vitest";
import { translateGuest, isGuestLocale, GUEST_LOCALES } from "@/lib/guestI18n/translations";

describe("translateGuest", () => {
  it("resolves a nested key for each locale", () => {
    expect(translateGuest("en", "tiles.dnd.title")).toBe("Do Not Disturb");
    expect(translateGuest("de", "tiles.dnd.title")).toBe("Bitte nicht stören");
  });

  it("interpolates {{var}} placeholders", () => {
    expect(translateGuest("en", "header.room", { number: "412" })).toBe("ROOM 412");
    expect(translateGuest("de", "header.floor", { floor: 3 })).toBe("Etage 3");
  });

  it("falls back to the key itself for an unknown path, rather than throwing", () => {
    // @ts-expect-error — deliberately an invalid key, to check the runtime fallback
    expect(translateGuest("en", "nope.not.a.key")).toBe("nope.not.a.key");
  });
});

describe("isGuestLocale", () => {
  it("accepts every configured locale", () => {
    for (const l of GUEST_LOCALES) expect(isGuestLocale(l)).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isGuestLocale("fr")).toBe(false);
    expect(isGuestLocale("")).toBe(false);
  });
});
