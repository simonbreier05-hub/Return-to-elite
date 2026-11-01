import { requireAuth } from "@/lib/rbac";
import type { ChatSession } from "@/lib/chat/service";

/** Jede Chat-Route: angemeldet sein reicht zum Betreten, die eigentlichen Rechte prüft `policy.ts` im Dienst. */
export async function chatAuth(): Promise<{ ok: true; s: ChatSession } | { ok: false; response: Response }> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;
  return { ok: true, s: { userId: auth.session.userId, role: auth.session.role, name: auth.session.name } };
}
