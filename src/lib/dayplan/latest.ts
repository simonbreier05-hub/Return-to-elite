import { berlinToday } from "@/lib/import/businessDay";

/**
 * Tag, mit dem Board, Listen, Haus-Ansicht und Zuteilung arbeiten: immer der Betriebstag (Berlin heute).
 * Früher „Tag der zuletzt übernommenen Departures" — das ließ Ansichten still mit dem Stand von gestern laufen.
 * Ohne Tagesplan für heute bleiben die Ansichten leer (Hinweis „Listen im Planungshub einlesen"), siehe `hubDay`.
 */
export async function latestPlanDate(): Promise<string> {
  return berlinToday();
}
