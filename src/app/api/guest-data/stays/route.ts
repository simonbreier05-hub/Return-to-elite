import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";

/** GET /api/guest-data/stays?room=101 — Aufenthalte eines Zimmers für die Einzellöschung (Name nur als Vorhandensein). */
export async function GET(req: NextRequest) {
  const auth = await requireRole(["duty_manager"]);
  if (!auth.ok) return auth.response;
  const room = req.nextUrl.searchParams.get("room") ?? "";
  if (!/^\d{3,4}$/.test(room)) return NextResponse.json({ error: "Ungültige Zimmernummer." }, { status: 400 });
  const stays = await prisma.stay.findMany({ where: { room: { number: room } }, orderBy: { checkIn: "desc" }, take: 10 });
  return NextResponse.json({
    stays: stays.map((s) => ({
      id: s.id, checkIn: s.checkIn.toISOString().slice(0, 10), checkOut: s.checkOut.toISOString().slice(0, 10),
      status: s.status, hasName: s.guestName !== "",
    })),
  });
}
