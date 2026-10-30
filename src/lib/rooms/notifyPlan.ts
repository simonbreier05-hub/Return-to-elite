import { prisma } from "@/lib/db";
import { broadcast } from "@/lib/realtime";

export interface PlanNotifyInput {
  /** Eindeutig je Bestätigung (z. B. Id des Entwurfs) — verhindert doppelte Meldungen bei erneutem Aufruf. */
  planId: string;
  /** Betriebstag des Plans (für die Hausmann-Aufgaben). */
  date: string;
  actorId: string;
  /** Je Zimmermädchen: Zimmer/Credits nach der Bestätigung und ob sich ihre Liste gegenüber vorher geändert hat. */
  attendants: { id: string; rooms: number; credits: number; changed: boolean }[];
  totalRooms: number;
  openRooms: number;
  /** Erste Bestätigung des Tages: jede gewählte Kraft mit Zimmern bekommt ihre fertige Liste gemeldet (auch wenn schon vorher Zimmer zugeteilt waren). */
  first?: boolean;
  /** Gewählte Supervisoren/Hausmänner (Planungshub). Nur sie werden gemeldet; fehlt die Angabe, alle der Rolle. */
  supervisors?: string[];
  houseman?: string[];
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");

/**
 * Meldungen, wenn ein Tagesplan bestätigt wird: jedes Zimmermädchen mit geänderter/neuer Liste ("Dein Plan für heute: N Zimmer, X Credits"),
 * der Hausmann (offene Aufgaben), Supervisoren und Duty Manager (Zusammenfassung). Wer bestätigt, wird nicht gemeldet.
 * Gespeichert als Notification (ungelesen-Badge) und live per Socket.IO. Nie Gastdaten, keine Namen Dritter.
 * Spätere Änderungen im Grundriss laufen weiter über `notifyReassignment` (nur die Betroffenen).
 */
export async function notifyPlanConfirmed(input: PlanNotifyInput): Promise<number> {
  const { planId, actorId, attendants, totalRooms, openRooms } = input;
  const out: { type: string; level: string; targetRole: string; targetUserId: string; message: string; dedupeKey: string }[] = [];
  const add = (type: string, targetRole: string, targetUserId: string, message: string, level = "info") =>
    out.push({ type, level, targetRole, targetUserId, message, dedupeKey: `PLAN:${planId}:${targetUserId}` });

  for (const a of attendants) {
    if (a.id === actorId || (!a.changed && !(input.first && a.rooms > 0))) continue;
    add("PLAN_CONFIRMED", "room_attendant", a.id, a.rooms > 0
      ? `Dein Plan für heute: ${a.rooms} Zimmer, ${fmt(a.credits)} Credits.`
      : "Dein Plan für heute wurde geändert: Du hast keine Zimmer mehr auf der Liste.");
  }

  const staff = (await prisma.user.findMany({ where: { role: { in: ["houseman", "supervisor", "duty_manager"] }, id: { not: actorId } }, select: { id: true, role: true } }))
    .filter((u) => (u.role === "supervisor" && input.supervisors ? input.supervisors.includes(u.id) : u.role === "houseman" && input.houseman ? input.houseman.includes(u.id) : true));
  const working = attendants.filter((a) => a.rooms > 0).length;
  for (const u of staff) {
    if (u.role === "houseman") {
      // Hausmann-Aufgaben des Tages: eigene (zugeteilte) und nicht zugeteilte, noch offen
      const mine = await prisma.trace.count({ where: { date: input.date, dept: "HOUSEMAN", status: "OPEN", assignedToId: u.id } });
      const free = await prisma.trace.count({ where: { date: input.date, dept: "HOUSEMAN", status: "OPEN", assignedToId: null } });
      const n = mine + free;
      add("PLAN_CONFIRMED", "houseman", u.id, `Dein Plan für heute: ${n} ${n === 1 ? "Aufgabe" : "Aufgaben"}${mine ? ` (${mine} dir zugeteilt)` : ""}.`);
    }
    else add("PLAN_CONFIRMED", u.role, u.id,
      `Tagesplan bestätigt: ${totalRooms - openRooms} von ${totalRooms} Zimmern an ${working} Kräfte verteilt${openRooms ? `, ${openRooms} noch offen` : ""}.`,
      openRooms ? "warning" : "info");
  }

  let created = 0;
  for (const data of out) {
    const exists = await prisma.notification.findFirst({ where: { dedupeKey: data.dedupeKey } });
    if (exists) continue;
    const notification = await prisma.notification.create({ data });
    broadcast("notification:new", { notification });
    created++;
  }
  return created;
}
