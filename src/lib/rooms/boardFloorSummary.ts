/**
 * Kopfzeile je Etage auf dem Live-Board (H2, Schritt 8): Kurzinfos aus den Board-Feldern, rein und client-sicher.
 * Gezählt wie isHousekeepingRelevant: Abreise = isCheckoutToday, Bleiber = belegt ohne Abreise, Anreise = erwartete Anreise.
 * Fortschritt = gereinigt (CLEAN/INSPECTED) von den heute zu reinigenden Zimmern. Warnsymbol bei DND oder offenem Mangel.
 */
export interface BoardRoomLike {
  status: string;
  occupancy?: string | null;
  isCheckoutToday: boolean;
  arrivals: unknown[];
  guestDndActive?: boolean;
  blockReason?: string | null;
  defects: { workOrder?: { status: string } | null }[];
}

export function boardFloorSummary(rooms: BoardRoomLike[]) {
  const work = rooms.filter((r) => r.occupancy === "OCCUPIED" || r.isCheckoutToday);
  const done = (s: string) => s === "CLEAN" || s === "INSPECTED";
  const dnd = rooms.filter((r) => r.guestDndActive || r.blockReason === "DND").length;
  const defects = rooms.filter((r) => r.status === "DEFECT_REPORTED" || r.defects.some((d) => d.workOrder?.status !== "RESOLVED")).length;
  return {
    rooms: rooms.length,
    departures: rooms.filter((r) => r.isCheckoutToday).length,
    stayovers: rooms.filter((r) => r.occupancy === "OCCUPIED" && !r.isCheckoutToday).length,
    arrivals: rooms.filter((r) => r.arrivals.length > 0).length,
    done: work.filter((r) => done(r.status)).length,
    total: work.length,
    dnd,
    defects,
  };
}
