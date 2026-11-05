import { describe, expect, it } from "vitest";
import { sanitizeLegalUrl } from "@/lib/guestLegalLinks";

describe("sanitizeLegalUrl (Datenschutz/Impressum auf dem Gäste-Screen)", () => {
  it("lässt https/http und eigene Pfade durch", () => {
    expect(sanitizeLegalUrl("https://example.org/datenschutz")).toBe("https://example.org/datenschutz");
    expect(sanitizeLegalUrl(" http://example.org/impressum ")).toBe("http://example.org/impressum");
    expect(sanitizeLegalUrl("/impressum")).toBe("/impressum");
  });
  it("leer oder gefährlich = kein Link", () => {
    expect(sanitizeLegalUrl("")).toBeNull();
    expect(sanitizeLegalUrl(null)).toBeNull();
    expect(sanitizeLegalUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeLegalUrl("//evil.example")).toBeNull();
    expect(sanitizeLegalUrl("kein link")).toBeNull();
  });
});
