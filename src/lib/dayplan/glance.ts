/**
 * Kennzahlen-Leiste von „Heute auf einen Blick“ (Duty Manager und Supervisor-Startansicht) — rein, client-sicher.
 * Abgeleitet aus denselben Daten wie bisher (Board-Zimmer, Arbeitsaufträge, Hausmann-Aufgaben); mit `floors` nur diese Etagen.
 */
export interface GlanceKpis { arrivals: number; departures: number; dnd: number; openDefects: number; openHouseTasks: number }

export function glanceKpis(input: {
  rooms: { floor: number; isCheckoutToday: boolean; status: string; blockReason?: string | null; arrivals?: unknown[] | null }[];
  workOrders: { status: string; floor?: number | null }[];
  roomTasks: { status: string; floor?: number | null }[];
  floors?: number[] | null;
}): GlanceKpis {
  const on = (floor: number | null | undefined) => !input.floors || (floor != null && input.floors.includes(floor));
  const rooms = input.rooms.filter((r) => on(r.floor));
  return {
    arrivals: rooms.reduce((n, r) => n + (r.arrivals?.length ?? 0), 0),
    departures: rooms.filter((r) => r.isCheckoutToday).length,
    dnd: rooms.filter((r) => r.status === "BLOCKED" && r.blockReason === "DND").length,
    openDefects: input.workOrders.filter((w) => w.status !== "RESOLVED" && on(w.floor)).length,
    openHouseTasks: input.roomTasks.filter((t) => t.status === "OPEN" && on(t.floor)).length,
  };
}
