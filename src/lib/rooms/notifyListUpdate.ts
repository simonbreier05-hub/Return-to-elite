import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { broadcast } from "@/lib/realtime";
import { parseAssignedFloors } from "@/lib/floors";

export interface RoomChange { number: string; floor: number; roomId: string; from: string; to: string }
export interface NewTrace { number: string; floor: number; dept: string }

const LABEL: Record<string, string> = { DEPARTURE: "Abreise", SAME_DAY_TURN: "Turn", STAYOVER: "Bleiber", ARRIVAL: "Anreise", "—": "entfällt" };
const lab = (k: string) => LABEL[k] ?? k;
const list = (nums: string[], max = 6) => (nums.length > max ? `${nums.slice(0, max).join(", ")} + ${nums.length - max} weitere` : nums.join(", "));

/**
 * „Jeder wird bei Updates seiner Liste benachrichtigt“: nach einem Nachimport (neuer Stand der Listen) oder einer manuellen
 * Änderung der Reinigungsart bekommt jede betroffene Person genau eine Meldung mit den geänderten Zimmern:
 *  - Zimmermädchen: Zimmer ihrer Liste (Art geändert) und neue Hinweise (Traces) auf ihren Zimmern,
 *  - Hausmann: neue Aufgaben (eigene und nicht zugeteilte),
 *  - Supervisor: Änderungen auf ihren Etagen,
 *  - Duty Manager: Gesamtzusammenfassung.
 * Nur Zimmernummern, Art und Zähler — nie Aufgabentext, nie Gastdaten. Wer die Änderung selbst ausgelöst hat, wird nicht gemeldet.
 */
export async function notifyListUpdate(opts: { date: string; actorId: string | null; changes: RoomChange[]; newTraces: NewTrace[]; source: "IMPORT" | "MANUAL" }): Promise<number> {
  const { date, actorId, changes, newTraces, source } = opts;
  if (!changes.length && !newTraces.length) return 0;
  const out: { type: string; level: string; targetRole: string; targetUserId: string; message: string; dedupeKey: string }[] = [];
  const add = (role: string, userId: string, message: string, level = "info") => {
    if (userId === actorId) return;
    const sig = createHash("sha1").update(`${date}|${userId}|${message}`).digest("hex").slice(0, 16);
    out.push({ type: "LIST_UPDATED", level, targetRole: role, targetUserId: userId, message, dedupeKey: `LISTUPD:${sig}` });
  };
  const head = source === "IMPORT" ? "Nachimport" : "Änderung";

  // Zimmermädchen: wem gehören die geänderten Zimmer / Hinweise?
  const nums = [...new Set([...changes.map((c) => c.number), ...newTraces.filter((t) => t.dept === "HOUSEKEEPING").map((t) => t.number)])];
  const rooms = await prisma.room.findMany({ where: { number: { in: nums } }, select: { number: true, floor: true, assignedToId: true } });
  const byHk = new Map<string, { changed: RoomChange[]; traces: string[] }>();
  const slot = (id: string) => byHk.get(id) ?? byHk.set(id, { changed: [], traces: [] }).get(id)!;
  for (const c of changes) { const r = rooms.find((x) => x.number === c.number); if (r?.assignedToId) slot(r.assignedToId).changed.push(c); }
  for (const t of newTraces.filter((x) => x.dept === "HOUSEKEEPING")) { const r = rooms.find((x) => x.number === t.number); if (r?.assignedToId) slot(r.assignedToId).traces.push(t.number); }
  for (const [id, v] of byHk) {
    const parts: string[] = [];
    if (v.changed.length) parts.push(v.changed.length === 1 ? `Zimmer ${v.changed[0].number}: ${lab(v.changed[0].from)} → ${lab(v.changed[0].to)}` : `${v.changed.length} Zimmer geändert (${list(v.changed.map((c) => c.number))})`);
    if (v.traces.length) parts.push(`neuer Hinweis in ${list([...new Set(v.traces)])}`);
    add("room_attendant", id, `${head}: Deine Liste hat sich geändert — ${parts.join("; ")}.`, "warning");
  }

  // Hausmann: neue Aufgaben (Traces der Abteilung Hausmann) — für alle Hausmänner sichtbar oder dem zugeteilten
  const hmNew = newTraces.filter((t) => t.dept === "HOUSEMAN");
  if (hmNew.length) {
    const housemen = await prisma.user.findMany({ where: { role: "houseman" }, select: { id: true } });
    for (const h of housemen) add("houseman", h.id, `${head}: Deine Hausmann-Liste hat sich geändert — ${hmNew.length} ${hmNew.length === 1 ? "neue Aufgabe" : "neue Aufgaben"} (${list([...new Set(hmNew.map((t) => t.number))])}).`);
  }

  // Supervisor: nur ihre Etagen
  const sups = await prisma.user.findMany({ where: { role: "supervisor" }, select: { id: true, assignedFloors: true } });
  for (const s of sups) {
    const fl = parseAssignedFloors(s.assignedFloors);
    const c = changes.filter((x) => fl.includes(x.floor)), t = newTraces.filter((x) => fl.includes(x.floor));
    if (!c.length && !t.length) continue;
    const parts: string[] = [];
    if (c.length) parts.push(`${c.length} ${c.length === 1 ? "Zimmer" : "Zimmer"} mit geänderter Art (${list(c.map((x) => x.number))})`);
    if (t.length) parts.push(`${t.length} neue ${t.length === 1 ? "Hinweis" : "Hinweise"}`);
    add("supervisor", s.id, `${head}: Liste deiner Etagen aktualisiert — ${parts.join(", ")}.`);
  }

  // Duty Manager: Zusammenfassung
  const dms = await prisma.user.findMany({ where: { role: "duty_manager" }, select: { id: true } });
  for (const d of dms) add("duty_manager", d.id, `${head}: ${changes.length} Zimmer mit geänderter Art, ${newTraces.length} neue Hinweise/Aufgaben.`);

  let created = 0;
  for (const data of out) {
    if (await prisma.notification.findFirst({ where: { dedupeKey: data.dedupeKey } })) continue;
    const notification = await prisma.notification.create({ data });
    broadcast("notification:new", { notification });
    created++;
  }
  return created;
}
