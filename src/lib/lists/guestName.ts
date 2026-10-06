import { parseGuestName } from "@/lib/import/names";

/**
 * Gastname für Arbeitslisten: „[Anrede] [Titel] Nachname" — nie Vornamen.
 * Importierte Aufenthalte speichern den Namen schon so (`Stay.guestName`, `Arrival.guestName` mit source IMPORT).
 * Von Hand angelegte Einträge können volle Namen enthalten und werden hier auf Nachname (+ Anrede/Titel) gekürzt.
 */
export function shortGuestName(raw: string | null | undefined, source: string | null | undefined = "MANUAL"): string | null {
  const clean = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!clean || clean === "—") return null;
  if (source === "IMPORT" && !clean.includes(",")) return clean;
  const g = parseGuestName(clean);
  return [g.salutation, g.title, g.lastName].filter(Boolean).join(" ") || null;
}

/** Zeitangaben („14:00", „9.30") aus einem Trace-Text — nur wenn vorhanden. */
export function timesInText(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g)) out.push(`${m[1].padStart(2, "0")}:${m[2]}`);
  return [...new Set(out)];
}
