/**
 * Morgendlicher Zimmerstatus aus dem Planungshub: Grundzustand ist „sauber" (INSPECTED); „schmutzig" (DIRTY) sind
 * nur Zimmer, die nachweislich belegt sind oder waren — Abreise, Turn, Bleiber (laut Tagesplan) oder in der
 * In-House-Liste. Reine Logik ohne DB (Aufrufer: `applyDayPlanToBoard`).
 *
 * Was heute schon jemand angefasst hat, bleibt unberührt. „Angefasst" heißt: Der Status wurde nach unserer letzten
 * Setzung geändert (Marker `[Status, statusSince]` je Zimmer) bzw. — ohne Marker — `statusSince` liegt am Betriebstag.
 * So bleibt ein Nachimport am selben Tag möglich (Zimmer, die neu abreisen, werden schmutzig), ohne Arbeit zu überschreiben.
 */
export type StatusMarker = Record<string, [status: string, since: string]>;

export interface BoardRoom { id: string; status: string; statusSince: Date }

/** Diese Zustände setzt der Hub nie: Zimmer ist aus dem Verkauf bzw. bewusst ungeputzt. */
const KEEP = new Set(["OUT_OF_ORDER", "OUT_OF_SERVICE"]);

export function planBoardStatus(input: { rooms: BoardRoom[]; needsCleaning: Set<string>; marker: StatusMarker; dayStart: Date }) {
  const updates: { id: string; status: "DIRTY" | "INSPECTED" }[] = [];
  const marker: StatusMarker = {};
  for (const r of input.rooms) {
    if (KEEP.has(r.status)) continue;
    const m = input.marker[r.id];
    const untouched = m ? m[0] === r.status && m[1] === r.statusSince.toISOString() : r.statusSince < input.dayStart;
    if (!untouched) continue; // heute schon bearbeitet
    const target = input.needsCleaning.has(r.id) ? "DIRTY" : "INSPECTED";
    if (r.status !== target) updates.push({ id: r.id, status: target });
    else marker[r.id] = [r.status, r.statusSince.toISOString()]; // unverändert: Marker mit dem vorhandenen Stand
  }
  return { updates, marker };
}
