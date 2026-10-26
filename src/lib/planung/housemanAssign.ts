/**
 * Hausmann-Aufgaben (Traces) auf die gewählten Hausmänner verteilen. Rein, ohne DB.
 *  - Ein Hausmann gewählt: er bekommt alle Aufgaben.
 *  - Mehrere: gleichmäßig nach Etage (eine Etage bleibt bei einem Hausmann); die größte Etagengruppe geht zuerst an den
 *    am wenigsten Beschäftigten. Bereits (von Hand) zugeteilte Aufgaben an gewählte Hausmänner bleiben.
 *  - Nie ein Hausmann außerhalb der Auswahl.
 */
export interface HmItem { id: string; floor: number; assignedToId: string | null }

export function distributeHouseman(items: HmItem[], hmIds: string[], manual: Record<string, string | null> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  if (!hmIds.length) return out;
  const chosen = new Set(hmIds);
  const load = new Map(hmIds.map((id) => [id, 0]));
  const rest: HmItem[] = [];
  for (const it of items) {
    const fixed = manual[it.id] && chosen.has(manual[it.id]!) ? manual[it.id]! : it.assignedToId && chosen.has(it.assignedToId) ? it.assignedToId : null;
    if (fixed) { out[it.id] = fixed; load.set(fixed, (load.get(fixed) ?? 0) + 1); } else rest.push(it);
  }
  if (hmIds.length === 1) { for (const it of rest) out[it.id] = hmIds[0]; return out; }
  const byFloor = new Map<number, HmItem[]>();
  for (const it of rest) byFloor.set(it.floor, [...(byFloor.get(it.floor) ?? []), it]);
  const groups = [...byFloor.entries()].sort((a, b) => b[1].length - a[1].length || a[0] - b[0]);
  for (const [, list] of groups) {
    const target = [...hmIds].sort((a, b) => (load.get(a)! - load.get(b)!) || hmIds.indexOf(a) - hmIds.indexOf(b))[0];
    for (const it of list) out[it.id] = target;
    load.set(target, load.get(target)! + list.length);
  }
  return out;
}
