import type { PrismaClient } from "@prisma/client";
import { generateOpaqueToken } from "../src/lib/guestToken";

/**
 * Der eine Demo-Aufenthalt für die Gast-Vorschau auf der Login-Seite (Zimmer 301, `/g/r/<Code>`). Nur zur Ansicht:
 * source "DEMO", läuft nie ab. Nachtlöschung (guestDataPurge) und Tagesdaten-Aufräumen (reset-day-data) lassen ihn aus.
 */
export async function ensureDemoStay(prisma: PrismaClient) {
  const room = await prisma.room.findUnique({ where: { number: "301" } });
  if (!room) return;
  if (await prisma.stay.findFirst({ where: { roomId: room.id, source: "DEMO" } })) return;
  await prisma.stay.create({
    data: {
      roomId: room.id, guestName: "Alex Guest", language: "de", source: "DEMO",
      checkIn: new Date("2026-01-01T12:00:00Z"), checkOut: new Date("2099-12-31T10:00:00Z"),
      status: "IN_HOUSE", stayToken: generateOpaqueToken(),
    },
  });
}
