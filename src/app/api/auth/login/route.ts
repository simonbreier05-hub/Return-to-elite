import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { RoleSchema } from "@/lib/domain";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid credentials payload." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  const valid = user && (await bcrypt.compare(parsed.data.password, user.passwordHash));
  if (!user || !valid) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const role = RoleSchema.parse(user.role);
  const token = await createSessionToken({ userId: user.id, name: user.name, role });
  await audit({ action: "LOGIN", userId: user.id });

  const res = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role, section: user.section },
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
