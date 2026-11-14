import { prisma } from "@/lib/db";
import { latestPlanDate } from "@/lib/dayplan/latest";
import { getRoomTypeCredits, getSettings } from "@/lib/settings";
import type { RoomType } from "@/lib/domain";
import { computeRoomCredit, creditMinutes } from "@/lib/rooms/roomCredit";
import { greenRoomsOn } from "@/lib/guest/green";
import { dndReminderDue } from "@/lib/rooms/dndReminder";
import { shortGuestName, timesInText } from "./guestName";
import { activePauses, type PauseView } from "@/lib/work/pauseData";
import { isCheckedOut, parseCleanWish } from "@/lib/planung/listOrder";

/** Tag der Listen: immer der Betriebstag. Ohne Tagesplan für heute sind die Listen leer (kein Rückfall auf ältere Tage). */
export async function listDay(): Promise<string | null> {
  return latestPlanDate();
}

export type Kind = "DEPARTURE" | "SAME_DAY_TURN" | "STAYOVER" | "ARRIVAL";

export interface TraceView { id: string; code: string; text: string; dept: string; status: string }

export interface RoomRow {
  id: string;
  number: string;
  floor: number;
  status: string;
  routeOrder: number | null;
  assignedToId: string | null;
  assignedOn: string | null;
  occupancy: string;
  blockReason: string | null;
  kind: Kind | null;
  laundry: boolean;
  vip: boolean;
  eta: string | null;
  /** „Herr Dr. Krüger" / „Mr. Smith" / nur „Krüger" — nie Vornamen, nie Alter. */
  guest: string | null;
  /** Sprache des Aufenthalts (`Stay.language`, z. B. „de“, „en“) — nur das Kürzel, für den Sprach-Chip (D2). */
  lang: string | null;
  pax: number | null;
  dnd: boolean;
  credits: number;
  traces: TraceView[];
  /** Zimmertyp (STANDARD, JUNIOR_SUITE …). */
  type: string;
  /** Offene Mängel — nur mit `extra` (Supervisor/Duty Manager), sonst 0. */
  defects: number;
  /** Offener Gästewunsch (CLEAN_REQUEST | CONTACT) — nur mit `extra`, sonst null. */
  wish: string | null;
  /** Aktive Pause des Zimmers (Grund-Code, seit, von wem) — Supervisor/Duty Manager sehen sie in den Listen. */
  pause: PauseView | null;
  /** H2: offene Hinweise des Teams zum Zimmer (RoomNote OPEN, nicht vom Gast), z. B. aus der Planungsphase — auch für Housekeeper. */
  hints: { id: string; body: string }[];
  /** Planung L1 (Regel 10): Rush/Sofort — `Arrival.neededNow` (nur Front Office/Supervisor setzen es). */
  rush: boolean;
  /** Planung L1 (Regel 7): offener Gastwunsch „Reinigung jetzt“. Nur das Signal, kein Text. */
  serviceNow: boolean;
  /** Planung L1 (Regel 9): Gastwunsch „Reinigung ab HH:MM“ — Zimmer rückt nach hinten, Uhrzeit sichtbar. */
  cleanAfter: string | null;
  /** Planung L1 (Regel 7): abreisender Gast ist ausgecheckt (nur bei Turns von Bedeutung). */
  checkedOut: boolean;
  /** Betrieb L2 (Punkt 2): Start der Reinigung (ISO, `Room.statusSince` bei IN_PROGRESS), sonst null. */
  startedAt: string | null;
  /** Betrieb L2 (Punkt 2): geschätzte Dauer = Credit × minutesPerCredit. */
  estMinutes: number;
  /** Betrieb L2 (Punkt 3): Late Check-out „HH:MM“ (Report oder Front Office), sonst null. */
  lateCheckout: string | null;
  /** Betrieb L2 (Punkt 4): DND ab dndReminderHour noch nicht gereinigt — „Karte ans Zimmer hängen“. */
  dndCard: boolean;
  /** Betrieb L2 (Punkt 11): Gast hat heute die Green Option gewählt — Wäschewechsel entfällt (`laundry` ist dann false). */
  green: boolean;
}

/** Welcher Aufenthalt zählt für die Anzeige: Anreise/Turn → der anreisende Gast, sonst der bleibende bzw. abreisende. */
const stayIdFor = (p: { cleaningType: string; stayId: string | null; arrivingStayId: string | null }) =>
  p.cleaningType === "ARRIVAL" || p.cleaningType === "SAME_DAY_TURN" ? p.arrivingStayId ?? p.stayId : p.stayId ?? p.arrivingStayId;

/**
 * Zeilen der Arbeitslisten für einen Tag (gemeinsame Quelle für Zimmermädchen- und Supervisor-Liste).
 * `depts` begrenzt die Traces auf Abteilungen (Housekeeper: nur HOUSEKEEPING).
 */
export async function loadRoomRows(date: string, where: { roomIds?: string[]; assignedToId?: string; floors?: number[] }, depts: string[] | null, opts: { extra?: boolean; now?: Date } = {}): Promise<RoomRow[]> {
  const now = opts.now ?? new Date();
  const [settings, typeCredits] = await Promise.all([getSettings(), getRoomTypeCredits()]);
  const rooms = await prisma.room.findMany({
    where: {
      ...(where.roomIds ? { id: { in: where.roomIds } } : {}),
      ...(where.assignedToId ? { assignedToId: where.assignedToId } : {}),
      ...(where.floors ? { floor: { in: where.floors } } : {}),
    },
    orderBy: { number: "asc" },
  });
  const ids = rooms.map((r) => r.id);
  const plans = await prisma.dayRoomPlan.findMany({ where: { date, roomId: { in: ids } } });
  const planBy = new Map(plans.map((p) => [p.roomId, p]));
  // auch der abreisende Aufenthalt eines Turns (für „ausgecheckt?“, Regel 7)
  const stayIds = [...new Set(plans.flatMap((p) => [stayIdFor(p), p.stayId]).filter((x): x is string => !!x))];
  const stays = await prisma.stay.findMany({ where: { id: { in: stayIds } } });
  const stayBy = new Map(stays.map((s) => [s.id, s]));
  const traces = await prisma.trace.findMany({ where: { roomId: { in: ids }, date, ...(depts ? { dept: { in: depts } } : {}) }, orderBy: { createdAt: "asc" } });
  const traceBy = new Map<string, TraceView[]>();
  for (const t of traces) traceBy.set(t.roomId, [...(traceBy.get(t.roomId) ?? []), { id: t.id, code: t.code, text: t.text, dept: t.dept, status: t.status }]);
  // H2: offene Hinweise des Teams (nicht vom Gast-Systemkonto) — auch Housekeeper sehen sie für ihre Zimmer
  const notes = await prisma.roomNote.findMany({ where: { roomId: { in: ids }, status: "OPEN", kind: { not: "MESSAGE" }, author: { role: { not: "guest" } } }, orderBy: { createdAt: "asc" }, select: { id: true, roomId: true, body: true } });
  const hintsBy = new Map<string, { id: string; body: string }[]>();
  for (const n of notes) hintsBy.set(n.roomId, [...(hintsBy.get(n.roomId) ?? []), { id: n.id, body: n.body }]);
  const dnd = new Set((await prisma.guestRequest.findMany({ where: { kind: "DND", status: { in: ["RECEIVED", "IN_PROGRESS"] }, roomId: { in: ids } }, select: { roomId: true } })).map((g) => g.roomId));
  // Mängel und Gästewünsche sehen nur Supervisor/Duty Manager (Housekeeper-Listen laden sie nicht)
  const defectCount = new Map<string, number>();
  const wishBy = new Map<string, string>();
  if (opts.extra) {
    for (const d of await prisma.defect.findMany({ where: { roomId: { in: ids }, NOT: { workOrder: { status: "RESOLVED" } } }, select: { roomId: true } })) defectCount.set(d.roomId, (defectCount.get(d.roomId) ?? 0) + 1);
    for (const g of await prisma.guestRequest.findMany({ where: { kind: { in: ["CLEAN_REQUEST", "CONTACT"] }, status: { in: ["RECEIVED", "IN_PROGRESS"] }, roomId: { in: ids } }, select: { roomId: true, kind: true }, orderBy: { createdAt: "asc" } })) wishBy.set(g.roomId, g.kind);
  }

  const pauses = await activePauses("ROOM", rooms.filter((r) => r.status === "IN_PROGRESS").map((r) => r.id));

  // Planung L1 (Regeln 7, 9, 10): Signale für die Reihenfolge — nur Ja/Nein bzw. Uhrzeit, nie Gastnamen oder Text
  const rush = new Set((await prisma.arrival.findMany({ where: { roomId: { in: ids }, neededNow: true, status: "EXPECTED" }, select: { roomId: true } })).map((a) => a.roomId));
  const cleanWish = new Map<string, ReturnType<typeof parseCleanWish>>();
  for (const g of await prisma.guestRequest.findMany({ where: { kind: "CLEAN_REQUEST", status: { in: ["RECEIVED", "IN_PROGRESS"] }, roomId: { in: ids } }, select: { roomId: true, detail: true }, orderBy: { createdAt: "asc" } })) {
    cleanWish.set(g.roomId, parseCleanWish(g.detail)); // der jüngste offene Wunsch gilt
  }
  // Betrieb L2 (Punkt 11): Green Option heute → kein Wäschewechsel
  const green = await greenRoomsOn(date, ids);

  return rooms.map((r) => {
    const p = planBy.get(r.id);
    const stay = p ? stayBy.get(stayIdFor(p) ?? "") : undefined;
    const kind = (p?.cleaningType as Kind | undefined) ?? null;
    const credits = kind === "ARRIVAL" || !kind ? 0 : computeRoomCredit({ type: r.type as RoomType, credits: typeCredits, roomCredit: r.credit });
    return {
      id: r.id, number: r.number, floor: r.floor, status: r.status, routeOrder: r.routeOrder, assignedToId: r.assignedToId, assignedOn: r.assignedOn,
      occupancy: r.occupancy, blockReason: r.blockReason, kind, laundry: !!p?.laundryDue && !green.has(r.id), vip: !!(p?.vip || stay?.vip), eta: p?.eta ?? null,
      guest: stay ? shortGuestName(stay.guestName, stay.source) : null,
      lang: stay?.language ?? null,
      pax: stay ? stay.adults + stay.children : null,
      dnd: dnd.has(r.id) || r.blockReason === "DND",
      credits,
      traces: traceBy.get(r.id) ?? [],
      type: r.type, defects: defectCount.get(r.id) ?? 0, wish: wishBy.get(r.id) ?? null,
      pause: r.status === "IN_PROGRESS" ? pauses.get(r.id) ?? null : null,
      hints: hintsBy.get(r.id) ?? [],
      rush: rush.has(r.id),
      serviceNow: cleanWish.get(r.id)?.serviceNow ?? false,
      cleanAfter: cleanWish.get(r.id)?.cleanAfter ?? null,
      // nur echte Meldung (POST /api/rooms/[id]/checkout bzw. Opera-Code) — nie aus „frei“ geraten (Standardwert VACANT)
      checkedOut: isCheckedOut(p?.stayId ? stayBy.get(p.stayId) : null),
      startedAt: r.status === "IN_PROGRESS" ? r.statusSince.toISOString() : null,
      estMinutes: creditMinutes(credits, settings.minutesPerCredit),
      lateCheckout: p?.lateCheckout ?? null,
      green: !!p?.laundryDue && green.has(r.id),
      dndCard: dndReminderDue({ dnd: dnd.has(r.id) || r.blockReason === "DND", status: r.status, toClean: !!kind && kind !== "ARRIVAL" }, now, settings.dndReminderHour),
    };
  });
}

export { timesInText };

export const isDone = (status: string) => status === "CLEAN" || status === "INSPECTED";
