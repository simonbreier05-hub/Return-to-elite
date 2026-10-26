/**
 * Die eine Zahlenquelle für den Arbeitstag (Planungshub → Tagesplan). Jede Kachel und jede Ansicht — Grundriss,
 * Duty-Manager-Board, Planungstool — liest diese Funktion; es gibt keine zweite Zählung.
 *
 * Mengen (immer ineinander enthalten, daher gilt gereinigt ≤ zugeteilt ≤ zu reinigen ≤ belegt ≤ Inventar):
 *  - zu reinigen: alle Zimmer des Tagesplans mit Abreise, Same-Day-Turn oder Bleiber (außer außer Betrieb/Opt-out)
 *  - zugeteilt:   zu reinigen UND (heute einer Kraft zugeteilt/begonnen ODER schon fertig)
 *  - gereinigt:   zugeteilt UND Status CLEAN/INSPECTED
 *  - offen:       zu reinigen − zugeteilt
 *  - belegt:      zu reinigen ∪ nicht gereinigte Betriebszimmer ∪ laut Board belegte Zimmer
 * Rein, ohne Datenbank — client-sicher.
 */
export type DayKind = "DEPARTURE" | "TURN" | "STAYOVER" | "ARRIVAL";

export interface DayNumberRow {
  id: string;
  number: string;
  kind: DayKind;
  /** Wäschewechsel laut Tagesplan (nur Bleiber; aus Anreisedatum/Wechseldatum, siehe derive.ts). */
  laundryDue: boolean;
  /** Anzahl Nächte bekannt (Datengrundlage für den Wäschewechsel vorhanden). */
  nightsKnown: boolean;
  status: string;
  /** Laut Board belegt (Room.occupancy). */
  occupied: boolean;
  assignedToId: string | null;
  /** Zuteilung gilt heute (assignedOn = heute) oder das Zimmer ist begonnen. */
  assignedToday: boolean;
}

/** Diese Zustände werden nicht gereinigt: sie stehen als eigene Zahl mit Grund da, nie still weggelassen. */
export const NOT_CLEANED_REASONS = { OUT_OF_ORDER: "outOfOrder", OUT_OF_SERVICE: "outOfService", GREEN_OPT_OUT: "optOut" } as const;
type Reason = (typeof NOT_CLEANED_REASONS)[keyof typeof NOT_CLEANED_REASONS];
const DONE = new Set(["CLEAN", "INSPECTED"]);

export interface DayNumbers {
  inventory: number;
  occupied: number;
  toClean: number;
  assigned: number;
  cleaned: number;
  open: number;
  openIds: string[];
  /** Zimmer mit Service, die nicht gereinigt werden, nach Grund. */
  notCleaned: { total: number; byReason: Record<Reason, number>; ids: string[] };
  byKind: { DEPARTURE: number; TURN: number; STAYOVER: number };
  /** `null` = keine Datengrundlage → Kachel entfällt. */
  laundryDue: { count: number; ids: string[] } | null;
  /** Zuteilungen an Kräfte außerhalb der gewählten Mannschaft (nur wenn `team` übergeben wurde). */
  outsideTeam: number;
}

export function computeDayNumbers(input: { rows: DayNumberRow[]; inventory: number; team?: string[] | null }): DayNumbers {
  const service = input.rows.filter((r) => r.kind !== "ARRIVAL");
  const skip = (r: DayNumberRow) => r.status in NOT_CLEANED_REASONS;
  const toCleanRows = service.filter((r) => !skip(r));
  const notCleanedRows = service.filter(skip);
  const isAssigned = (r: DayNumberRow) => DONE.has(r.status) || (!!r.assignedToId && r.assignedToday);
  const assignedRows = toCleanRows.filter(isAssigned);
  const openRows = toCleanRows.filter((r) => !isAssigned(r));
  const byReason: Record<Reason, number> = { outOfOrder: 0, outOfService: 0, optOut: 0 };
  for (const r of notCleanedRows) byReason[NOT_CLEANED_REASONS[r.status as keyof typeof NOT_CLEANED_REASONS]]++;

  const occupiedIds = new Set(input.rows.filter((r) => r.occupied).map((r) => r.id));
  for (const r of service) occupiedIds.add(r.id);
  const withData = toCleanRows.filter((r) => r.kind === "STAYOVER" && r.nightsKnown);
  const team = input.team ? new Set(input.team) : null;
  const toClean = toCleanRows.length, assigned = assignedRows.length;
  const cleaned = assignedRows.filter((r) => DONE.has(r.status)).length;
  return {
    inventory: input.inventory,
    occupied: occupiedIds.size,
    toClean, assigned, cleaned, open: toClean - assigned, openIds: openRows.map((r) => r.id),
    notCleaned: { total: notCleanedRows.length, byReason, ids: notCleanedRows.map((r) => r.id) },
    byKind: {
      DEPARTURE: toCleanRows.filter((r) => r.kind === "DEPARTURE").length,
      TURN: toCleanRows.filter((r) => r.kind === "TURN").length,
      STAYOVER: toCleanRows.filter((r) => r.kind === "STAYOVER").length,
    },
    laundryDue: withData.length ? { count: withData.filter((r) => r.laundryDue).length, ids: withData.filter((r) => r.laundryDue).map((r) => r.id) } : null,
    outsideTeam: team ? assignedRows.filter((r) => r.assignedToId && !DONE.has(r.status) && !team.has(r.assignedToId)).length : 0,
  };
}

/** Zusicherung der Kachelregel (auch für Tests und Laufzeit-Prüfung in der Entwicklung). */
export function numbersConsistent(n: DayNumbers): boolean {
  return n.cleaned <= n.assigned && n.assigned <= n.toClean && n.toClean <= n.occupied && n.open === n.toClean - n.assigned;
}
