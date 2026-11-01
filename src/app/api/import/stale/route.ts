import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/rbac";
import { ImportTypeSchema } from "@/lib/domain";
import { acceptStaleList } from "@/lib/import/store";

const Body = z.object({ type: ImportTypeSchema }).strict();

/** POST /api/import/stale — „Trotzdem verwenden“: veraltete Liste (Dateidatum ≠ Betriebstag) bestätigen. Protokolliert im Logbuch. */
export async function POST(req: NextRequest) {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültiger Listentyp." }, { status: 400 });
  try {
    const businessDate = await acceptStaleList(parsed.data.type, auth.session.userId);
    return NextResponse.json({ ok: true, businessDate });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Bestätigen fehlgeschlagen." }, { status: 409 });
  }
}
