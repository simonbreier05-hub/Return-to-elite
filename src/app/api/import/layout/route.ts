import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { ImportTypeSchema } from "@/lib/domain";

const Body = z.object({ type: ImportTypeSchema, dateFormat: z.enum(["MDY", "DMY"]) }).strict();

/** GET /api/import/layout — gespeichertes Datumsformat je Listentyp (Layout). */
export async function GET() {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const rows = await prisma.importMapping.findMany();
  const layout: Record<string, "MDY" | "DMY"> = {};
  for (const r of rows) {
    try { const f = (JSON.parse(r.config) as { dateFormat?: string }).dateFormat; if (f === "MDY" || f === "DMY") layout[r.type] = f; } catch { /* ignorieren */ }
  }
  return NextResponse.json({ layout });
}

/** PUT /api/import/layout — nach Bestätigung durch den Nutzer das erkannte Datumsformat als Layout speichern. */
export async function PUT(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Angaben." }, { status: 400 });
  const { type, dateFormat } = parsed.data;
  const config = JSON.stringify({ dateFormat });
  await prisma.importMapping.upsert({ where: { type }, create: { type, config }, update: { config } });
  return NextResponse.json({ ok: true });
}
