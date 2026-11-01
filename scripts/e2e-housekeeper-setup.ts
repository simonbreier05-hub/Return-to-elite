/**
 * Testdaten für den Playwright-Nachweis der Housekeeper-Aktionsfenster (nur lokal/SQLite, nie gegen Prod):
 * teilt Maria zwölf Zimmer zu (darunter 122), alle DIRTY und heute zugeteilt — plus Tagesplan (`DayRoomPlan`) für heute, damit der Hub „bereit“ ist. So wird die Liste lang
 * genug, dass ein falsch verankertes Fenster unter den sichtbaren Bereich rutschen würde.
 */
import { PrismaClient } from "@prisma/client";
import { berlinDate } from "../src/lib/dayplan/time";

const prisma = new PrismaClient();
async function main() {
  if (!/^file:/.test(process.env.DATABASE_URL ?? "")) throw new Error("Nur gegen eine lokale SQLite-DB ausführen.");
  const maria = await prisma.user.findFirstOrThrow({ where: { email: "maria@hotel.test" } });
  const others = await prisma.room.findMany({ where: { number: { not: "122" } }, orderBy: { number: "asc" }, take: 11, select: { number: true } });
  const numbers = ["122", ...others.map((r) => r.number)];
  const today = berlinDate(new Date());
  const res = await prisma.room.updateMany({
    where: { number: { in: numbers } },
    data: { assignedToId: maria.id, assignedOn: today, status: "DIRTY", blockReason: null, statusSince: new Date() },
  });
  const rooms = await prisma.room.findMany({ where: { number: { in: numbers } }, select: { id: true } });
  for (const r of rooms) {
    await prisma.dayRoomPlan.upsert({
      where: { date_roomId: { date: today, roomId: r.id } },
      update: {},
      create: { date: today, roomId: r.id, cleaningType: "DEPARTURE" },
    });
  }
  console.log(`assigned ${res.count} rooms to maria`);
}
main().finally(() => prisma.$disconnect());
