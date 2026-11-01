/**
 * Kennzeichnung der Zimmerzeilen (H2, Schritt 7): ein Hauptlabel je Zimmer plus kleine Zusatzmarker.
 * Reine Logik, client-sicher. Farbe kommt immer zusammen mit Icon und Text (siehe RoomRowView).
 *
 * Hauptlabel = Art des Tages (Turn > Abreise > Bleiber > Anreise). „Tidy" gibt es im Tagesplan nicht als eigene Art —
 * sobald Opera/der Tagesplan sie liefert, hier als weiteres Label ergänzen.
 */
export type MainLabel = "TURN" | "DEPARTURE" | "STAYOVER" | "ARRIVAL" | "NONE";
export type Marker = "VIP" | "DND" | "LAUNDRY" | "DEFECT" | "GUEST_WISH" | "HINT";
export type SortMode = "suggested" | "route" | "kind";

export interface LabelInput {
  kind: "DEPARTURE" | "SAME_DAY_TURN" | "STAYOVER" | "ARRIVAL" | null;
  vip: boolean;
  dnd: boolean;
  laundry: boolean;
  openDefects?: number;
  guestWish?: boolean;
  /** Feldnamen der Listen auf der neueren Linie (loadRoomRows extra): Mängel-Zähler, Wunsch-Art. */
  defects?: number;
  wish?: string | null;
  hints?: { id: string; body: string }[];
  routeOrder?: number | null;
  number: string;
}

export function mainLabel(kind: LabelInput["kind"]): MainLabel {
  return kind === "SAME_DAY_TURN" ? "TURN" : kind ?? "NONE";
}

/** Zusatzmarker in fester Reihenfolge (wichtigstes zuerst). */
export function markers(r: LabelInput): Marker[] {
  const out: Marker[] = [];
  if (r.vip) out.push("VIP");
  if (r.dnd) out.push("DND");
  if (r.laundry) out.push("LAUNDRY");
  if (Math.max(r.openDefects ?? 0, r.defects ?? 0) > 0) out.push("DEFECT");
  if (r.guestWish || !!r.wish) out.push("GUEST_WISH");
  if ((r.hints?.length ?? 0) > 0) out.push("HINT");
  return out;
}

/** Reihenfolge der Gruppen „nach Art" — Turns zuerst (höchste Dringlichkeit). */
export const LABEL_ORDER: MainLabel[] = ["TURN", "DEPARTURE", "STAYOVER", "ARRIVAL", "NONE"];

const route = (r: LabelInput) => r.routeOrder ?? Number.POSITIVE_INFINITY;
const byRoute = (a: LabelInput, b: LabelInput) => route(a) - route(b) || a.number.localeCompare(b.number);

/**
 * Sortierung (nur Anzeige, ändert keine Route):
 *  - suggested (Standard): Turns, dann VIP, dann Route
 *  - route: reine Laufplan-Reihenfolge
 *  - kind: nach Hauptlabel gruppiert, innerhalb Route
 */
export function sortRows<T extends LabelInput>(rows: T[], mode: SortMode): T[] {
  const list = [...rows];
  if (mode === "route") return list.sort(byRoute);
  if (mode === "kind") return list.sort((a, b) => LABEL_ORDER.indexOf(mainLabel(a.kind)) - LABEL_ORDER.indexOf(mainLabel(b.kind)) || byRoute(a, b));
  const rank = (r: LabelInput) => (mainLabel(r.kind) === "TURN" ? 0 : r.vip ? 1 : 2);
  return list.sort((a, b) => rank(a) - rank(b) || byRoute(a, b));
}

/** Gruppen für die Ansicht „nach Art" (leere Gruppen fallen weg). */
export function groupByLabel<T extends LabelInput>(rows: T[]): { label: MainLabel; rows: T[] }[] {
  return LABEL_ORDER.map((label) => ({ label, rows: sortRows(rows.filter((r) => mainLabel(r.kind) === label), "route") })).filter((g) => g.rows.length > 0);
}

/** Etagen-Kopfzeile (Schritt 8): Kurzinfos je Etage aus denselben Zeilen. */
export interface FloorSummaryInput { status: string; kind: LabelInput["kind"]; credits: number; dnd: boolean; openDefects?: number }
export function floorSummary(rows: FloorSummaryInput[]) {
  const work = rows.filter((r) => r.kind && r.kind !== "ARRIVAL");
  const done = (s: string) => s === "CLEAN" || s === "INSPECTED";
  return {
    rooms: rows.length,
    departures: rows.filter((r) => r.kind === "DEPARTURE" || r.kind === "SAME_DAY_TURN").length,
    stayovers: rows.filter((r) => r.kind === "STAYOVER").length,
    arrivals: rows.filter((r) => r.kind === "ARRIVAL" || r.kind === "SAME_DAY_TURN").length,
    credits: Math.round(rows.reduce((a, r) => a + r.credits, 0) * 10) / 10,
    done: work.filter((r) => done(r.status)).length,
    total: work.length,
    warn: rows.some((r) => r.dnd || (r.openDefects ?? 0) > 0),
  };
}
