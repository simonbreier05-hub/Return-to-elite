import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.join(__dirname, "..", "..", "src");
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const read = (f: string) => readFileSync(path.join(SRC, f), "utf8");

describe("UX-Aufräumen (Mobil 390 px)", () => {
  it("Unterseiten mit Zurück-Pfeil in der Kopfzeile haben keinen zweiten „← Live-Board“-Knopf", () => {
    for (const f of walk(SRC).filter((x) => x.endsWith("view.tsx"))) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/\.liveBoardLink"\)/);
    }
  });
  it("gemeinsame Bausteine haben mindestens 44 px Tippfläche", () => {
    expect(read("components/Collapsible.tsx")).toContain("min-h-11");
    expect(read("components/AppShell.tsx")).toContain("min-w-11");
    expect(read("components/guest/GuestLanguageSwitcher.tsx")).toContain("h-11 w-11");
    expect(read("app/globals.css")).toMatch(/\.tap\s*\{[^}]*2\.75rem/);
  });
  it("Zimmernummern-Knöpfe nutzen .tap", () => {
    for (const f of ["app/front-office/view.tsx", "app/concierge/view.tsx", "app/engineering/view.tsx"]) {
      expect(read(f), f).toMatch(/className="tap flex items-center gap-1\.5 font-serif/);
    }
  });
});
