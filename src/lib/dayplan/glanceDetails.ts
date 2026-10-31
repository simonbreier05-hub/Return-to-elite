import { isAssignedRow, isDoneStatus, isOccupiedTonight, isToClean, NOT_CLEANED_REASONS, type DayNumberRow, type DayNumbers } from "./dayNumbers";

/**
 * Detail-Listen hinter den Kacheln von „Heute auf einen Blick“ — rein, client-sicher. Dieselben Regeln wie die Zahlen
 * (`computeDayNumbers`), nur als Zimmerliste statt als Zählung: eine Kachel zeigt nie eine andere Menge als ihre Zahl.
 */
export type DayTileKey = "occupied" | "toClean" | "assigned" | "cleaned" | "open" | "laundry" | "arrivalChecks" | "notCleaned";

export interface DetailRow { id: string; number: string; floor: number | null; kind: string; status: string; assignedToId: string | null; flag?: "released" | "open" }

const byNumber = (a: { number: string }, b: { number: string }) => a.number.localeCompare(b.number, undefined, { numeric: true });
const toDetail = (r: DayNumberRow, flag?: DetailRow["flag"]): DetailRow =>
  ({ id: r.id, number: r.number, floor: r.floor ?? null, kind: r.kind, status: r.status, assignedToId: r.assignedToday ? r.assignedToId : null, ...(flag ? { flag } : {}) });

export function dayTileRows(key: DayTileKey, rows: DayNumberRow[], numbers: DayNumbers | null): DetailRow[] {
  const toClean = rows.filter((r) => isToClean(r.kind, r.status));
  const ids = (set: string[] | undefined) => { const s = new Set(set ?? []); return rows.filter((r) => s.has(r.id)); };
  let out: DetailRow[];
  switch (key) {
    case "occupied": out = rows.filter((r) => isOccupiedTonight(r.kind)).map((r) => toDetail(r)); break;
    case "toClean": out = toClean.map((r) => toDetail(r)); break;
    case "assigned": out = toClean.filter(isAssignedRow).map((r) => toDetail(r)); break;
    case "cleaned": out = toClean.filter((r) => isAssignedRow(r) && isDoneStatus(r.status)).map((r) => toDetail(r)); break;
    case "open": out = toClean.filter((r) => !isAssignedRow(r)).map((r) => toDetail(r)); break;
    case "laundry": out = ids(numbers?.laundryDue?.ids).map((r) => toDetail(r)); break;
    case "notCleaned": out = rows.filter((r) => r.kind !== "OCCUPIED" && r.status in NOT_CLEANED_REASONS).map((r) => toDetail(r)); break;
    case "arrivalChecks":
      out = rows.filter((r) => r.kind === "ARRIVAL" && !(r.status in NOT_CLEANED_REASONS))
        .map((r) => toDetail(r, r.status === "INSPECTED" ? "released" : "open"));
      break;
  }
  return out.sort(byNumber);
}

export interface FloorLine { floor: number; toClean: number; cleaned: number; open: number }

/** Kachel „Gesamtes Haus“: dieselben Zahlen je Etage (zu reinigen / gereinigt / offen). Zeilen ohne Etage entfallen. */
export function floorBreakdown(rows: DayNumberRow[]): FloorLine[] {
  const map = new Map<number, FloorLine>();
  for (const r of rows) {
    if (r.floor == null || !isToClean(r.kind, r.status)) continue;
    const line = map.get(r.floor) ?? { floor: r.floor, toClean: 0, cleaned: 0, open: 0 };
    line.toClean++;
    if (isAssignedRow(r) && isDoneStatus(r.status)) line.cleaned++;
    if (!isAssignedRow(r)) line.open++;
    map.set(r.floor, line);
  }
  return [...map.values()].sort((a, b) => a.floor - b.floor);
}
