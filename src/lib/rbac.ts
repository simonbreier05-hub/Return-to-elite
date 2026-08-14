import { NextResponse } from "next/server";
import { getSession, type Session } from "./auth";
import type { Role } from "./domain";

/**
 * RBAC middleware for API routes. Usage:
 *
 *   const auth = await requireRole(["supervisor", "duty_manager"]);
 *   if (!auth.ok) return auth.response;
 *   const session = auth.session;
 *
 * duty_manager is the admin role and passes every check.
 */

export type AuthResult =
  | { ok: true; session: Session }
  | { ok: false; response: NextResponse };

export async function requireAuth(): Promise<AuthResult> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not authenticated." }, { status: 401 }),
    };
  }
  return { ok: true, session };
}

export async function requireRole(roles: Role[]): Promise<AuthResult> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;
  const { session } = auth;
  if (session.role !== "duty_manager" && !roles.includes(session.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Forbidden: requires one of [${roles.join(", ")}].` },
        { status: 403 }
      ),
    };
  }
  return auth;
}
