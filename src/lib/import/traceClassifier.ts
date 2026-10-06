import type { RoomTaskType } from "@/lib/domain";

/**
 * Wandelt einen Opera-Trace-Text in eine Hausmann-Aufgabe (RoomTask) um,
 * wenn es um Bettenkonfiguration geht: Twin-Betten (aufbauen / zurückbauen)
 * oder Zusatzbett. Alles andere bleibt ein normaler Trace (null).
 *
 * Erkennung nur über den Freitext (DE/EN) — die Opera-Codes sind je Hotel
 * verschieden. Ein zusätzliches Zusatzbett hat keinen eigenen RoomTaskType,
 * es wird als SONSTIGES mit der festen Notiz EXTRA_BED_NOTE angelegt.
 */
export const EXTRA_BED_NOTE = "Extra bed";

export interface TraceTaskSuggestion {
  type: RoomTaskType;
  note?: string;
}

// Reihenfolge ist wichtig: "Twin zurück auf King" muss vor "Twin" geprüft werden.
const TWIN_REVERT = [
  /twin.*(back|revert)/i,
  /(back|revert).*(king|queen|double)/i,
  /(twin|getrennte).*zur(ü|ue)ck/i,
  /zur(ü|ue)ck.*(doppel|king|queen)/i,
];
const TWIN_SETUP = [/\btwin/i, /getrennte[nr]?\s+betten/i, /zwei\s+einzelbetten/i];
const EXTRA_BED = [
  /extra[\s-]*beds?\b/i,
  /rollaway|roll-away/i,
  /zustellbett/i,
  /baby[\s-]*cot|babybett|kinderbett/i,
];

export function classifyTraceText(text: string): TraceTaskSuggestion | null {
  if (TWIN_REVERT.some((re) => re.test(text))) return { type: "TWIN_REVERT" };
  if (TWIN_SETUP.some((re) => re.test(text))) return { type: "TWIN_SETUP" };
  if (EXTRA_BED.some((re) => re.test(text))) return { type: "SONSTIGES", note: EXTRA_BED_NOTE };
  return null;
}
