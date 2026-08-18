import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { RoleSchema } from "@/lib/domain";
import { devLoginEnabled } from "@/lib/devAuth";

/**
 * GET  — is quick login available, and who can I sign in as?
 * POST — sign in as that user without a password.
 *
 * Both return 404 when quick login is disabled, so a locked-down deployment
 * does not even advertise that the route exists.
 */

export async function GET() {
  if (!devLoginEnabled()) return NextResponse.json({ enabled: false }, { status: 404 });

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, email: true, name: true, role: true, section: true },
  });
  return NextResponse.json({ enabled: true, users });
}

const Body = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  if (!devLoginEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "email required." }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user) return NextResponse.json({ error: "Unknown user." }, { status: 404 });

  const role = RoleSchema.parse(user.role);
  const token = await createSessionToken({ userId: user.id, name: user.name, role });

  // Logged as its own action so a quick login is never mistaken for a real one.
  await audit({ action: "DEV_LOGIN", userId: user.id, meta: { email: user.email, role } });

  const res = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role },
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12,
    path: "/",
  });
  return res;
}
