import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { RoleSchema } from "@/lib/domain";
import { devLoginEnabled } from "@/lib/devAuth";

/**
 * The identifier is normally an email. Outside production it may also be the
 * short development handle below, so a tester can type something on a tablet
 * keyboard instead of an address.
 */
const LoginSchema = z.object({
  email: z.string().min(1).max(200),
  password: z.string().min(1),
});

/** Dev shortcut: 123 / 123 signs in as the duty manager (widest access). */
const DEV_HANDLE = "123";
const DEV_HANDLE_USER = "manager@hotel.test";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid credentials payload." }, { status: 400 });
  }

  const identifier = parsed.data.email.trim().toLowerCase();

  // Resolve the dev handle to a real account. Gated on the same switch as the
  // password-less quick login, so production only ever accepts an address.
  const isDevHandle = devLoginEnabled() && identifier === DEV_HANDLE;
  if (!isDevHandle && !identifier.includes("@")) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: isDevHandle ? DEV_HANDLE_USER : identifier },
  });
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
