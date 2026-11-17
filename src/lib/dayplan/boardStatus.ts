/**
 * Morgendlicher Zimmerstatus aus dem Planungshub: Grundzustand ist „sauber" (INSPECTED); „schmutzig" (DIRTY) sind
 * nur Zimmer, die nachweislich belegt sind oder waren — Abreise, Turn, Bleiber (laut Tagesplan) oder in der
 * In-House-Liste. Anreise-Zimmer, die nicht gereinigt werden müssen, werden „sauber, Prüfung offen" (CLEAN): Der Supervisor
 * prüft sie vor der Anreise und gibt sie frei (INSPECTED). Reine Logik ohne DB (Aufrufer: `applyDayPlanToBoard`).
 *
 * Was heute schon jemand angefasst hat, bleibt unberührt. „Angefasst" heißt: Der Status wurde nach unserer letzten
 * Setzung geändert (Marker `[Status, statusSince]` je Zimmer) bzw. — ohne Marker — `statusSince` liegt am Betriebstag.
 * So bleibt ein Nachimport am selben Tag möglich (Zimmer, die neu abreisen, werden schmutzig), ohne Arbeit zu überschreiben.
 *
 * F1 (Befund K1, Entscheidung Frage 3): Ein Zimmer wird nur „geprüft“ (INSPECTED), wenn es schon fertig war. War es gestern
 * nicht fertig (DIRTY, IN_PROGRESS, PICKUP, BLOCKED, DEFECT_REPORTED), bleibt es DIRTY; war es gereinigt, aber nicht geprüft
 * (CLEAN), bleibt es CLEAN. Solche Zimmer ohne eigenen Grund im heutigen Plan sind „Rest vom Vortag“ (`carryover`).
 */
export type StatusMarker = Record<string, [status: string, since: string]>;

export interface BoardRoom { id: string; status: string; statusSince: Date }

/** Diese Zustände setzt der Hub nie: Zimmer ist aus dem Verkauf bzw. bewusst ungeputzt. */
const KEEP = new Set(["OUT_OF_ORDER", "OUT_OF_SERVICE"]);
/** Gestern nicht fertig geworden → bleibt heute schmutzig (nie „geprüft“). */
export const LEFTOVER_DIRTY = new Set(["DIRTY", "IN_PROGRESS", "PICKUP", "BLOCKED", "DEFECT_REPORTED"]);

export function planBoardStatus(input: { rooms: BoardRoom[]; needsCleaning: Set<string>; needsCheck?: Set<string>; marker: StatusMarker; dayStart: Date }) {
  const updates: { id: string; status: "DIRTY" | "CLEAN" | "INSPECTED" }[] = [];
  const marker: StatusMarker = {};
  /** Rest vom Vortag: nicht fertig bzw. nicht geprüft, ohne heutigen Grund (Abreise/Turn/Bleiber/In-House). */
  const carryover: string[] = [];
  for (const r of input.rooms) {
    if (KEEP.has(r.status)) continue;
    const m = input.marker[r.id];
    const untouched = m ? m[0] === r.status && m[1] === r.statusSince.toISOString() : r.statusSince < input.dayStart;
    if (!untouched) continue; // heute schon bearbeitet
    const fromBefore = r.statusSince < input.dayStart; // Stand von gestern (nicht heute vom Hub gesetzt)
    let target: "DIRTY" | "CLEAN" | "INSPECTED";
    if (input.needsCleaning.has(r.id)) target = "DIRTY";
    else if (fromBefore && LEFTOVER_DIRTY.has(r.status)) { target = "DIRTY"; carryover.push(r.id); }
    else if (input.needsCheck?.has(r.id)) target = "CLEAN";
    else if (fromBefore && r.status === "CLEAN") { target = "CLEAN"; carryover.push(r.id); }
    else target = "INSPECTED";
    if (r.status !== target) updates.push({ id: r.id, status: target });
    else marker[r.id] = [r.status, r.statusSince.toISOString()]; // unverändert: Marker mit dem vorhandenen Stand
  }
  return { updates, marker, carryover };
}
