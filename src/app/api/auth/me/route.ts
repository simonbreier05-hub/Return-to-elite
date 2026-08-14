import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const user = await prisma.user.findUnique({
    where: { id: auth.session.userId },
    select: { id: true, name: true, email: true, role: true, section: true, currentRoomId: true },
  });
  return NextResponse.json({ user });
}
