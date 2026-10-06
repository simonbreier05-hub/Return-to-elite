import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Typ und Stufe der Housekeeper sind Beschäftigtendaten: nur Supervisor/Duty Manager, nie Housekeeper, nie in Logs. */
const ROOT = path.join(__dirname, "..", "..", "src");
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const FIELD = /\b(hkLevel|hkType|homeFloors|dailyTarget)\b/;

// Dateien, die diese Felder bewusst kennen (alle hinter requireRole(["supervisor"]) bzw. reine Rechenlogik)
const ALLOWED = [
  "lib/autoplan/", "app/api/autoplan/", "app/api/housekeepers/", "app/api/redistribution/", "app/api/internal/redistribution-check/",
  "components/AutoPlanPanel", "components/HousekeeperSettingsPanel", "components/RedistributionCards", "app/settings/view.tsx",
];

describe("Beschäftigtendaten (Typ, Stufe)", () => {
  it("kommen nur in freigegebenen Dateien vor", () => {
    const hits = walk(ROOT).filter((f) => /\.(ts|tsx)$/.test(f)).filter((f) => FIELD.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(ROOT, f).replace(/\\/g, "/")).filter((rel) => !ALLOWED.some((a) => rel.startsWith(a)));
    expect(hits).toEqual([]);
  });

  it("die freigegebenen API-Routen sind auf Supervisor/Duty Manager beschränkt", () => {
    const routes = walk(path.join(ROOT, "app", "api")).filter((f) => f.endsWith("route.ts"))
      .filter((f) => /api\/(autoplan|housekeepers|redistribution)\//.test(f.replace(/\\/g, "/")) || /api\/(autoplan|housekeepers|redistribution)\/route\.ts$/.test(f.replace(/\\/g, "/")));
    expect(routes.length).toBeGreaterThan(5);
    for (const r of routes) expect(readFileSync(r, "utf8"), r).toMatch(/requireRole\(\["supervisor"\]\)/);
  });

  it("Auswahl der Benutzerfelder in den Hub-APIs enthält Typ/Stufe nicht", () => {
    const rooms = readFileSync(path.join(ROOT, "app/api/rooms/route.ts"), "utf8");
    expect(rooms).not.toMatch(FIELD);
    const me = readFileSync(path.join(ROOT, "app/api/auth/me/route.ts"), "utf8");
    expect(me).not.toMatch(FIELD);
  });
});
