import { afterEach, describe, expect, it } from "vitest";
import { lookup, onMissingKey, translateKey, SOURCE_DICTS } from "@/lib/i18n/core";
import { browserLanguage, fallbackChain, languageTier, normalizeLanguage } from "@/lib/i18n/languages";

describe("Rückfallkette", () => {
  let off: (() => void) | null = null;
  afterEach(() => off?.());

  it("gewählte Sprache → Englisch → Deutsch", () => {
    expect(fallbackChain("vi")).toEqual(["vi", "en", "de"]);
    expect(fallbackChain("en")).toEqual(["en", "de"]);
    expect(fallbackChain("de")).toEqual(["de", "en"]);
  });
  it("fehlt der Text in der Sprache, kommt Englisch — und der fehlende Schlüssel wird gemeldet", () => {
    const seen: string[] = [];
    off = onMissingKey((lang, key) => seen.push(`${lang}:${key}`));
    expect(lookup("pl", "common.save", { "common.cancel": "Anuluj" })).toBe(SOURCE_DICTS.en["common.save"]);
    expect(lookup("pl", "common.cancel", { "common.cancel": "Anuluj" })).toBe("Anuluj");
    expect(seen).toEqual(["pl:common.save"]);
  });
  it("leerer Text zählt als fehlend", () => {
    expect(lookup("vi", "common.save", { "common.save": "" })).toBe("Save");
  });
  it("unbekannter Schlüssel: Schlüssel selbst, gemeldet", () => {
    const seen: string[] = [];
    off = onMissingKey((_l, key) => seen.push(key));
    expect(lookup("de", "gibt.esNicht", null)).toBe("gibt.esNicht");
    expect(seen).toEqual(["gibt.esNicht"]);
  });
  it("Platzhalter werden ersetzt", () => {
    expect(translateKey("de", "attendant.floor", { floor: 3 }, null)).toBe("Etage 3");
    expect(translateKey("en", "attendant.floor", { floor: 3 }, null)).toBe("Floor 3");
  });
});

describe("Sprachcodes", () => {
  it("normalisiert und lehnt Unbekanntes ab", () => {
    expect(normalizeLanguage("de-DE")).toBe("de");
    expect(normalizeLanguage("pt_BR")).toBe("pt");
    expect(normalizeLanguage("iw")).toBe("he");
    expect(normalizeLanguage("xx")).toBeNull();
    expect(normalizeLanguage("<script>")).toBeNull();
  });
  it("Browser-Sprache: erste bekannte", () => {
    expect(browserLanguage(["xx-YY", "vi-VN", "en"])).toBe("vi");
    expect(browserLanguage([])).toBeNull();
  });
  it("Stufen", () => {
    expect(languageTier("de")).toBe("builtin");
    expect(languageTier("vi")).toBe("priority");
    expect(languageTier("pl")).toBe("runtime");
  });
});

describe("Sprachsuche", () => {
  it("findet ohne Akzente und über den englischen Namen", async () => {
    const { fold } = await import("@/components/LanguagePicker");
    const { autonym, languageNameIn } = await import("@/lib/i18n/languages");
    const hay = fold([autonym("vi"), languageNameIn("vi", "fa"), languageNameIn("vi", "en"), "vi"].join(" "));
    expect(hay).toContain(fold("viet"));
    expect(hay).toContain(fold("Tiếng Việt"));
    expect(autonym("fa")).toBe("فارسی");
  });
});
