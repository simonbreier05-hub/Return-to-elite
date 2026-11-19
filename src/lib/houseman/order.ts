/**
 * Betrieb L2 (Punkt 9, Meeting 13.11.2026): Reihenfolge der Hausmann-Liste — offene Aufgaben zuerst; darin nach
 * Anreisezeit des Gastes (falls bekannt, früheste zuerst), sonst nach Zimmernummer. Erledigte am Ende. Rein, ohne DB —
 * Server (`getHousemanList`) und Oberfläche (`mergeHousemanItems`) nutzen dieselbe Regel.
 */
export function compareHousemanItems(a: { status: string; eta?: string | null; roomNumber: string; since?: string | null }, b: { status: string; eta?: string | null; roomNumber: string; since?: string | null }): number {
  const done = Number(a.status === "DONE") - Number(b.status === "DONE");
  if (done) return done;
  // F7 (H16): offene Aufgaben vom Vortag (aufgeschoben/überfällig) stehen oben, die älteste zuerst
  if (a.status === "OPEN" && (a.since || b.since) && a.since !== b.since) return a.since && b.since ? a.since.localeCompare(b.since) : a.since ? -1 : 1;
  const ea = a.eta ?? null, eb = b.eta ?? null;
  if (ea && eb && ea !== eb) return ea.localeCompare(eb);
  if (ea && !eb) return -1;
  if (!ea && eb) return 1;
  return a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
}
