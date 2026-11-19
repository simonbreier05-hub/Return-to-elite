/**
 * F7 (M21, Regel P9): „cleaning after 13:00“ / „clean after 1pm“ / „Reinigung ab 13 Uhr“ in einem offenen Opera-Hinweis
 * (Trace) zählt wie der Gastwunsch „Reinigung ab HH:MM“. Liefert „HH:MM“ oder null. Rein.
 */
const CLEAN_AFTER = /(?:clean(?:ing)?\s+after|reinigung\s+ab)\s+(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|uhr)?/i;

export function cleanAfterFromTraces(traces: { text: string; status?: string }[]): string | null {
  for (const t of traces) {
    if (t.status === "DONE") continue;
    const m = CLEAN_AFTER.exec(t.text);
    if (!m) continue;
    let h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    if (m[3]?.toLowerCase() === "pm" && h < 12) h += 12;
    if (h > 23 || min > 59) continue;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  return null;
}
