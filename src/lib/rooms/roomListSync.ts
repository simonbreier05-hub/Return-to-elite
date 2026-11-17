import type { PrismaClient } from "@prisma/client";
import { FLOOR_PLAN } from "../floorplan/hotelDeRome";
import { planRoomListSync, ROOM_LIST, type ExistingRoom, type RoomListPlan } from "./roomList";
import { generateOpaqueToken } from "../guestToken";

/**
 * Wendet die offizielle Zimmerliste auf die DB an (DB-Teil zu `planRoomListSync`). Nur additiv:
 * legt fehlende Zimmer an, setzt Etage/Typ/Credit, deaktiviert Zimmer außerhalb der Liste — löscht nie etwas,
 * fasst Status, Zuteilung, Belegung und Gastdaten nicht an. `apply: false` = dry-run (nur der Plan).
 */
export async function syncRoomList(prisma: PrismaClient, { apply }: { apply: boolean }): Promise<RoomListPlan> {
  let existing: ExistingRoom[];
  try {
    existing = await prisma.room.findMany({ select: { number: true, floor: true, type: true, credit: true, active: true } });
  } catch (e) {
    // dry-run gegen eine DB ohne die neuen Spalten (vor `db push`): nur lesen, Credit leer, alle aktiv. Apply braucht die Spalten.
    if (apply) throw e;
    const rows = await prisma.$queryRawUnsafe<{ number: string; floor: number; type: string }[]>(`SELECT "number", "floor", "type" FROM "Room"`);
    existing = rows.map((r) => ({ number: r.number, floor: Number(r.floor), type: r.type, credit: null, active: true }));
  }
  const plan = planRoomListSync(existing);
  if (!apply) return plan;
  const sectionOf = new Map(Object.values(FLOOR_PLAN).flat().map((e) => [e.number, e.section]));
  await prisma.$transaction(async (tx) => {
    for (const e of plan.create) {
      await tx.room.create({
        data: {
          number: e.number, floor: e.floor, section: sectionOf.get(e.number) ?? String(e.floor), type: e.type, credit: e.credit, active: true,
          status: "INSPECTED", statusSince: new Date("2000-01-01T00:00:00Z"), // wie der Seed: heute nicht bearbeitet
        },
      });
    }
    for (const { entry: e } of plan.update) {
      await tx.room.update({ where: { number: e.number }, data: { floor: e.floor, type: e.type, credit: e.credit, active: true } });
    }
    if (plan.deactivate.length) await tx.room.updateMany({ where: { number: { in: plan.deactivate } }, data: { active: false } });
  }, { timeout: 60_000 });
  await ensureAllRoomAccessCodes(prisma);
  return plan;
}

/**
 * S1: Jedes Zimmer hat seinen festen Gastcode (QR/NFC) schon ab Seed bzw. Zimmerlisten-Abgleich — nicht erst, wenn
 * jemand die Code-Seite öffnet. Vergibt nur fehlende Codes; vorhandene (gedruckte) Codes bleiben unverändert.
 */
export async function ensureAllRoomAccessCodes(prisma: PrismaClient): Promise<number> {
  const missing = await prisma.room.findMany({ where: { guestAccessCode: null }, select: { id: true } });
  for (const r of missing) {
    for (let attempt = 0; ; attempt++) {
      try {
        await prisma.room.update({ where: { id: r.id }, data: { guestAccessCode: generateOpaqueToken() } });
        break;
      } catch (err) {
        const clash = typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
        if (!clash || attempt >= 4) throw err;
      }
    }
  }
  return missing.length;
}

export const ROOM_LIST_TOTALS = {
  rooms: ROOM_LIST.length,
  credits: ROOM_LIST.reduce((n, e) => n + e.credit, 0),
};
