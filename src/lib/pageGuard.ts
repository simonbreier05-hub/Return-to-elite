import { redirect } from "next/navigation";
import { getSession, type Session } from "./auth";
import type { Role } from "./domain";

/** Server-component guard: redirect to /login when unauthenticated, to / when the role doesn't fit. */
export async function requirePage(roles: Role[]): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "duty_manager" && !roles.includes(session.role)) redirect("/");
  return session;
}
