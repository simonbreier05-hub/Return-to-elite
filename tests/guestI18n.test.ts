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

describe("F7 (M14): Sprachen wie die App", () => {
  const keysOf = (o: unknown, p = ""): string[] =>
    o && typeof o === "object" ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => keysOf(v, p ? `${p}.${k}` : k)) : [p];
  it("jede Sprache hat alle Schlüssel, keiner leer", async () => {
    const mod = await import("@/lib/guestI18n/translations");
    const enKeys = keysOf((await import("@/lib/guestI18n/extraLocales")).it); // Form = en (per Typ erzwungen)
    for (const l of mod.GUEST_LOCALES) for (const k of enKeys) {
      const v = mod.translateGuest(l, k as never);
      expect(v, `${l}:${k}`).not.toBe(k);
      expect(v.trim().length, `${l}:${k}`).toBeGreaterThan(0);
    }
  });
  it("Auswahl: Gerätesprache (Region abgeschnitten), dann Opera-Gastsprache, sonst Englisch", async () => {
    const { pickGuestLocale } = await import("@/lib/guestI18n/translations");
    expect(pickGuestLocale(["it-IT", "en-US"], "de")).toBe("it");
    expect(pickGuestLocale(["fr-FR"], "tr")).toBe("tr");
    expect(pickGuestLocale(["fr-FR", "es"], null)).toBe("en");
    expect(pickGuestLocale(["en-US"], "de")).toBe("en");
  });
  it("Persisch wird rechts nach links gesetzt", async () => {
    const { GUEST_RTL } = await import("@/lib/guestI18n/translations");
    expect(GUEST_RTL).toContain("fa");
  });
});
