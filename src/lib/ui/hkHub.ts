/**
 * Housekeeper-Hub im Design „Glas & Premium“ (Paket D2): reine Ableitungen für die Anzeige —
 * Status → Symbol/Ton, Reinigungsart → Pille, Marker, Filter, Kennzahlen, „Frühe Anreisen“, „Nächste Zimmer“.
 * Kein React, keine DB, keine API: Ansicht, Demo-Seite und Tests lesen dieselbe Regel.
 *
 * Statuslogik, Credits und Zuteilung bleiben unverändert (`src/lib/rooms/hkGroups.ts`, Server) — hier wird nur
 * entschieden, WIE ein vorhandener Zustand aussieht.
 */
import type { RoomStatus } from "@/lib/domain";
import type { TKey } from "@/lib/i18n/translations";
import { hkGroupOf, type HkGroup } from "@/lib/rooms/hkGroups";
import type { MarkerKind } from "./markers";
import { STATUS_UI, uiStatusForRoom, type UiStatus } from "./status";
import type { Tone } from "./tone";

export type DayKind = "DEPARTURE" | "SAME_DAY_TURN" | "STAYOVER" | "ARRIVAL" | null;

/** Was der Hub über ein Zimmer weiß (Board-Status + Tagesliste + Priorität), auf das Nötige reduziert. */
export interface HkRoomView {
  id: string;
  number: string;
  status: RoomStatus;
  kind: DayKind;
  vip: boolean;
  laundry: boolean;
  /** Gast-DND (Gastwunsch) oder Sperre mit Grund DND. */
  dnd: boolean;
  paused: boolean;
  /** Offene Mängel (aus `/api/rooms?mine=1`). */
  defects: number;
  /** Anreisezeit „HH:MM“ (Tagesplan). */
  eta: string | null;
  /** Front Office: Zimmer wird jetzt/früh gebraucht (Priorität `needed_now`/`early_check_in`, Anreise `neededNow`). */
  early: boolean;
  /** Dringend laut Priorität (`needed_now` oder `vip`) — gleiche Regel wie der bisherige Prioritätssprung. */
  urgent: boolean;
  /** Planung L1 (Regel 9): Gastwunsch „Reinigung ab HH:MM“ — Uhrzeit wird angezeigt. */
  cleanAfter?: string | null;
}

/** Status-Anzeige einer Zeile: Pause überdeckt (ändert nie den Status), Gast-DND zeigt „DND“ an offenen Zimmern. */
export function hkRowStatus(r: Pick<HkRoomView, "status" | "paused" | "dnd">): UiStatus {
  const base = uiStatusForRoom(r.status, { paused: r.paused });
  if (base === "open" && r.dnd) return "dnd";
  return base;
}

export function hkStatusLabelKey(s: UiStatus): TKey {
  return STATUS_UI[s].labelKey;
}

/**
 * Reinigungsart → Pille (Text-Schlüssel + Ton). Ohne Tagesplan-Eintrag keine Pille. Betrieb L2 (Meeting 13.11.): Bleiber Grün,
 * Abreise Rot, Anreise Blau, Turn Blau/Rot (blaue Pille, roter Rand `edge`). Der Text steht immer dabei, nie nur Farbe.
 */
export const KIND_PILL: Record<Exclude<DayKind, null>, { labelKey: TKey; tone: Tone; edge?: Tone }> = {
  SAME_DAY_TURN: { labelKey: "hkHub.kindTurn", tone: "info", edge: "danger" },
  DEPARTURE: { labelKey: "lists.kindDEPARTURE", tone: "danger" },
  STAYOVER: { labelKey: "lists.kindSTAYOVER", tone: "success" },
  ARRIVAL: { labelKey: "lists.kindARRIVAL", tone: "info" },
};

export function kindPill(kind: DayKind): { labelKey: TKey; tone: Tone; edge?: Tone } | null {
  return kind ? KIND_PILL[kind] : null;
}

/**
 * Marker in fester Reihenfolge (wichtigstes zuerst). Der Status selbst steht schon als Symbol/Text in der Zeile —
 * darum hier kein zweites „DND“, wenn der Status bereits DND zeigt, und kein „Pause“-Marker, wenn er „Pausiert“ zeigt.
 */
export function hkMarkers(r: HkRoomView): MarkerKind[] {
  const shown = hkRowStatus(r);
  const out: MarkerKind[] = [];
  if (r.urgent || r.early) out.push("priority");
  if (r.cleanAfter) out.push("later"); // Regel 9: Uhrzeit immer sichtbar (vor den übrigen Markern)
  if (r.laundry) out.push("laundry"); // Betrieb L2: Wäschewechsel als Symbol am Bleiber — weit vorn, damit er unter den 2 sichtbaren ist
  if (r.dnd && shown !== "dnd") out.push("dnd");
  if (r.defects > 0 && shown !== "defect") out.push("defect");
  if (r.paused && shown !== "paused") out.push("pause");
  if ((r.kind === "ARRIVAL" || r.kind === "SAME_DAY_TURN") && r.eta) out.push("arrival");
  if (r.vip) out.push("vip");
  return out;
}

/** Filter der Liste — nur Arten, die der Tagesplan kennt („Tidy“ gibt es im Bestand nicht, siehe rowLabels.ts). */
export const HK_FILTERS = ["all", "turn", "departure", "stayover", "vip"] as const;
export type HkFilter = (typeof HK_FILTERS)[number];

export const FILTER_LABEL: Record<HkFilter, TKey> = {
  all: "hkHub.filterAll",
  turn: "hkHub.kindTurn",
  departure: "lists.kindDEPARTURE",
  stayover: "lists.kindSTAYOVER",
  vip: "lists.vip",
};

export function matchesFilter(r: Pick<HkRoomView, "kind" | "vip">, f: HkFilter): boolean {
  switch (f) {
    case "all": return true;
    case "turn": return r.kind === "SAME_DAY_TURN";
    case "departure": return r.kind === "DEPARTURE";
    case "stayover": return r.kind === "STAYOVER";
    case "vip": return r.vip;
  }
}

/** Zähler je Filter; „Alle“ immer, andere Filter nur, wenn es Zimmer dafür gibt (kein toter Knopf). */
export function filterCounts(rooms: Pick<HkRoomView, "kind" | "vip">[]): { filter: HkFilter; count: number }[] {
  return HK_FILTERS.map((filter) => ({ filter, count: rooms.filter((r) => matchesFilter(r, filter)).length })).filter(
    (f) => f.filter === "all" || f.count > 0,
  );
}

/**
 * Kennzahlen „Meine Zimmer / Erledigt / In Arbeit / Offen“ aus den Gruppen von `hkGroupOf` (gleiche Regel wie bisher):
 * In Arbeit = begonnen oder Nacharbeit, Offen = noch nicht begonnen (auch gesperrt/DND), ohne „heute keine Reinigung“.
 * „Meine Zimmer“/„Erledigt“ nehmen den Fortschritt der Tagesliste, wenn es ihn gibt (Server zählt).
 */
export function hkKpis(
  statuses: string[],
  progress?: { done: number; total: number } | null,
): { total: number; done: number; inProgress: number; open: number } {
  const count = (g: HkGroup) => statuses.filter((s) => hkGroupOf(s) === g).length;
  const inProgress = count("NOW");
  const open = count("NEXT");
  const done = progress ? progress.done : count("DONE");
  const total = progress ? progress.total : inProgress + open + count("DONE");
  return { total, done, inProgress, open };
}

/** „Frühe Anreisen“: noch nicht erledigte Zimmer mit Front-Office-Kennzeichen, früheste Zeit zuerst. Leer = kein Banner. */
export function earlyArrivals<T extends Pick<HkRoomView, "number" | "status" | "early" | "eta">>(rooms: T[]): { rooms: T[]; by: string | null } {
  const list = rooms
    .filter((r) => r.early && hkGroupOf(r.status) !== "DONE" && hkGroupOf(r.status) !== "OTHER")
    .sort((a, b) => (a.eta ?? "99:99").localeCompare(b.eta ?? "99:99") || a.number.localeCompare(b.number));
  const by = list.map((r) => r.eta).filter((e): e is string => !!e).sort()[0] ?? null;
  return { rooms: list, by };
}

/** Sprachkürzel für `LangChip` (z. B. „en“ → „EN“, „pt-BR“ → „PT“). Ohne Angabe nichts. */
export function langCode(lang: string | null | undefined): string | null {
  const c = (lang ?? "").trim().split(/[-_]/)[0];
  return /^[a-z]{2,3}$/i.test(c) ? c.toUpperCase() : null;
}

/**
 * Vorhandene Texte tragen teils ein Zeichen vorn („▶ Reinigung starten“, „🔧 Mangel…“). Im Glas-Design steht dort ein
 * Lucide-Symbol — darum das Zeichen nur für die Anzeige abschneiden (Texte und i18n-Schlüssel bleiben unverändert).
 */
export function withoutLeadingSymbol(label: string): string {
  return label.replace(/^[^\p{L}\p{N}]+/u, "").trim() || label;
}
