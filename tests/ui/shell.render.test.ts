import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { breakpointFor } from "@/components/shell/useBreakpoint";
import { berlinHour, firstName, greetingKey, initials } from "@/lib/ui/greeting";

const SRC = path.join(__dirname, "..", "..", "src");
const read = (f: string) => readFileSync(path.join(SRC, f), "utf8");

describe("App-Rahmen (D1)", () => {
  it("Breakpoints laut Spezifikation: < 640 Handy, 640–1279 Tablet, ab 1280 breit", () => {
    expect(breakpointFor(390)).toBe("phone");
    expect(breakpointFor(639)).toBe("phone");
    expect(breakpointFor(640)).toBe("tablet");
    expect(breakpointFor(1024)).toBe("tablet");
    expect(breakpointFor(1279)).toBe("tablet");
    expect(breakpointFor(1280)).toBe("wide");
  });
  it("Begrüßung nach Berliner Uhrzeit, Vorname und Initialen", () => {
    expect(berlinHour(new Date("2026-11-03T08:00:00Z"))).toBe(9); // Winterzeit UTC+1
    expect(greetingKey(new Date("2026-11-03T08:00:00Z"))).toBe("appShell.greetingMorning");
    expect(greetingKey(new Date("2026-11-03T12:00:00Z"))).toBe("appShell.greetingDay");
    expect(greetingKey(new Date("2026-11-03T19:00:00Z"))).toBe("appShell.greetingEvening");
    expect(firstName("Ingrid Neumann")).toBe("Ingrid");
    expect(initials("Ingrid Neumann")).toBe("IN");
    expect(initials("Maria")).toBe("MA");
    expect(initials("  ")).toBe("?");
  });
  it("Menü kommt nur aus src/lib/nav.ts (keine Menü-Listen im Rahmen)", () => {
    const nav = read("components/shell/ShellNav.tsx");
    expect(nav).toMatch(/useShellNav/);
    expect(read("components/shell/useShellNav.ts")).toMatch(/from "@\/lib\/nav"/);
    expect(read("components/AppShell.tsx")).not.toMatch(/href="\/(attendant|supervisor|chat)"/);
  });
  it("Tab-Leiste lässt Platz für Safe-Area, Inhalt hat unten genug Abstand", () => {
    expect(read("components/shell/ShellNav.tsx")).toMatch(/env\(safe-area-inset-bottom\)/);
    expect(read("components/AppShell.tsx")).toMatch(/pb-\[calc\(7rem\+env\(safe-area-inset-bottom\)\)\][^"]*sm:pb-6/);
  });
  it("Fenster: Portal, Escape, Fokus im Fenster und zurück, Schließen mit Kreuz", () => {
    const o = read("components/shell/Overlay.tsx");
    expect(o).toMatch(/createPortal/);
    expect(o).toMatch(/useEscapeKey/);
    expect(o).toMatch(/trapTab/);
    expect(o).toMatch(/before\?\.focus/);
    const d = read("components/shell/DetailContainer.tsx");
    expect(d).toMatch(/placement="inset"/);
    expect(d).toMatch(/placement="sheet"/);
    expect(d).toMatch(/t\("common\.close"\)/);
  });
  it("kein Blur, keine harten Farben im Rahmen", () => {
    for (const f of ["components/AppShell.tsx", "components/shell/ShellNav.tsx", "components/shell/Overlay.tsx", "components/shell/DetailContainer.tsx", "components/shell/GlassDialog.tsx", "components/shell/HeaderPhoto.tsx"]) {
      const s = read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(s, f).not.toMatch(/backdrop-blur|backdrop-filter|#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    }
  });
});
