import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";

/**
 * Sprachassistent (ElevenLabs Conversational AI) — nur für angemeldetes Personal.
 *
 * GET  → { enabled } — ob der Assistent-Knopf im AppShell erscheint.
 * POST → Sitzungsdaten für `startSession()`:
 *   - mit `ELEVENLABS_API_KEY`: kurzlebiger WebRTC-Token (Schlüssel bleibt serverseitig),
 *   - ohne Schlüssel: nur die Agent-ID (funktioniert nur bei öffentlichem Agenten).
 *
 * Konfiguration nur über Umgebungsvariablen (`ELEVENLABS_AGENT_ID`, optional
 * `ELEVENLABS_API_KEY`); ohne `ELEVENLABS_AGENT_ID` ist die Funktion aus.
 * Nie auf Gästeseiten (`/g/...`) verwenden — die haben ihre eigene, isolierte API.
 */
export const dynamic = "force-dynamic";

const agentId = () => process.env.ELEVENLABS_AGENT_ID?.trim() || "";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ enabled: Boolean(agentId()) });
}

export async function POST() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const id = agentId();
  if (!id) return NextResponse.json({ error: "Voice assistant not configured." }, { status: 503 });

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ agentId: id });

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(id)}`,
      { headers: { "xi-api-key": apiKey }, cache: "no-store" },
    );
    if (!res.ok) {
      console.error(`[voice-agent] token request failed: HTTP ${res.status}`);
      return NextResponse.json({ error: "Voice assistant unavailable." }, { status: 502 });
    }
    const { token } = (await res.json()) as { token?: string };
    if (!token) return NextResponse.json({ error: "Voice assistant unavailable." }, { status: 502 });
    return NextResponse.json({ conversationToken: token });
  } catch (e) {
    console.error("[voice-agent] token request error:", (e as Error).message);
    return NextResponse.json({ error: "Voice assistant unavailable." }, { status: 502 });
  }
}
