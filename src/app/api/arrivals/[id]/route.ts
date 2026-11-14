import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import { notifyHousekeeperOfRoomChange } from "@/lib/rooms/notifyRoomChange";
import { notifyFloorSupervisors } from "@/lib/rooms/notifyFloorSupervisors";
import { keyed } from "@/lib/i18n/notificationText";

const PatchSchema = z.object({
  eta: z.coerce.date().nullable().optional(),
  vip: z.boolean().optional(),
  earlyCheckIn: z.boolean().optional(),
  neededNow: z.boolean().optional(),
  status: z.enum(["EXPECTED", "CHECKED_IN", "CANCELLED"]).optional(),
});

/**
 * PATCH /api/arrivals/[id] — front office edits ETA/flags/check-in.
 * Planung L1 (Regel 10): Rush/Sofort (`neededNow`) dürfen Front Office **und Supervisor** setzen (Duty Manager immer);
 * der Supervisor darf hier nur dieses eine Feld ändern. Das Zimmer springt in der Housekeeper-Liste ganz nach oben
 * (`src/lib/planung/listOrder.ts`), die Kraft bekommt eine Meldung (unten, `notifyHousekeeperOfRoomChange`).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["front_office", "supervisor"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload.", code: "INVALID_INPUT" }, { status: 400 });
  if (auth.session.role === "supervisor" && Object.keys(parsed.data).some((k) => k !== "neededNow")) {
    return NextResponse.json({ error: "Supervisor dürfen nur „Sofort“ setzen.", code: "FORBIDDEN" }, { status: 403 });
  }

  const existing = await prisma.arrival.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Arrival not found.", code: "ARRIVAL_NOT_FOUND" }, { status: 404 });

  const arrival = await prisma.arrival.update({
    where: { id },
    data: parsed.data,
    include: { room: { select: { id: true, number: true, status: true } } },
  });
  await audit({ action: "ARRIVAL_UPDATED", userId: auth.session.userId, roomId: arrival.roomId, meta: parsed.data });
  broadcast("arrival:update", { arrival });
  // VIP/„wird jetzt gebraucht“/ETA ändern die Priorität des Zimmers — das zuständige Zimmermädchen erfährt es live.
  const prioChanged = (["vip", "neededNow"] as const).some((k) => parsed.data[k] !== undefined && parsed.data[k] !== existing[k])
    || (parsed.data.eta !== undefined && (parsed.data.eta?.getTime() ?? null) !== (existing.eta?.getTime() ?? null));
  if (prioChanged) await notifyHousekeeperOfRoomChange({ roomId: arrival.roomId, kind: "PRIORITY", actorId: auth.session.userId });

  // „Sofort gebraucht“ oder VIP-Frühanreise neu gesetzt → auch der Supervisor der Etage (Zimmer muss zuerst freigegeben werden).
  // Ohne Gastnamen: nur Zimmer, Etage und Anlass.
  const nowNeeded = parsed.data.neededNow === true && !existing.neededNow;
  const vipEarly = !!(arrival.vip && arrival.earlyCheckIn) && !(existing.vip && existing.earlyCheckIn);
  if (nowNeeded || vipEarly) {
    const room = await prisma.room.findUnique({ where: { id: arrival.roomId }, select: { id: true, number: true, floor: true } });
    if (room) {
      const what = nowNeeded ? "sofort gebraucht" : "VIP-Frühanreise";
      await notifyFloorSupervisors({
        room, actorId: auth.session.userId, type: "ARRIVAL_PRIORITY", level: "warning",
        message: `Zimmer ${room.number} (Etage ${room.floor}): ${what} — bitte zuerst fertig machen und freigeben.`,
        k: keyed(nowNeeded ? "notify.arrivalNeededNow" : "notify.arrivalVipEarly", { n: room.number, floor: room.floor }),
      });
    }
  }
  return NextResponse.json({ arrival });
}
