import { NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { dataStatus } from "@/lib/import/store";
import { berlinToday } from "@/lib/import/businessDay";
import { planStatus } from "@/lib/import/deleteList";
import { importHistory } from "@/lib/import/history";

/** GET /api/import/status — "Stand der Daten" je Liste (für Import-Seite und Planungshub) + Plan-Hinweis für den Betriebstag. */
export async function GET() {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const today = berlinToday();
  // F4-Nachtrag (M8): Importverlauf des Tages (wer, wann, welche Liste)
  return NextResponse.json({ status: await dataStatus(), today, plan: await planStatus(today), history: await importHistory(today) });
}
