/**
 * Zusatzdaten für den Playwright-Nachweis des Zimmer-Fensters (D7) — nur lokal/SQLite, nie gegen Prod.
 * Läuft nach `prisma/seed.ts` + `scripts/e2e-supervisor-setup.ts`. Zimmer 312: Notiz, Trace, Mangel, Gastanfrage,
 * manuell erfasste Anreise mit erfundenem Vollnamen (Fenster muss auf „Anrede Titel Nachname“ kürzen);
 * erstes begonnenes Zimmer auf Etage 3: laufende Pause. Alle Namen/Texte erfunden.
 */
import { PrismaClient } from "@prisma/client";
import { berlinDate } from "../src/lib/dayplan/time";

const prisma = new PrismaClient();

async function main() {
  if (!/^file:/.test(process.env.DATABASE_URL ?? "")) throw new Error("Nur gegen eine lokale SQLite-DB ausführen.");
  const today = berlinDate(new Date());
  const sup = await prisma.user.findFirstOrThrow({ where: { email: "supervisor@hotel.test" } });
  const room = await prisma.room.findFirstOrThrow({ where: { number: "312" } });
  await prisma.room.update({ where: { id: room.id }, data: { occupancy: "OCCUPIED" } });
  await prisma.roomNote.create({ data: { roomId: room.id, authorId: sup.id, body: "Testnotiz: Fenster klemmt leicht.", status: "OPEN", kind: "NOTE" } });
  await prisma.trace.create({ data: { roomId: room.id, code: "TST", date: today, text: "Testtrace: Extra-Kissen", dept: "HOUSEKEEPING", status: "OPEN", dedupeKey: `e2e-d7-${Date.now()}`, source: "MANUAL" } });
  await prisma.defect.create({ data: { roomId: room.id, category: "PLUMBING", note: "Testmangel: Wasserhahn tropft", reportedById: sup.id } });
  await prisma.guestRequest.create({ data: { roomId: room.id, kind: "CLEAN_REQUEST", status: "RECEIVED" } });
  await prisma.arrival.create({ data: { roomId: room.id, guestName: "Herr Dr. Maximilian Testmann", vip: true, neededNow: false, eta: new Date(), source: "MANUAL", status: "EXPECTED", createdById: sup.id } });

  const working = await prisma.room.findFirst({ where: { floor: 3, status: "IN_PROGRESS" }, orderBy: { number: "asc" } });
  if (working) {
    await prisma.workPause.create({ data: { targetType: "ROOM", targetId: working.id, roomId: working.id, reason: "GUEST_IN_ROOM", pausedById: sup.id } });
    console.log(`pause auf ${working.number}`);
  }
  console.log("zimmer 312 vorbereitet");
}

main().finally(() => prisma.$disconnect());
