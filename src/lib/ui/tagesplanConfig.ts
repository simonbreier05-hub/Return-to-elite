/**
 * Schwellen des Tagesplans (Plan-1) — nur Anzeige, keine Zuteilungsregel. Bewusst als Konstanten hier und nicht im UI
 * (Vorgabe Plan-1). Hauptmaß ist die **Zimmerzahl** je Kraft (Vorgabe Simon, Nov. 2026); Credits bleiben nur Anzeige.
 *
 * Die Zimmer-Spannen je Typ (Vollzeit 10–13, Teilzeit 6–9, Azubi 6–8) stehen seit Plan-1b als Hausregel in den
 * Einstellungen (`rooms{Vz|Tz|Az}{Min|Max}`, `roomBand()` in `src/lib/planung/floorTeam.ts`) — dieselben Werte wie im
 * Zuteilungsvorschlag. Hier nur noch die reinen Anzeige-Schwellen.
 */

/** Typ einer Kraft, wie ihn `/api/planung/team` als `kind` liefert. Unbekannt → Vollzeit. */
export type CrewKind = "VOLLZEIT" | "TEILZEIT" | "AZUBI";

/** ⚠ Überlast ab so vielen Zimmern über der oberen Grenze (darunter ▲ Hoch). */
export const OVERLOAD_EXTRA_ROOMS = 2;

/** Hinweis „mehr als N Etagen“ — gleicher Wert wie der Standard `autoplanMaxFloors`. */
export const MAX_FLOORS_HINT = 2;

/** „Bestätigen bis …“ im Tageskopf (Berliner Zeit, nur Anzeige). */
export const CONFIRM_BY = "08:00";
