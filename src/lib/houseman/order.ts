/**
 * Betrieb L2 (Punkt 9, Meeting 13.11.2026): Reihenfolge der Hausmann-Liste — offene Aufgaben zuerst; darin nach
 * Anreisezeit des Gastes (falls bekannt, früheste zuerst), sonst nach Zimmernummer. Erledigte am Ende. Rein, ohne DB —
 * Server (`getHousemanList`) und Oberfläche (`mergeHousemanItems`) nutzen dieselbe Regel.
 */
export function compareHousemanItems(a: { status: string; eta?: string | null; roomNumber: string }, b: { status: string; eta?: string | null; roomNumber: string }): number {
  const done = Number(a.status === "DONE") - Number(b.status === "DONE");
  if (done) return done;
  const ea = a.eta ?? null, eb = b.eta ?? null;
  if (ea && eb && ea !== eb) return ea.localeCompare(eb);
  if (ea && !eb) return -1;
  if (!ea && eb) return 1;
  return a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
}
