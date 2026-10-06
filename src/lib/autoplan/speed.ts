/**
 * Arbeitsgeschwindigkeit je Housekeeper (Minuten pro Credit) aus den heutigen Statuswechseln:
 * Zeit zwischen "in Arbeit" und "sauber" je Zimmer ÷ Credits des Zimmers, gleitender Wert
 * (neuere Zimmer zählen mehr). Ohne Namen; nur IDs. Zu wenige Messwerte → Standardwert.
 */
export interface StatusEvent { hkId: string; roomId: string; toStatus: string; at: number }

const MIN_SAMPLES = 2;
const ALPHA = 0.4;
const CLAMP: [number, number] = [8, 90];

export function estimateSpeeds(events: StatusEvent[], creditsByRoom: Record<string, number>, defaultMinPerCredit: number): Record<string, number> {
  const byKey = new Map<string, StatusEvent[]>();
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    const k = `${e.hkId}|${e.roomId}`;
    byKey.set(k, [...(byKey.get(k) ?? []), e]);
  }
  const samples = new Map<string, { at: number; minPerCredit: number }[]>();
  for (const [key, list] of byKey) {
    const [hkId, roomId] = key.split("|");
    const credits = creditsByRoom[roomId];
    if (!credits) continue;
    let start: number | null = null;
    for (const e of list) {
      if (e.toStatus === "IN_PROGRESS") start = e.at;
      else if (e.toStatus === "CLEAN" && start !== null) {
        const min = (e.at - start) / 60_000;
        if (min > 1 && min < 240) samples.set(hkId, [...(samples.get(hkId) ?? []), { at: e.at, minPerCredit: min / credits }]);
        start = null;
      }
    }
  }
  const out: Record<string, number> = {};
  for (const [hkId, list] of samples) {
    if (list.length < MIN_SAMPLES) continue;
    list.sort((a, b) => a.at - b.at);
    let ema = list[0].minPerCredit;
    for (const s of list.slice(1)) ema = ALPHA * s.minPerCredit + (1 - ALPHA) * ema;
    out[hkId] = Math.min(CLAMP[1], Math.max(CLAMP[0], ema));
  }
  return out;
}

export const speedOf = (speeds: Record<string, number>, hkId: string, fallback: number) => speeds[hkId] ?? fallback;
