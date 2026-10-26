import { describe, expect, it } from "vitest";
import { NetworkError } from "@/components/api";
import { IMPORT_TYPES } from "@/lib/domain";
import { appliedSlots, listsReady } from "@/lib/planung/model";
import { errorText, inOrder } from "@/components/planung/useImportSession";

const full = Object.fromEntries(IMPORT_TYPES.map((t) => [t, { businessDate: "2026-09-22", appliedAt: "x", rows: 1 }]));

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
    const before = appliedSlots(IMPORT_TYPES, {}, []);
    expect(listsReady(before)).toBe(false);
    // nach dem Übernehmen: Stand neu geladen, Karten „applied"
    const items = IMPORT_TYPES.map((t) => ({ type: t, phase: "applied" }));
    expect(listsReady(appliedSlots(IMPORT_TYPES, full, items))).toBe(true);
    // auch wenn der Stand-Abruf noch aussteht, zählen die gerade übernommenen Karten
    expect(listsReady(appliedSlots(IMPORT_TYPES, null, items))).toBe(true);
  });

  it("nach dem Löschen gilt die Liste sofort wieder als fehlend", () => {
    const { TRACES: _gone, ...rest } = full;
    const items = IMPORT_TYPES.map((t) => ({ type: t, phase: t === "TRACES" ? "discarded" : "applied" }));
    const slots = appliedSlots(IMPORT_TYPES, rest, items);
    expect(slots.TRACES).toBe(false);
    expect(listsReady(slots)).toBe(false);
  });

  it("Fehler werden verständlich gemeldet, nie leer", () => {
    expect(errorText(new NetworkError())).toMatch(/Keine Verbindung/);
    expect(errorText(new Error("Kritische Befunde: nichts wird übernommen."))).toMatch(/Kritische Befunde/);
    expect(errorText(undefined)).toMatch(/erneut versuchen/);
  });
});
