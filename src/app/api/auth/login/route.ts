import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { RoleSchema } from "@/lib/domain";
import { devLoginEnabled } from "@/lib/devAuth";

/**
 * The identifier is normally an email. Outside production it may also be a
 * short position handle below, so a tester can type a role name on a tablet
 * keyboard instead of an address — every seeded password is "123", so typing
 * a position plus 123/123 reaches that department in two fields.
 */
const LoginSchema = z.object({
  email: z.string().min(1).max(200),
  password: z.string().min(1),
});

/**
 * Position → the account it resolves to. Room attendant has ten people
 * sharing that position, so the handle reaches one of them (Maria, already
 * the one every other quick-login path defaults to); the quick-login screen
 * or the header role switcher reach the rest by name.
 *
 * Keys are matched after normalizeHandle() strips spaces/underscores/hyphens
 * and lowercases, so "front office", "front_office" and "FrontOffice" all
 * land on the same row — a tester should not have to guess the exact spelling.
 */
const POSITION_HANDLES: Record<string, string> = {
  "123": "manager@hotel.test", // kept for anyone already used to it
  manager: "manager@hotel.test",
  dutymanager: "manager@hotel.test",
  supervisor: "supervisor@hotel.test",
  frontoffice: "frontoffice@hotel.test",
  reception: "frontoffice@hotel.test",
  concierge: "concierge@hotel.test",
  engineering: "engineering@hotel.test",
  maintenance: "engineering@hotel.test",
  attendant: "maria@hotel.test",
  roomattendant: "maria@hotel.test",
  housekeeping: "maria@hotel.test",
};

function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid credentials payload." }, { status: 400 });
  }

  const rawIdentifier = parsed.data.email.trim();

  // Resolve a position handle to a real account. Gated on the same switch as
  // the password-less quick login, so production only ever accepts a real
  // address — a handle is a shortcut for testers, not a second credential.
  const handleEmail = devLoginEnabled() ? POSITION_HANDLES[normalizeHandle(rawIdentifier)] : undefined;
  const isDevHandle = handleEmail !== undefined;
  if (!isDevHandle && !rawIdentifier.includes("@")) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: isDevHandle ? handleEmail : rawIdentifier.toLowerCase() },
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
