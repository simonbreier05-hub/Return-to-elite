/**
 * Pillen-Ton (docs/design/glass-spec.md, Abschnitt 7): Kennzeichen → Ton. Reine Daten.
 * Seiten übersetzen den Text selbst (vorhandene i18n-Schlüssel), hier steht nur der Ton.
 */
import type { RoomDayCategory } from "@/lib/rooms/roomDayCategory";
import type { Tone } from "./tone";

export const PILL_KINDS = [
  "turn",
  "vip",
  "trace",
  "tidy",
  "standard",
  "stayover",
  "guest",
  "arrival",
  "housekeeping",
  "urgent",
  "confirmed",
  "recognized",
  "done",
  "excursionOpen",
  "dueBy",
] as const;
export type PillKind = (typeof PILL_KINDS)[number];

export const PILL_TONE: Record<PillKind, Tone> = {
  turn: "accent",
  vip: "accent",
  trace: "accent",
  tidy: "neutral",
  standard: "neutral",
  stayover: "info",
  guest: "info",
  arrival: "info",
  housekeeping: "info",
  urgent: "danger",
  confirmed: "success",
  recognized: "success",
  done: "success",
  excursionOpen: "warning", // „Offen“ beim Ausflug
  dueBy: "warning", // z. B. „bis 08:00“
};

/** Unbekannte Kennzeichen sind neutral. */
export function pillTone(kind: string): Tone {
  return (PILL_TONE as Record<string, Tone>)[kind] ?? "neutral";
}

/** Reinigungsart aus der Tages-Kategorie (Bestand `roomDayCategory`) → Pillen-Ton. Betrieb L2: wie `KIND_PILL` (Turn: Rand rot). */
export const CATEGORY_PILL_TONE: Record<RoomDayCategory, Tone> = {
  SAME_DAY_TURN: "info",
  DEPARTURE: "danger",
  STAYOVER: "success",
  ARRIVAL: "info",
  DND: "danger",
  NONE: "neutral",
};
