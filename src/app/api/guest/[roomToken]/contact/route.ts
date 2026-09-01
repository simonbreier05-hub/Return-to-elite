import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardGuestRequest } from "@/lib/rooms/resolveGuestRoom";
import { contactDepartment, GUEST_CONTACT_DEPARTMENTS } from "@/lib/rooms/contactDepartment";

/** POST /api/guest/[roomToken]/contact — "Abteilung kontaktieren". */
const Body = z.object({
  department: z.enum(GUEST_CONTACT_DEPARTMENTS),
  message: z.string().trim().min(1).max(500),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomToken: string }> }) {
  const { roomToken } = await params;
  const gate = await guardGuestRequest(req, roomToken, "contact", { limit: 5, windowMs: 60_000 });
  if (!gate.ok) return gate.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });

  const { room, guestSource } = gate;
  const notification = await contactDepartment(
    room.id,
    room.number,
    parsed.data.department,
    parsed.data.message,
    guestSource
  );

  return NextResponse.json({ notification }, { status: 201 });
}
