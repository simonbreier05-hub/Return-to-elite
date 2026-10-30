import { PrismaClient } from "@prisma/client";
import { ensureDemoStay } from "./demoStay";

/**
 * Einmalig: erfundene Demo-Tagesdaten aus einer bestehenden Datenbank entfernen (Zimmerstatus-Fortschritt,
 * Belegung, Abreisen, Zuteilungen, Anreisen, Aufenthalte, Ausflüge, Defekte, Aufgaben, Notizen, Gästeanfragen,
 * Meldungen). Die App arbeitet danach nur noch mit dem Planungshub (src/lib/dayplan/hubDay.ts).
 *
 * Läuft NUR, wenn `RESET_DAY_DATA_ONCE=1` gesetzt ist (bewusst nur am Preview-Dienst), und nur einmal je
 * Datenbank (Setting `dayDataResetAt`). Planungshub-Daten bleiben: eingelesene Listen, Tagesplan, Import-
 * Aufenthalte, Traces, Planvorschläge, Mitarbeiter, Zimmer-Stammdaten, Einstellungen.
 */
const prisma = new PrismaClient();
const MARKER = "dayDataResetV2At"; // V2: Zimmer jetzt auf „sauber" (INSPECTED) statt „schmutzig"; Gast-Vorschau-Aufenthalt (301) bleibt

async function main() {
  if (process.env.RESET_DAY_DATA_ONCE !== "1") return;
  if (await prisma.setting.findUnique({ where: { key: MARKER } })) {
    console.log("reset-day-data: schon erledigt — nichts geändert.");
    return;
  }
  const counts: Record<string, number> = {};
  counts.notifications = (await prisma.notification.deleteMany()).count;
  // Hausmann-Aufgaben aus Traces des Planungshubs bleiben, nur von Hand/Demo angelegte gehen.
  const fromHub = (await prisma.trace.findMany({ where: { roomTaskId: { not: null } }, select: { roomTaskId: true } })).map((t) => t.roomTaskId!);
  counts.roomTasks = (await prisma.roomTask.deleteMany({ where: { id: { notIn: fromHub } } })).count;
  counts.workOrders = (await prisma.workOrder.deleteMany()).count;
  counts.defects = (await prisma.defect.deleteMany()).count;
  counts.roomNotes = (await prisma.roomNote.deleteMany()).count;
  counts.guestRequests = (await prisma.guestRequest.deleteMany()).count;
  counts.excursions = (await prisma.excursion.deleteMany()).count;
  counts.arrivals = (await prisma.arrival.deleteMany()).count;
  counts.manualStays = (await prisma.stay.deleteMany({ where: { source: "MANUAL" } })).count; // DEMO (Gast-Vorschau) bleibt
  await prisma.user.updateMany({ data: { currentRoomId: null } });
  counts.rooms = (await prisma.room.updateMany({
    data: {
      status: "INSPECTED", statusSince: new Date("2000-01-01T00:00:00Z"), blockReason: null, blockedSince: null, reworkNote: null, oooUntil: null,
      occupancy: "VACANT", isCheckoutToday: false, assignedToId: null, assignedOn: null, routeOrder: null, deferredSince: null,
    },
  })).count;
  await prisma.setting.deleteMany({ where: { OR: [{ key: "dayDataResetAt" }, { key: { startsWith: "boardInit:" } }] } });
  await ensureDemoStay(prisma);
  // Gibt es schon einen Tagesplan für heute, Board und Zimmerstatus gleich wieder aus dem Planungshub setzen.
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  if (await prisma.dayRoomPlan.count({ where: { date: today } })) {
    const admin = await prisma.user.findFirst({ where: { role: "duty_manager" }, select: { id: true } });
    if (admin) {
      const { applyDayPlanToBoard } = await import("../src/lib/dayplan/merge");
      counts.boardFromHub = (await applyDayPlanToBoard(today, admin.id)).rooms;
    }
  }
  await prisma.setting.create({ data: { key: MARKER, value: new Date().toISOString() } });
  console.log("reset-day-data: Demo-Tagesdaten entfernt", counts);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
