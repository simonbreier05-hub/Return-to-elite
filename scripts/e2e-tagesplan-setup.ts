/**
 * Testdaten für den Playwright-Nachweis des Tagesplans (Plan-1) — nur lokal/SQLite, nie gegen Prod.
 * Erfundener Arbeitstag auf Etage 1–3: Tagesplan (`DayRoomPlan`) mit Abreise/Bleiber/Turn/Anreise und Wäschewechsel,
 * vier anwesende Zimmermädchen; eine Kraft mit Überlast (16 Zimmer, auf 3 Etagen), eine ohne Zimmer („Verfügbar“),
 * Rest offen (Goldrahmen). Keine Gastdaten (Anreisen ohne Namen).
 */
import { PrismaClient } from "@prisma/client";
import { berlinDate } from "../src/lib/dayplan/time";

const prisma = new PrismaClient();
const TEAM = ["hausdame@hotel.test", "maria@hotel.test", "aylin@hotel.test", "petra@hotel.test"];
const KINDS = ["DEPARTURE", "STAYOVER", "SAME_DAY_TURN", "STAYOVER", "ARRIVAL", "STAYOVER", "DEPARTURE"] as const;
/** Zimmer je Kraft (in Reihenfolge der Zimmer): Überlast, ausgewogen, niedrig, keine. */
const COUNTS: Record<string, number> = { "hausdame@hotel.test": 16, "maria@hotel.test": 11, "aylin@hotel.test": 5, "petra@hotel.test": 0 };

async function main() {
  if (!/^file:/.test(process.env.DATABASE_URL ?? "")) throw new Error("Nur gegen eine lokale SQLite-DB ausführen.");
  const today = berlinDate(new Date());
  await prisma.user.updateMany({ where: { role: "room_attendant", email: { notIn: TEAM } }, data: { absentDate: today } });
  await prisma.user.updateMany({ where: { role: "room_attendant", email: { in: TEAM } }, data: { absentDate: null, hkType: "VOLLZEIT" } });
  await prisma.room.updateMany({ where: {}, data: { assignedToId: null, assignedOn: null, routeOrder: null } });
  await prisma.dayRoomPlan.deleteMany({ where: { date: today } });

  const rooms = await prisma.room.findMany({ where: { floor: { in: [1, 2, 3] } }, orderBy: { number: "asc" } });
  const planned = rooms.filter((_, i) => i % 2 === 0);
  for (const [i, r] of planned.entries()) {
    const kind = KINDS[i % KINDS.length];
    await prisma.dayRoomPlan.create({ data: { date: today, roomId: r.id, cleaningType: kind, laundryDue: kind === "STAYOVER" && i % 3 === 0, nights: kind === "STAYOVER" ? 3 : null } });
    await prisma.room.update({
      where: { id: r.id },
      data: {
        occupancy: kind === "ARRIVAL" ? "VACANT" : "OCCUPIED", isCheckoutToday: kind === "DEPARTURE" || kind === "SAME_DAY_TURN",
        status: "DIRTY", blockReason: null, statusSince: new Date(Date.now() - 30 * 60_000),
      },
    });
  }
  // Überlast-Kraft bekommt Zimmer über alle drei Etagen verteilt (jedes 3. Zimmer), die anderen der Reihe nach.
  const left = [...planned];
  for (const email of TEAM) {
    const u = await prisma.user.findFirstOrThrow({ where: { email } });
    const n = COUNTS[email];
    const mine = email === "hausdame@hotel.test" ? left.filter((_, i) => i % 3 === 0).slice(0, n) : left.slice(0, n);
    for (const [j, r] of mine.entries()) {
      left.splice(left.indexOf(r), 1);
      await prisma.room.update({ where: { id: r.id }, data: { assignedToId: u.id, assignedOn: today, routeOrder: j + 1, status: j === 0 ? "CLEAN" : "DIRTY" } });
    }
  }
  console.log(`tagesplan ${planned.length} zimmer, offen ${left.length}`);
}
main().finally(() => prisma.$disconnect());
