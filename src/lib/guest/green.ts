import { prisma } from "@/lib/db";
import { berlinToUtc } from "@/lib/dayplan/time";

/**
 * Betrieb L2 (Punkt 11): „Green Option“ — der Gast verzichtet heute auf den Wäschewechsel (Entscheidung 14.11.2026:
 * gilt nur für den Tag, an dem er gewählt wurde; am nächsten Tag ist der Wechsel wieder fällig, der Gast kann neu wählen).
 * Gespeichert als `GuestRequest` kind `GREEN` (kein Schema nötig). Eine Quelle für Listen (`loadRoomRows`) und Planung (`loadDay`).
 * Ändert nie `Room.status` (das ist „Green Opt-Out“ = ganze Reinigung entfällt, etwas anderes).
 */
export const GREEN_KIND = "GREEN";

/** Zimmer-Ids, deren Gast am Tag `date` (YYYY-MM-DD, Berlin) die Green Option gewählt hat. */
export async function greenRoomsOn(date: string, roomIds?: string[]): Promise<Set<string>> {
  const from = berlinToUtc(date, "00:00");
  const to = new Date(from.getTime() + 24 * 3_600_000);
  const rows = await prisma.guestRequest.findMany({
    where: { kind: GREEN_KIND, status: { not: "CANCELLED" }, createdAt: { gte: from, lt: to }, ...(roomIds ? { roomId: { in: roomIds } } : {}) },
    select: { roomId: true },
  });
  return new Set(rows.map((r) => r.roomId));
}
