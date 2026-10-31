/**
 * Kennzahlen-Leiste von „Heute auf einen Blick“ (Duty Manager und Supervisor-Startansicht) — rein, client-sicher.
 * Abgeleitet aus denselben Daten wie bisher (Board-Zimmer, Arbeitsaufträge, Hausmann-Aufgaben); mit `floors` nur diese Etagen.
 */
export interface GlanceRoom {
  id?: string;
  number?: string;
  floor: number;
  isCheckoutToday: boolean;
  status: string;
  blockReason?: string | null;
  arrivals?: unknown[] | null;
  /** Offener Gast-Wunsch „Bitte nicht stören“ (GuestRequest DND) — nie Room.status. */
  guestDndActive?: boolean;
}

export interface GlanceKpis {
  arrivals: number;
  departures: number;
  /** Vom Personal gemeldetes DND (BLOCKED + Grund DND) — die bisherige Duty-Manager-Kachel. */
  dnd: number;
  openDefects: number;
  openHouseTasks: number;
  /** Tagesfortschritt — dieselbe Rechnung wie die frühere Supervisor-Kachel (`dailyProgress`). */
  progress: DailyProgress;
  /** Kachel „DND/Blockiert“ (Supervisor): DND-Zimmer und übrige blockierte Zimmer, ohne Doppelzählung. */
  dndBlocked: { dnd: number; blocked: number };
}

export interface DailyProgress { inspected: number; sellable: number; percent: number }

const onFloors = (floors: number[] | null | undefined) => (floor: number | null | undefined) =>
  !floors || (floor != null && floors.includes(floor));

/**
 * Tagesfortschritt in Prozent: freigegebene (INSPECTED) von verkaufbaren Zimmern (alles außer außer Betrieb/außer Service).
 * Unverändert übernommen aus der früheren Kachel „Tagesfortschritt“ der Supervisor-Ansicht.
 */
export function dailyProgress(rooms: Pick<GlanceRoom, "status">[]): DailyProgress {
  const inspected = rooms.filter((r) => r.status === "INSPECTED").length;
  const sellable = rooms.filter((r) => !["OUT_OF_ORDER", "OUT_OF_SERVICE"].includes(r.status)).length;
  return { inspected, sellable, percent: sellable ? Math.round((inspected / sellable) * 100) : 0 };
}

export interface DndEntry { id: string; number: string; floor: number; source: "GUEST" | "STAFF" | "BOTH" }
export interface BlockedEntry { id: string; number: string; floor: number; reason: string | null }

/**
 * Kachel „DND/Blockiert“: Regeln
 *  - DND-Zimmer = Gast hat „Bitte nicht stören“ offen ODER Status BLOCKED mit Grund DND (Quelle wird angezeigt).
 *  - Blockierte Zimmer = Status BLOCKED mit anderem/ohne Grund — ein DND-Zimmer steht nie zusätzlich bei „blockiert“.
 * Mit `floors` nur diese Etagen; sortiert nach Zimmernummer.
 */
export function dndBlockedSummary(rooms: GlanceRoom[], floors?: number[] | null): { dnd: DndEntry[]; blocked: BlockedEntry[] } {
  const on = onFloors(floors);
  const dnd: DndEntry[] = [];
  const blocked: BlockedEntry[] = [];
  for (const r of rooms) {
    if (!on(r.floor)) continue;
    const staffDnd = r.status === "BLOCKED" && r.blockReason === "DND";
    const base = { id: r.id ?? r.number ?? "", number: r.number ?? "", floor: r.floor };
    if (staffDnd || r.guestDndActive) dnd.push({ ...base, source: staffDnd && r.guestDndActive ? "BOTH" : staffDnd ? "STAFF" : "GUEST" });
    else if (r.status === "BLOCKED") blocked.push({ ...base, reason: r.blockReason ?? null });
  }
  const byNumber = (a: { number: string }, b: { number: string }) => a.number.localeCompare(b.number, undefined, { numeric: true });
  return { dnd: dnd.sort(byNumber), blocked: blocked.sort(byNumber) };
}

export function glanceKpis(input: {
  rooms: GlanceRoom[];
  workOrders: { status: string; floor?: number | null }[];
  roomTasks: { status: string; floor?: number | null }[];
  floors?: number[] | null;
}): GlanceKpis {
  const on = onFloors(input.floors);
  const rooms = input.rooms.filter((r) => on(r.floor));
  const summary = dndBlockedSummary(rooms);
  return {
    arrivals: rooms.reduce((n, r) => n + (r.arrivals?.length ?? 0), 0),
    departures: rooms.filter((r) => r.isCheckoutToday).length,
    dnd: rooms.filter((r) => r.status === "BLOCKED" && r.blockReason === "DND").length,
    openDefects: input.workOrders.filter((w) => w.status !== "RESOLVED" && on(w.floor)).length,
    openHouseTasks: input.roomTasks.filter((t) => t.status === "OPEN" && on(t.floor)).length,
    progress: dailyProgress(rooms),
    dndBlocked: { dnd: summary.dnd.length, blocked: summary.blocked.length },
  };
}
