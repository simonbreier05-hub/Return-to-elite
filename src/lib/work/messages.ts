import { prisma } from "@/lib/db";
import { broadcast } from "@/lib/realtime";
import { berlinDate } from "@/lib/dayplan/time";
import { parseAssignedFloors } from "@/lib/floors";
import { canSeeMessages, messageRecipients, messagesOutOfScope, type RoomInvolvement } from "./access";
import { viewerFor } from "./pauseData";

/**
 * Nachrichten an Zimmer/Aufgabe: `RoomNote` mit `kind = "MESSAGE"` (dieselbe Tabelle und derselbe Verlauf wie Notizen —
 * keine dritte Variante). Hier steht, wer an einem Zimmer beteiligt ist und wer bei einer neuen Nachricht gemeldet wird.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Wer ist heute an diesem Zimmer beteiligt (Zimmermädchen, Hausmann-Aufgaben, Arbeitsaufträge)? */
export async function involvementFor(roomId: string, now = new Date()): Promise<RoomInvolvement | null> {
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { floor: true, assignedToId: true, assignedOn: true } });
  if (!room) return null;
  const today = berlinDate(now);
  const recent = new Date(now.getTime() - DAY_MS);
  const [traces, tasks, orders] = await Promise.all([
    prisma.trace.findMany({ where: { roomId, date: today, dept: "HOUSEMAN" }, select: { assignedToId: true } }),
    prisma.roomTask.findMany({ where: { roomId, OR: [{ status: "OPEN" }, { createdAt: { gte: recent } }] }, select: { assignedToId: true } }),
    prisma.workOrder.findMany({ where: { defect: { roomId }, OR: [{ status: { not: "RESOLVED" } }, { resolvedAt: { gte: recent } }] }, select: { assignedToId: true } }),
  ]);
  const ids = (rows: { assignedToId: string | null }[]) => [...new Set(rows.map((r) => r.assignedToId ?? "*"))];
  return {
    floor: room.floor,
    housekeeperId: room.assignedOn === today ? room.assignedToId : null,
    housemanIds: ids([...traces, ...tasks]),
    engineerIds: ids(orders),
  };
}

const ROLE_LABEL: Record<string, string> = {
  room_attendant: "Housekeeping", supervisor: "Supervisor", duty_manager: "Duty Manager", houseman: "Hausmann",
  engineering: "Technik", front_office: "Front Office", concierge: "Concierge",
};

/**
 * Meldet eine neue Nachricht allen Beteiligten (ungelesen bis bestätigt — dasselbe Meldungssystem wie überall). Text der
 * Nachricht steht nie in der Meldung, nur Zimmer, Autor und Rolle. Fehler werden geschluckt (die Nachricht ist schon gespeichert).
 */
export async function notifyMessage(opts: { room: { id: string; number: string }; author: { id: string; name: string; role: string } }): Promise<number> {
  try {
    const involvement = await involvementFor(opts.room.id);
    if (!involvement) return 0;
    const staff = await prisma.user.findMany({ where: { role: { in: ["supervisor", "houseman", "engineering", "duty_manager"] } }, select: { id: true, role: true, assignedFloors: true } });
    const recipients = messageRecipients({
      authorId: opts.author.id,
      involvement,
      supervisors: staff.filter((s) => s.role === "supervisor").map((s) => ({ id: s.id, floors: parseAssignedFloors(s.assignedFloors) })),
      housemen: staff.filter((s) => s.role === "houseman").map((s) => s.id),
      engineers: staff.filter((s) => s.role === "engineering").map((s) => s.id),
      dutyManagers: staff.filter((s) => s.role === "duty_manager").map((s) => s.id),
    });
    const message = `Neue Nachricht zu Zimmer ${opts.room.number} (Etage ${involvement.floor}) von ${opts.author.name} (${ROLE_LABEL[opts.author.role] ?? opts.author.role}).`;
    for (const r of recipients) {
      const notification = await prisma.notification.create({ data: { type: "TASK_MESSAGE", level: "warning", targetRole: r.role, targetUserId: r.userId, roomId: opts.room.id, message } });
      broadcast("notification:new", { notification });
    }
    return recipients.length;
  } catch {
    return 0;
  }
}

/** Darf diese Person die Nachrichten dieses Zimmers sehen/schreiben? (Notizen bleiben wie bisher für alle sichtbar.) */
export async function sessionSeesMessages(session: { role: string; userId: string }, roomId: string): Promise<boolean> {
  if (session.role === "duty_manager") return true;
  const [viewer, involvement] = await Promise.all([viewerFor(session), involvementFor(roomId)]);
  return !!involvement && canSeeMessages(viewer, involvement);
}

/** Wie `sessionSeesMessages`, plus ob die Nachrichten außerhalb der Zuständigkeit liegen (Supervisor ohne Etagen). */
export async function messageAccess(session: { role: string; userId: string }, roomId: string): Promise<{ canMessage: boolean; outOfScope: boolean }> {
  if (session.role === "duty_manager") return { canMessage: true, outOfScope: false };
  const [viewer, involvement] = await Promise.all([viewerFor(session), involvementFor(roomId)]);
  if (!involvement) return { canMessage: false, outOfScope: false };
  return { canMessage: canSeeMessages(viewer, involvement), outOfScope: messagesOutOfScope(viewer, involvement) };
}
