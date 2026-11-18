import { prisma } from "@/lib/db";
import { broadcast } from "@/lib/realtime";
import { keyed } from "@/lib/i18n/notificationText";
import { getSettings } from "@/lib/settings";
import { berlinDate, berlinToUtc } from "@/lib/dayplan/time";
import { parseAssignedFloors } from "@/lib/floors";
import { getDayNumbers } from "@/lib/dayplan/dayNumbersData";
import { roomBand } from "@/lib/planung/floorTeam";
import type { TKey } from "@/lib/i18n/translations";

/**
 * F5 Aufgabe 1 (H14): Meldungen an den Duty Manager — dringend (Pop-up + Ton), ohne Gastnamen. Mitarbeiternamen nur an
 * Supervisor/Duty Manager (Grenzen F5). Jede Meldung höchstens einmal je Anlass (`dedupeKey`).
 */
async function create(data: { type: string; targetRole: string; targetUserId?: string | null; message: string; key: TKey; vars: Record<string, string | number>; dedupeKey: string; roomId?: string | null }) {
  if (await prisma.notification.findFirst({ where: { dedupeKey: data.dedupeKey }, select: { id: true } })) return 0;
  const notification = await prisma.notification.create({
    data: { type: data.type, level: "warning", targetRole: data.targetRole, targetUserId: data.targetUserId ?? null, roomId: data.roomId ?? null, message: data.message, ...keyed(data.key, data.vars), dedupeKey: data.dedupeKey },
  });
  broadcast("notification:new", { notification });
  return 1;
}

/** Wie viele Kräfte braucht der Tag (Vollzeit-Zimmerband) und wie viele sind heute da? */
export async function staffing(date: string) {
  const [{ numbers }, settings, present] = await Promise.all([
    getDayNumbers(date),
    getSettings(),
    prisma.user.count({ where: { role: "room_attendant", hkActive: true, OR: [{ absentDate: null }, { absentDate: { not: date } }] } }),
  ]);
  const perHk = Math.max(1, roomBand("VOLLZEIT", settings as unknown as Record<string, number>).hi);
  return { needed: Math.ceil(numbers.toClean / perHk), present, toClean: numbers.toClean, open: numbers.toClean - numbers.cleaned };
}

/**
 * Krankmeldung (Entscheidung Frage 9: immer direkt an den DM, keine Rückfrage). Annahme: Supervisoren der Etagen der offenen
 * Zimmer werden ebenfalls informiert. Danach Personal neu rechnen → „Personal reicht nicht“, wenn zu wenige da sind.
 */
export async function alertSick(hkId: string, now = new Date()): Promise<number> {
  const date = berlinDate(now);
  const u = await prisma.user.findUnique({ where: { id: hkId }, select: { name: true } });
  if (!u) return 0;
  const open = await prisma.room.findMany({ where: { assignedToId: hkId, assignedOn: date, status: { notIn: ["CLEAN", "INSPECTED"] } }, select: { floor: true } });
  const msg = `${u.name} krank gemeldet, ${open.length} Zimmer offen.`;
  let n = await create({ type: "STAFF_SICK", targetRole: "duty_manager", message: msg, key: "notify.staffSick", vars: { name: u.name, n: open.length }, dedupeKey: `STAFF_SICK:${hkId}:${date}` });
  const floors = new Set(open.map((r) => r.floor));
  const sups = (await prisma.user.findMany({ where: { role: "supervisor" }, select: { id: true, assignedFloors: true } })).filter((s) => parseAssignedFloors(s.assignedFloors).some((f) => floors.has(f)));
  for (const s of sups) n += await create({ type: "STAFF_SICK", targetRole: "supervisor", targetUserId: s.id, message: msg, key: "notify.staffSick", vars: { name: u.name, n: open.length }, dedupeKey: `STAFF_SICK:${hkId}:${date}:${s.id}` });
  const st = await staffing(date);
  if (st.present < st.needed) {
    n += await create({ type: "STAFF_SHORT", targetRole: "duty_manager", message: `Personal reicht nicht: benötigt ${st.needed} Kräfte, da sind ${st.present}.`,
      key: "notify.staffShort", vars: { needed: st.needed, present: st.present }, dedupeKey: `STAFF_SHORT:${date}:${st.present}` });
  }
  return n;
}

/**
 * „Fortschritt hinter Plan“: geschätzte Restzeit der offenen Zimmer (Credits × Minuten je Credit) größer als die Restkapazität
 * der heute arbeitenden Kräfte bis Schichtende. Nur zwischen Arbeitsbeginn und Schichtende, höchstens einmal je Stunde.
 */
export async function alertBehindPlan(now = new Date()): Promise<number> {
  const date = berlinDate(now);
  const s = await getSettings();
  const start = berlinToUtc(date, `${String(s.workStartHour).padStart(2, "0")}:00`);
  const end = new Date(start.getTime() + s.shiftMinutes * 60_000);
  if (now < start || now >= end) return 0;
  const { rows } = await getDayNumbers(date);
  const openIds = rows.filter((r) => r.kind && r.kind !== "OCCUPIED" && !["CLEAN", "INSPECTED", "OUT_OF_ORDER", "OUT_OF_SERVICE"].includes(r.status) && (r.kind !== "ARRIVAL")).map((r) => r.id);
  if (!openIds.length) return 0;
  const rooms = await prisma.room.findMany({ where: { id: { in: openIds } }, select: { credit: true } });
  const needMin = rooms.reduce((a, r) => a + (r.credit ?? 1), 0) * s.minutesPerCredit;
  const workers = await prisma.room.groupBy({ by: ["assignedToId"], where: { assignedOn: date, assignedToId: { not: null } } });
  const absent = new Set((await prisma.user.findMany({ where: { absentDate: date }, select: { id: true } })).map((u) => u.id));
  const people = workers.filter((w) => w.assignedToId && !absent.has(w.assignedToId)).length;
  const capMin = people * Math.max(0, (end.getTime() - now.getTime()) / 60_000);
  if (needMin <= capMin) return 0;
  const hour = Math.floor(now.getTime() / 3_600_000);
  const fmt = (m: number) => `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, "0")}`;
  return create({ type: "BEHIND_PLAN", targetRole: "duty_manager", message: `Fortschritt hinter Plan: ${openIds.length} Zimmer offen, Restarbeit ${fmt(needMin)} h, Restkapazität ${fmt(capMin)} h.`,
    key: "notify.behindPlan", vars: { n: openIds.length, need: fmt(needMin), cap: fmt(capMin) }, dedupeKey: `BEHIND_PLAN:${date}:${hour}` });
}

/** VIP-Anreise: Zimmer wird erst nach der geplanten Ankunftszeit freigegeben → DM (ohne Gastnamen). */
export async function alertVipLate(room: { id: string; number: string }, arrival: { id: string; vip: boolean; eta: Date | null }, now = new Date()): Promise<number> {
  if (!arrival.vip || !arrival.eta || arrival.eta >= now) return 0;
  const late = Math.round((now.getTime() - arrival.eta.getTime()) / 60_000);
  return create({ type: "VIP_RELEASE_LATE", targetRole: "duty_manager", roomId: room.id, message: `VIP-Zimmer ${room.number} ${late} Min. nach der Ankunftszeit freigegeben.`,
    key: "notify.vipLate", vars: { n: room.number, min: late }, dedupeKey: `VIP_RELEASE_LATE:${arrival.id}` });
}
