import { describe, expect, it } from "vitest";
import { NetworkError } from "@/components/api";
import { IMPORT_TYPES } from "@/lib/domain";
import { planningAllowed } from "@/lib/import/readiness";
import { errorText, inOrder } from "@/components/planung/useImportSession";

const D = "2026-09-22";
const full = Object.fromEntries(IMPORT_TYPES.map((t) => [t, { businessDate: D }]));

describe("Einlesen aktualisiert den Hub ohne Reload", () => {
  it("übernimmt nacheinander — nie zwei Listen gleichzeitig (parallele Übernahmen liefen in DB-Timeouts)", async () => {
    let inFlight = 0, max = 0;
    const order: string[] = [];
    await inOrder([...IMPORT_TYPES], async (t) => {
      inFlight++; max = Math.max(max, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      order.push(t); inFlight--;
    });
    expect(max).toBe(1);
    expect(order).toEqual([...IMPORT_TYPES]);
  });

  it("frisch geladener Stand öffnet das Gate in derselben Sitzung (kein Verlassen/Wiedereintreten nötig)", () => {
    // vorher: nichts übernommen; nach dem Übernehmen wird der Stand neu geladen (await loadStatus) → Gate offen
    expect(planningAllowed({}, D)).toBe(false);
    expect(planningAllowed(full, D)).toBe(true);
  });

  it("nach dem Löschen gilt die Liste sofort wieder als fehlend", () => {
    const { TRACES: _gone, ...rest } = full;
    expect(planningAllowed(rest, D)).toBe(false);
  });

  it("Fehler werden verständlich gemeldet, nie leer", () => {
    expect(errorText(new NetworkError())).toMatch(/Keine Verbindung/);
    expect(errorText(new Error("Kritische Befunde: nichts wird übernommen."))).toMatch(/Kritische Befunde/);
    expect(errorText(undefined)).toMatch(/erneut versuchen/);
  });
});
