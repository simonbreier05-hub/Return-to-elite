/**
 * Schwellen des Tagesplans (Plan-1) — nur Anzeige, keine Zuteilungsregel. Bewusst als Konstanten hier und nicht im UI
 * (Vorgabe Plan-1). Hauptmaß ist die **Zimmerzahl** je Kraft (Vorgabe Simon, Nov. 2026); Credits bleiben nur Anzeige.
 *
 * Achtung: Der Zuteilungsvorschlag (`src/lib/autoplan/`, Settings `rooms{Vz|Tz}{1..3}{Min|Max}`) rechnet noch mit Spannen
 * je Typ UND Stufe. Die Angleichung an diese Spannen ist Teil von Plan-1b — bis dahin können Anzeige und Vorschlag um
 * ein, zwei Zimmer voneinander abweichen.
 */

/** Typ einer Kraft, wie ihn `/api/planung/team` als `kind` liefert. Unbekannt → Vollzeit. */
export type CrewKind = "VOLLZEIT" | "TEILZEIT" | "AZUBI";

/** Zimmer je Kraft: innerhalb = ✓ Ausgewogen, darunter ▼ Niedrig, darüber ▲ Hoch. */
export const ROOM_BANDS: Record<CrewKind, { lo: number; hi: number }> = {
  VOLLZEIT: { lo: 10, hi: 13 },
  TEILZEIT: { lo: 6, hi: 9 },
  AZUBI: { lo: 6, hi: 8 },
};

/** ⚠ Überlast ab so vielen Zimmern über der oberen Grenze (darunter ▲ Hoch). */
export const OVERLOAD_EXTRA_ROOMS = 2;

/** Hinweis „mehr als N Etagen“ — gleicher Wert wie der Standard `autoplanMaxFloors`. */
export const MAX_FLOORS_HINT = 2;

/** „Bestätigen bis …“ im Tageskopf (Berliner Zeit, nur Anzeige). */
export const CONFIRM_BY = "08:00";
