import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROLES, roleHome } from "@/lib/domain";
import { translate } from "@/lib/i18n/translations";
import { ICONS } from "@/lib/ui/icons";
import { MAX_TABS, MISSING_IN_STOCK, NAV, activeEntryId, navFor, tabsFor } from "@/lib/nav";

const APP = path.join(__dirname, "..", "..", "src", "app");
const pageFile = (href: string) => path.join(APP, href, "page.tsx");
/** Rollen, die `requirePage([...])` der Seite zulässt (duty_manager kommt immer durch). */
function allowedRoles(href: string): string[] | "all" {
  const src = readFileSync(pageFile(href), "utf8");
  if (/requirePage\(\[\.\.\.ROLES\]\)/.test(src)) return "all";
  const m = src.match(/requirePage\(\[([\s\S]*?)\]\)/);
  if (!m) throw new Error(`${href}: kein requirePage gefunden`);
  return [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
}

describe("Menü je Rolle (src/lib/nav.ts)", () => {
  it("jede Rolle hat ein Menü, der erste Punkt ist ihre Startseite", () => {
    for (const r of ROLES) {
      expect(NAV[r].length, r).toBeGreaterThan(0);
      expect(NAV[r][0].href, r).toBe(roleHome(r));
    }
  });
  it("nur Routen aus dem Bestand, die die Rolle öffnen darf (Rechte unverändert)", () => {
    for (const r of ROLES) {
      for (const e of NAV[r]) {
        expect(existsSync(pageFile(e.href)), `${r}: ${e.href} existiert`).toBe(true);
        const allowed = allowedRoles(e.href);
        if (r === "duty_manager" || allowed === "all") continue;
        expect(allowed, `${r} darf ${e.href}`).toContain(r);
      }
    }
  });
  it("eindeutige Ids, Symbole aus der Liste, Texte übersetzt, eindeutige Handy-Rangfolge", () => {
    for (const r of ROLES) {
      const ids = NAV[r].map((e) => e.id);
      expect(new Set(ids).size, r).toBe(ids.length);
      const ranks = NAV[r].map((e) => e.mobileRank);
      expect(new Set(ranks).size, r).toBe(ranks.length);
      for (const e of NAV[r]) {
        expect(ICONS[e.icon], `${r}.${e.id}`).toBeDefined();
        expect(translate("de", e.labelKey)).not.toBe(e.labelKey);
      }
    }
  });
  it("Tab-Leiste: höchstens vier Punkte, Rest unter „Mehr“, nichts geht verloren", () => {
    for (const r of ROLES) {
      const { tabs, more } = tabsFor(r);
      expect(tabs.length + (more.length ? 1 : 0), r).toBeLessThanOrEqual(MAX_TABS);
      expect([...tabs, ...more].map((e) => e.id).sort()).toEqual(navFor(r).map((e) => e.id).sort());
      expect(tabs[0].href).toBe(roleHome(r));
    }
    expect(tabsFor("supervisor").tabs.map((e) => e.id)).toEqual(["overview", "planning", "rooms"]);
    expect(tabsFor("room_attendant").more).toEqual([]);
  });
  it("aktiver Punkt: Unterseiten zählen zum passenden Eintrag, längster Treffer gewinnt", () => {
    expect(activeEntryId("supervisor", "/supervisor")).toBe("overview");
    expect(activeEntryId("supervisor", "/supervisor/handover")).toBe("handover");
    expect(activeEntryId("supervisor", "/supervisor/unbekannt")).toBe("overview");
    expect(activeEntryId("room_attendant", "/chat")).toBe("messages");
    expect(activeEntryId("room_attendant", "/attendantx")).toBe(null);
    expect(navFor("guest")).toEqual([]);
  });
  it("Hausmann sieht keinen Grundriss (Seite ist für ihn nicht freigegeben)", () => {
    expect(navFor("houseman").some((e) => e.href === "/floor-plan")).toBe(false);
  });
  it("fehlende Punkte der Spezifikation sind dokumentiert", () => {
    expect(MISSING_IN_STOCK.supervisor).toContain("Team");
  });
});
