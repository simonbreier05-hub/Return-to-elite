/**
 * Die eine Zahlenquelle für den Arbeitstag (Planungshub → Tagesplan). Jede Kachel und jede Ansicht — Grundriss,
 * Duty-Manager-Board, Planungstool, „Zimmer und Service heute“, Entwurf — liest diese Funktion bzw. ihre
 * Regeln `isToClean`/`isOccupiedTonight`; es gibt keine zweite Zählung.
 *
 * Mengen:
 *  - zu reinigen: alle Abreisen und Same-Day-Turns, alle Bleiber (immer), dazu Anreisen in noch nicht gereinigte
 *                 Zimmer — außer außer Betrieb/außer Service/Opt-out
 *  - zugeteilt:   zu reinigen UND (heute einer Kraft zugeteilt/begonnen ODER schon fertig)
 *  - gereinigt:   zugeteilt UND Status CLEAN/INSPECTED
 *  - offen:       zu reinigen − zugeteilt
 *  - belegt:      heute Nacht belegt = Bleiber + Anreisen (inkl. Turns) + laut Board belegte Zimmer ohne Tagesplan —
 *                 dieselbe Zahl wie „Total Occ.“ im Opera-Forecast (Abreise-Zimmer sind heute Nacht frei)
 *  - Anreisen prüfen: Anreise-Zimmer ohne Abreise; freigegeben = INSPECTED (Supervisor hat geprüft). Sie werden nicht
 *                 gereinigt, wenn sie sauber sind, aber vor der Anreise geprüft — darum ist belegt − zu reinigen ≠ 0 möglich.
 * Es gilt gereinigt ≤ zugeteilt ≤ zu reinigen; „belegt“ ist eine eigene Zahl (≤ Inventar).
 * Rein, ohne Datenbank — client-sicher.
 */
/**
 * `OCCUPIED` = laut Board belegt, aber ohne Eintrag im Tagesplan (z. B. vom Front Office) — zählt nur als belegt.
 * `CARRYOVER` (F1, K1) = Rest vom Vortag: gestern nicht fertig, heute ohne eigenen Grund im Plan — Reinigung wie Abreise.
 * `EXTRA` (F1, K3) = ohne Tagesplan-Eintrag, aber heute einer Kraft zugeteilt und nicht fertig — zählt als zu reinigen.
 */
export type DayKind = "DEPARTURE" | "TURN" | "STAYOVER" | "ARRIVAL" | "CARRYOVER" | "EXTRA" | "OCCUPIED";

/** DayRoomPlan.cleaningType → Art der Tageszahlen (eine Zuordnung für alle Lader). */
export const PLAN_KIND: Record<string, DayKind> = { DEPARTURE: "DEPARTURE", SAME_DAY_TURN: "TURN", STAYOVER: "STAYOVER", ARRIVAL: "ARRIVAL", CARRYOVER: "CARRYOVER" };

/**
 * K3: Art eines Zimmers ohne Tagesplan-Eintrag — heute zugeteilt und nicht fertig → `EXTRA` (zu reinigen, Credits nach Zimmertyp),
 * sonst keine Art. Eine Regel für Tageszahlen und Listen.
 */
export function unplannedKind(r: { status: string; assignedToId: string | null; assignedToday: boolean }): "EXTRA" | null {
  return r.assignedToId && r.assignedToday && !DONE.has(r.status) && !(r.status in NOT_CLEANED_REASONS) ? "EXTRA" : null;
}

export interface DayNumberRow {
  id: string;
  number: string;
  /** Etage des Zimmers (für die Etagen-Zahlen eines Supervisors, `rowsOnFloors`). */
  floor?: number;
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

/**
 * Wird das Zimmer heute gereinigt? Bleiber immer; eine Anreise nur, wenn das Zimmer noch nicht fertig ist. Rest vom Vortag und
 * Zusatz-Zimmer: solange nicht fertig (gestern gereinigt, aber ungeprüft = nur Prüfung). Grund-Zustände siehe NOT_CLEANED_REASONS.
 */
export function isToClean(kind: DayKind | null | undefined, status: string): boolean {
  if (!kind || kind === "OCCUPIED" || status in NOT_CLEANED_REASONS) return false;
  return kind === "ARRIVAL" || kind === "CARRYOVER" || kind === "EXTRA" ? !DONE.has(status) : true;
}
/** Heute Nacht belegt (Forecast „Total Occ.“): Bleiber, Turns, Anreisen — Abreise-Zimmer nicht. Rest/Zusatz: laut Board. */
export const isOccupiedTonight = (kind: DayKind | null | undefined, boardOccupied = false) =>
  kind === "STAYOVER" || kind === "TURN" || kind === "ARRIVAL" || kind === "OCCUPIED" || ((kind === "CARRYOVER" || kind === "EXTRA") && boardOccupied);

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
  byKind: { DEPARTURE: number; TURN: number; STAYOVER: number; ARRIVAL: number; CARRYOVER: number; EXTRA: number };
  /** `null` = keine Datengrundlage → Kachel entfällt. */
  laundryDue: { count: number; ids: string[] } | null;
  /** Anreise-Zimmer zur Prüfung durch den Supervisor (ohne außer Betrieb); freigegeben = INSPECTED. */
  arrivalChecks: { total: number; released: number; openIds: string[] };
  /** Zuteilungen an Kräfte außerhalb der gewählten Mannschaft (nur wenn `team` übergeben wurde). */
  outsideTeam: number;
  /** Schon fertig, aber heute keiner Kraft zugeteilt (z. B. von jemand anderem erledigt) — Teilmenge von `assigned`. */
  doneUnassigned: number;
}

/** Zählt als „zugeteilt“: schon fertig, oder heute einer Kraft zugeteilt/begonnen (auch für die Detail-Listen der Kacheln). */
export const isAssignedRow = (r: Pick<DayNumberRow, "status" | "assignedToId" | "assignedToday">) => DONE.has(r.status) || (!!r.assignedToId && r.assignedToday);
/** Status „gereinigt“ (CLEAN/INSPECTED). */
export const isDoneStatus = (status: string) => DONE.has(status);

export function computeDayNumbers(input: { rows: DayNumberRow[]; inventory: number; team?: string[] | null }): DayNumbers {
  // K3: Zeilen ohne Art (kein Tagesplan-Eintrag), die heute zugeteilt und nicht fertig sind, zählen als „Zusatz“ (zu reinigen)
  const rows = input.rows.map((r) => (r.kind ? r : { ...r, kind: (unplannedKind(r) ?? r.kind) as DayKind }));
  const toCleanRows = rows.filter((r) => isToClean(r.kind, r.status));
  const notCleanedRows = rows.filter((r) => r.kind && r.kind !== "OCCUPIED" && r.status in NOT_CLEANED_REASONS);
  const isAssigned = isAssignedRow;
  const assignedRows = toCleanRows.filter(isAssigned);
  const openRows = toCleanRows.filter((r) => !isAssigned(r));
  const byReason: Record<Reason, number> = { outOfOrder: 0, outOfService: 0, optOut: 0 };
  for (const r of notCleanedRows) byReason[NOT_CLEANED_REASONS[r.status as keyof typeof NOT_CLEANED_REASONS]]++;

  const occupiedIds = new Set(rows.filter((r) => isOccupiedTonight(r.kind, r.occupied)).map((r) => r.id));
  const withData = toCleanRows.filter((r) => r.kind === "STAYOVER" && r.nightsKnown);
  const team = input.team ? new Set(input.team) : null;
  const toClean = toCleanRows.length, assigned = assignedRows.length;
  const cleaned = assignedRows.filter((r) => DONE.has(r.status)).length;
  const kindCount = (k: DayKind) => toCleanRows.filter((r) => r.kind === k).length;
  const arrivalRows = rows.filter((r) => r.kind === "ARRIVAL" && !(r.status in NOT_CLEANED_REASONS));
  return {
    inventory: input.inventory,
    occupied: occupiedIds.size,
    toClean, assigned, cleaned, open: toClean - assigned, openIds: openRows.map((r) => r.id),
    notCleaned: { total: notCleanedRows.length, byReason, ids: notCleanedRows.map((r) => r.id) },
    byKind: { DEPARTURE: kindCount("DEPARTURE"), TURN: kindCount("TURN"), STAYOVER: kindCount("STAYOVER"), ARRIVAL: kindCount("ARRIVAL"), CARRYOVER: kindCount("CARRYOVER"), EXTRA: kindCount("EXTRA") },
    laundryDue: withData.length ? { count: withData.filter((r) => r.laundryDue).length, ids: withData.filter((r) => r.laundryDue).map((r) => r.id) } : null,
    arrivalChecks: { total: arrivalRows.length, released: arrivalRows.filter((r) => r.status === "INSPECTED").length, openIds: arrivalRows.filter((r) => r.status !== "INSPECTED").map((r) => r.id) },
    doneUnassigned: assignedRows.filter((r) => DONE.has(r.status) && !(r.assignedToId && r.assignedToday)).length,
    outsideTeam: team ? assignedRows.filter((r) => r.assignedToId && !DONE.has(r.status) && !team.has(r.assignedToId)).length : 0,
  };
}

/**
 * Dieselben Zahlen, nur für bestimmte Etagen (Supervisor-Startansicht): dieselben Zeilen, dieselbe Zählung, nur gefiltert.
 * `inventory` ist dann die Zimmerzahl dieser Etagen. Zeilen ohne Etage zählen nie zu einer Etage.
 */
export function rowsOnFloors(rows: DayNumberRow[], floors: number[]): DayNumberRow[] {
  const set = new Set(floors);
  return rows.filter((r) => r.floor != null && set.has(r.floor));
}

/**
 * Tagesplanung „ganze Etage einer Kraft zuteilen“: die heute zu reinigenden Zimmer einer Etage (dieselbe Regel `isToClean`),
 * mit dem aktuellen Status aus dem Live-Board (`statusOf`). Zugeteilt wird danach wie jede Mehrfachauswahl (bulk-assign).
 */
export function toCleanOnFloor(rows: DayNumberRow[], floor: number, statusOf: (id: string) => string | undefined = () => undefined): DayNumberRow[] {
  return rows.filter((r) => (r.floor ?? Number(r.number.slice(0, 1))) === floor && isToClean(r.kind, statusOf(r.id) ?? r.status));
}

/** Zusicherung der Kachelregel (auch für Tests und Laufzeit-Prüfung in der Entwicklung). */
export function numbersConsistent(n: DayNumbers): boolean {
  return n.cleaned <= n.assigned && n.assigned <= n.toClean && n.occupied <= n.inventory && n.open === n.toClean - n.assigned;
}
