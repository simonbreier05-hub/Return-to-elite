import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/rbac";
import { applyDayPlanToBoard, mergeDay } from "@/lib/dayplan/merge";
import { broadcast } from "@/lib/realtime";
import { checkRedistribution } from "@/lib/autoplan/service";
import { listBlockersNow } from "@/lib/import/store";
import { latestPlanDate } from "@/lib/dayplan/latest";

const Body = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).strict();

/**
 * POST /api/dayplan/merge — Aufenthalte, Traces und Tagesplan des Betriebstags aus den übernommenen Listen berechnen
 * und gleich aufs Board übernehmen (Belegung, Abreise, erwartete Anreisen). Der Planungshub ist die einzige Quelle
 * für die Tagesdaten; es gibt keinen zweiten, manuellen Schritt mehr.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Ungültiges Datum.", code: "INVALID_DATE" }, { status: 400 });
  const { missing, stale } = await listBlockersNow();
  if (missing.length) return NextResponse.json({ error: `Es fehlen noch Listen: ${missing.join(", ")}.`, code: "LISTS_MISSING", missing }, { status: 409 });
  if (stale.length) return NextResponse.json({ error: `Veraltete Listen ohne Bestätigung: ${stale.map((s) => `${s.type} (${s.businessDate})`).join(", ")}.`, code: "LISTS_STALE", stale }, { status: 409 });
  const date = await latestPlanDate(); // Betriebstag
  if (parsed.data.date && parsed.data.date !== date) return NextResponse.json({ error: `Der Tagesplan wird nur für den Betriebstag ${date} berechnet.`, code: "NOT_BUSINESS_DAY" }, { status: 409 });
  try {
    const result = await mergeDay(date, auth.session.userId);
    const board = await applyDayPlanToBoard(date, auth.session.userId);
    // Neuer Turn / geänderte Reinigungsart: Umverteilung prüfen (Fehler hier dürfen den Tagesplan nicht kippen).
    await checkRedistribution(date).catch(() => null);
    // Haus-Ansicht live aktualisieren (nur Zimmernummern, keine Gastdaten)
    broadcast("dayplan:updated", { date, changedRooms: result.changedRooms });
    return NextResponse.json({ ...result, board });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Berechnung fehlgeschlagen." }, { status: 409 });
  }
}
