import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { floorsFor } from "@/lib/lists/supervisorList";
import { loadFeed } from "@/lib/supervisorFeed/load";
import { FEED_MAX_LIMIT, FEED_PAGE_SIZE } from "@/lib/supervisorFeed/rules";

/**
 * GET /api/supervisor/feed?limit=30 — „Das ist jetzt wichtig“: heutige Ereignisse (Logbuch + Eskalationen) der eigenen
 * Etagen, zusammengefasst und gewichtet (Regeln in `src/lib/supervisorFeed/rules.ts`). Supervisor nur eigene Etagen
 * (`floorsFor`, ohne Etagen leer + `noFloors`), Duty Manager das ganze Haus. Ohne Freitext/Gastnamen.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const asked = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(asked) && asked > 0 ? Math.min(Math.floor(asked), FEED_MAX_LIMIT) : FEED_PAGE_SIZE;
  const floors = await floorsFor(auth.session);
  const { items, hasMore } = await loadFeed(floors, auth.session.userId, limit);
  return NextResponse.json({ floors, scope: auth.session.role === "supervisor" ? "own" : "house", noFloors: floors.length === 0, items, hasMore });
}
