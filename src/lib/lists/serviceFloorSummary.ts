import { needsCleaning, type ServiceRoom } from "./serviceOverview";

/**
 * Kopfzeile je Etage in „Zimmer und Service heute" (H2, Schritt 8): Kurzinfos aus denselben Zeilen wie die Liste,
 * rein und client-sicher. Turn zählt bei Abreisen und bei Anreisen, aber nur einmal bei den Zimmern.
 * Fortschritt = erledigte von den heute zu reinigenden Zimmern (`needsCleaning`, dieselbe Regel wie die Tageszahlen).
 */
export function serviceFloorSummary(rooms: Pick<ServiceRoom, "service" | "status" | "done" | "credits" | "dnd">[]) {
  const work = rooms.filter((r) => needsCleaning(r.service, r.status) || r.done);
  return {
    rooms: rooms.length,
    departures: rooms.filter((r) => r.service === "DEPARTURE" || r.service === "TURN").length,
    stayovers: rooms.filter((r) => r.service === "STAYOVER" || r.service === "STAYOVER_LINEN").length,
    arrivals: rooms.filter((r) => r.service === "ARRIVAL" || r.service === "TURN").length,
    credits: Math.round(rooms.reduce((a, r) => a + r.credits, 0) * 10) / 10,
    done: work.filter((r) => r.done).length,
    total: work.length,
    dnd: rooms.filter((r) => r.dnd).length,
  };
}
