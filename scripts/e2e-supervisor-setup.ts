/**
 * Testdaten für den Playwright-Nachweis der Supervisor-Seiten (D3) — nur lokal/SQLite, nie gegen Prod.
 * Erfundener Arbeitstag auf Etage 3 (und etwas Etage 2): Tagesplan (`DayRoomPlan`) mit Abreise/Bleiber/Turn/Anreise,
 * fünf anwesende Zimmermädchen mit unterschiedlichem Fortschritt, offene (nicht zugeteilte) Zimmer, ein Gast-DND
 * per Personal-Meldung, Wäschewechsel, erwartete Anreisen mit erfundenen Namen. Keine echten Gastdaten.
 */
import { PrismaClient } from "@prisma/client";
import { berlinDate } from "../src/lib/dayplan/time";

const prisma = new PrismaClient();
const TEAM = ["hausdame@hotel.test", "maria@hotel.test", "aylin@hotel.test", "petra@hotel.test", "lucia@hotel.test"];
const KINDS = ["DEPARTURE", "STAYOVER", "SAME_DAY_TURN", "STAYOVER", "ARRIVAL", "DEPARTURE", "STAYOVER"] as const;
// Fortschritt je Kraft: erledigt / in Arbeit / offen (Zimmer in Laufplan-Reihenfolge)
const PLAN: Record<string, { done: number; working: number; open: number }> = {
  "hausdame@hotel.test": { done: 3, working: 1, open: 4 },
  "maria@hotel.test": { done: 4, working: 1, open: 1 },
  "aylin@hotel.test": { done: 3, working: 0, open: 2 },
  "petra@hotel.test": { done: 0, working: 0, open: 4 },
  "lucia@hotel.test": { done: 1, working: 1, open: 1 },
};
const GUESTS = ["Herr Dr. Beispiel", "Frau Muster", "Herr Probe", "Frau Prof. Testfall", "Herr Platzhalter", "Frau Erfunden"];

async function main() {
  if (!/^file:/.test(process.env.DATABASE_URL ?? "")) throw new Error("Nur gegen eine lokale SQLite-DB ausführen.");
  const today = berlinDate(new Date());
  const sup = await prisma.user.findFirstOrThrow({ where: { email: "supervisor@hotel.test" } });

  // Anwesend: nur das Team; alle übrigen Zimmermädchen heute abwesend.
  await prisma.user.updateMany({ where: { role: "room_attendant", email: { notIn: TEAM } }, data: { absentDate: today } });
  await prisma.user.updateMany({ where: { role: "room_attendant", email: { in: TEAM } }, data: { absentDate: null } });

  const rooms = await prisma.room.findMany({ where: { floor: { in: [2, 3] } }, orderBy: { number: "asc" } });
  await prisma.room.updateMany({ where: {}, data: { assignedToId: null, assignedOn: null, routeOrder: null } });
  await prisma.arrival.deleteMany({ where: { source: "E2E" } });

  // Etage 3 komplett im Tagesplan, Etage 2 nur jedes dritte Zimmer.
  const planned = rooms.filter((r, i) => r.floor === 3 || i % 3 === 0);
  let gi = 0;
  for (const [i, r] of planned.entries()) {
    const kind = KINDS[i % KINDS.length];
    const laundry = kind === "STAYOVER" && i % 2 === 0;
    await prisma.dayRoomPlan.upsert({
      where: { date_roomId: { date: today, roomId: r.id } },
      update: { cleaningType: kind, laundryDue: laundry },
      create: { date: today, roomId: r.id, cleaningType: kind, laundryDue: laundry, nights: kind === "STAYOVER" ? 3 : null },
    });
    await prisma.room.update({
      where: { id: r.id },
      data: {
        occupancy: kind === "STAYOVER" || kind === "DEPARTURE" || kind === "SAME_DAY_TURN" ? "OCCUPIED" : "VACANT",
        isCheckoutToday: kind === "DEPARTURE" || kind === "SAME_DAY_TURN",
        status: "DIRTY",
        blockReason: null,
        statusSince: new Date(Date.now() - 30 * 60_000),
      },
    });
    if (kind === "ARRIVAL" || kind === "SAME_DAY_TURN") {
      await prisma.arrival.create({
        data: { roomId: r.id, guestName: GUESTS[gi++ % GUESTS.length], vip: gi % 4 === 0, eta: new Date(Date.now() + 3 * 3600_000), source: "E2E", status: "EXPECTED", createdById: sup.id },
      });
    }
  }

  // Zuteilen: Etage 3 der Reihe nach an das Team, Rest bleibt offen (Goldrahmen).
  const floor3 = planned.filter((r) => r.floor === 3);
  let k = 0;
  for (const email of TEAM) {
    const u = await prisma.user.findFirstOrThrow({ where: { email } });
    const p = PLAN[email];
    const n = p.done + p.working + p.open;
    const mine = floor3.slice(k, k + n);
    k += n;
    for (const [j, r] of mine.entries()) {
      const status = j < p.done ? (j % 2 ? "INSPECTED" : "CLEAN") : j < p.done + p.working ? "IN_PROGRESS" : "DIRTY";
      await prisma.room.update({ where: { id: r.id }, data: { assignedToId: u.id, assignedOn: today, routeOrder: j + 1, status, statusSince: new Date(Date.now() - (j + 5) * 60_000) } });
    }
  }
  // Ein DND (vom Personal gemeldet) bei einer offenen Kraft
  const dndRoom = floor3[k - 1];
  if (dndRoom) await prisma.room.update({ where: { id: dndRoom.id }, data: { status: "BLOCKED", blockReason: "DND" } });

  // Supervisor ist für Etage 2 und 3 zuständig (Liste/Etagen-Zahlen)
  await prisma.user.update({ where: { id: sup.id }, data: { assignedFloors: "2,3" } }).catch(() => undefined);
  console.log(`tagesplan ${planned.length} zimmer, zugeteilt ${k}, offen ${floor3.length - k} auf etage 3`);
}
main().finally(() => prisma.$disconnect());
