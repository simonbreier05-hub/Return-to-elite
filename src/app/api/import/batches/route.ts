import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { SubmitBatchSchema } from "@/lib/import/schema";
import { storeBatch } from "@/lib/import/store";
import type { ParseResult } from "@/lib/import/types";

/**
 * POST /api/import/batches — legt eine im Browser gelesene Opera-Liste als
 * Vorschau ab (nichts ist live, bevor /apply läuft). Der Server nimmt nur
 * Whitelist-Felder an (src/lib/import/schema.ts) und prüft die Zimmer gegen
 * den Zimmerstamm. Die Datei selbst erreicht den Server nie.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;

  const parsed = SubmitBatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    // Pfad statt Wert: nie Inhalt zurückspiegeln.
    const where = parsed.error.issues.slice(0, 3).map((i) => i.path.join(".")).join(", ");
    return NextResponse.json({ error: `Ungültige oder nicht erlaubte Felder: ${where}.` }, { status: 400 });
  }
  const v = parsed.data;
  const known = new Set((await prisma.room.findMany({ select: { number: true } })).map((r) => r.number));
  const result = {
    type: v.type, rows: v.rows, issues: v.issues, reportDate: v.reportDate, periodFrom: v.periodFrom, periodTo: v.periodTo,
    pagesSeen: 1, pagesTotal: null, dates: { format: "MDY", via: "unique" },
  } as unknown as ParseResult<never>;

  const { batch, issues, critical } = await storeBatch({ result, uploadedById: auth.session.userId, fileHash: v.fileHash, knownRooms: known });
  return NextResponse.json({ batchId: batch.id, critical, businessDate: batch.businessDate, rowCount: batch.rowCount, issues });
}
