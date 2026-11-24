import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseBerlinLocal, simulationAllowed, type ClockCommand } from "@/lib/clock";
import { clockInfo, ensureClockLoaded, runClockCommand, simTokenOk } from "@/lib/clockStore";

/**
 * S0 Simulationsuhr.
 *   GET  — Zustand für Bildschirme (ohne Simulation: { active: false, state: null }). Lädt nach einem Neustart aus der DB.
 *   POST — Uhr stellen; nur mit Header `x-sim-token` = SIM_CONTROL_TOKEN, sonst 403. In Produktion immer 403.
 * Befehle: status | set {at:"2026-12-07T07:00"} | faktor {faktor:3} | pause | weiter | naechster-tag {hhmm:"07:00"} | echt
 */
export const dynamic = "force-dynamic";

export async function GET() {
  await ensureClockLoaded();
  return NextResponse.json(clockInfo(), { headers: { "cache-control": "no-store" } });
}

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const Body = z.discriminatedUnion("cmd", [
  z.object({ cmd: z.literal("status") }),
  z.object({ cmd: z.literal("set"), at: z.string() }),
  z.object({ cmd: z.literal("faktor"), faktor: z.number().min(0.1).max(120) }),
  z.object({ cmd: z.literal("pause") }),
  z.object({ cmd: z.literal("weiter") }),
  z.object({ cmd: z.literal("naechster-tag"), hhmm: HHMM }),
  z.object({ cmd: z.literal("echt") }),
]);

export async function POST(req: NextRequest) {
  if (!simulationAllowed() || !simTokenOk(req.headers.get("x-sim-token"), process.env.SIM_CONTROL_TOKEN)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültiger Befehl" }, { status: 400 });
  await ensureClockLoaded();
  const b = parsed.data;
  if (b.cmd === "status") return NextResponse.json(clockInfo());
  let c: ClockCommand;
  if (b.cmd === "set") {
    const at = parseBerlinLocal(b.at);
    if (Number.isNaN(at)) return NextResponse.json({ error: "Format: JJJJ-MM-TTTHH:MM (Berlin)" }, { status: 400 });
    c = { cmd: "set", at };
  } else c = b;
  return NextResponse.json(await runClockCommand(c));
}
