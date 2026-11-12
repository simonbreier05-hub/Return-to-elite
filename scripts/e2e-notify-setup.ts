/**
 * Testdaten für den Playwright-Nachweis des Meldungs-Zentrums (Paket O1) — nur lokal/SQLite, nie gegen Prod.
 * Etage 2: Supervisor „supervisor@“ zuständig; Zimmermädchen „maria@“ hat heute ein fertiges (CLEAN) und ein offenes Zimmer,
 * dazu eine Anreise (erfundener Platzhalter, kein echter Gast) auf dem offenen Zimmer. Ein drittes Zimmer ist frei
 * (wird im Test während „offline“ zugeteilt). Schreibt die IDs als JSON nach $OUT.
 */
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { berlinDate } from "../src/lib/dayplan/time";

const prisma = new PrismaClient();

async function main() {
  if (!/^file:/.test(process.env.DATABASE_URL ?? "")) throw new Error("Nur gegen eine lokale SQLite-DB ausführen.");
  const today = berlinDate(new Date());
  const by = (email: string) => prisma.user.findUniqueOrThrow({ where: { email } });
  const maria = await by("maria@hotel.test");
  const sup = await by("supervisor@hotel.test");
  const fo = await by("frontoffice@hotel.test");
  await prisma.user.update({ where: { id: sup.id }, data: { assignedFloors: "2" } });
  await prisma.user.updateMany({ where: { role: "supervisor", id: { not: sup.id } }, data: { assignedFloors: "5" } });
  await prisma.notification.deleteMany();
  await prisma.room.updateMany({ where: {}, data: { assignedToId: null, assignedOn: null, routeOrder: null } });

  const rooms = await prisma.room.findMany({ where: { floor: 2 }, orderBy: { number: "asc" }, take: 3 });
  const [a, b, c] = rooms;
  await prisma.room.update({ where: { id: a.id }, data: { status: "CLEAN", assignedToId: maria.id, assignedOn: today, routeOrder: 0, blockReason: null } });
  await prisma.room.update({ where: { id: b.id }, data: { status: "DIRTY", assignedToId: maria.id, assignedOn: today, routeOrder: 1, blockReason: null } });
  await prisma.room.update({ where: { id: c.id }, data: { status: "DIRTY", blockReason: null } });
  // Tagesplan vorhanden → Hubs zeigen Zimmer (Gate „Listen eingelesen“)
  await prisma.dayRoomPlan.deleteMany({ where: { date: today } });
  for (const r of rooms) await prisma.dayRoomPlan.create({ data: { date: today, roomId: r.id, cleaningType: "DEPARTURE" } });
  await prisma.arrival.deleteMany({ where: { roomId: { in: rooms.map((r) => r.id) } } });
  const arrival = await prisma.arrival.create({ data: { roomId: b.id, guestName: "Platzhalter", createdById: fo.id } });

  const out = { maria: maria.id, roomA: { id: a.id, number: a.number }, roomB: { id: b.id, number: b.number }, roomC: { id: c.id, number: c.number }, arrival: arrival.id };
  writeFileSync(process.env.OUT ?? "e2e-notify.json", JSON.stringify(out));
  console.log(JSON.stringify(out));
}

main().finally(() => prisma.$disconnect());
