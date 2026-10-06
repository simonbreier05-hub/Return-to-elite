import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { buildArrivalsPdf, buildDeparturesPdf, buildForecastPdf, buildTracesPdf } from "@/lib/import/sample/build";
import { todayScenario } from "@/lib/import/sample/scenario";

/**
 * GET /api/import/sample?file=arrivals|arrivals_page1|departures|forecast|traces
 *
 * Beispiel-PDFs im Opera-Layout mit ERFUNDENEN Namen, datiert auf heute und mit
 * echten Zimmern des Hotels — zum Ausprobieren des Morgen-Imports ohne echte
 * Gastdaten. Enthält absichtlich Kartennummern/Preise/Salden, die der Import verwerfen muss.
 */
const FILES = ["arrivals", "arrivals_page1", "departures", "forecast", "traces"] as const;

export async function GET(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;

  const file = req.nextUrl.searchParams.get("file") as (typeof FILES)[number] | null;
  if (!file || !FILES.includes(file)) return NextResponse.json({ error: "Unbekannte Beispieldatei." }, { status: 400 });

  const all = (await prisma.room.findMany({ select: { number: true }, orderBy: { number: "asc" } }))
    .map((r) => r.number).filter((n) => /^\d{3,4}$/.test(n));
  if (all.length < 20) return NextResponse.json({ error: "Zu wenige Zimmer im Zimmerstamm für das Beispiel." }, { status: 409 });
  const rooms = Array.from({ length: 20 }, (_, i) => all[Math.floor((i * all.length) / 20)]); // gleichmäßig über das Haus verteilt

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const sc = todayScenario(today, rooms, (await getSettings()).roomInventory);
  const bytes = {
    arrivals: () => buildArrivalsPdf(sc),
    arrivals_page1: () => buildArrivalsPdf(sc, { onlyFirstPage: true }),
    departures: () => buildDeparturesPdf(sc),
    forecast: () => buildForecastPdf(sc),
    traces: () => buildTracesPdf(sc),
  }[file]();
  const name = { arrivals: "res_detail", arrivals_page1: "res_detail_nur_seite_1", departures: "departure_all", forecast: "history_forecast", traces: "traces_all" }[file];
  return new NextResponse(Buffer.from(await bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="beispiel_${name}_${today}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
