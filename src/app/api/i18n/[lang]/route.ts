import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { getRuntimeBundle } from "@/lib/i18n/runtimeBundle";

/**
 * GET /api/i18n/<lang> — maschinell übersetzte Oberflächentexte für Sprachen ohne eigene Datei (Prompt K1).
 * Nur angemeldet (jeder Aufruf kann Anbieterkosten auslösen). de/en/Prioritätssprachen → 404, die lädt der Client selbst.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ lang: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { lang } = await ctx.params;
  const bundle = await getRuntimeBundle(lang);
  if (!bundle) return NextResponse.json({ error: "Not available.", code: "NOT_AVAILABLE" }, { status: 404 });
  return NextResponse.json(bundle);
}
