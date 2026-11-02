/**
 * Zimmerkachel im Grundriss (docs/design/glass-spec.md, Abschnitt 7): Zustand → Symbol, Ton, Text.
 * Reine Daten + Ableitung aus `roomDayCategory()` (keine eigene Tageslogik).
 */
import type { TKey } from "@/lib/i18n/translations";
import type { RoomDayCategory } from "@/lib/rooms/roomDayCategory";
import type { IconName } from "./icons";

export const TILE_STATES = ["empty", "occupied", "departure", "arrival", "stayover", "dnd"] as const;
export type TileState = (typeof TILE_STATES)[number];

/** Textfarbe des Symbols: gedämpft/sekundär oder ein Status-Ton. */
export type TileTone = "muted" | "secondary" | "accent" | "info" | "success" | "danger";

export interface TileUi {
  icon: IconName;
  tone: TileTone;
  labelKey: TKey;
  /** Leere Kacheln ohne Glas, nur feiner Rand (Figma `29:554`). */
  glass: boolean;
}

export const TILE_UI: Record<TileState, TileUi> = {
  empty: { icon: "circle", tone: "muted", labelKey: "ui.tile.empty", glass: false },
  occupied: { icon: "user", tone: "secondary", labelKey: "ui.tile.occupied", glass: true },
  departure: { icon: "log-out", tone: "accent", labelKey: "ui.tile.departure", glass: true },
  arrival: { icon: "log-in", tone: "info", labelKey: "ui.tile.arrival", glass: true },
  stayover: { icon: "bed-single", tone: "success", labelKey: "ui.tile.stayover", glass: true },
  dnd: { icon: "moon", tone: "danger", labelKey: "ui.tile.dnd", glass: true },
};

/** Text für den Goldrahmen 2 px = „noch nicht zugeteilt“. */
export const TILE_UNASSIGNED_KEY: TKey = "ui.tile.unassigned";

/** Jede Tages-Kategorie des Bestands (`RoomDayCategory`) → Kachelzustand. */
export const CATEGORY_TILE: Record<RoomDayCategory, TileState> = {
  DND: "dnd",
  SAME_DAY_TURN: "departure", // Turn = Abreise mit Anreise am selben Tag; Abreise bestimmt die Arbeit
  DEPARTURE: "departure",
  ARRIVAL: "arrival",
  STAYOVER: "stayover",
  NONE: "empty",
};

/** Kachelzustand; NONE + belegt (ohne Tagesereignis) = „Belegt“. */
export function tileStateFor(category: RoomDayCategory, occupied = false): TileState {
  if (category === "NONE" && occupied) return "occupied";
  return CATEGORY_TILE[category];
}
