import { NextRequest, NextResponse } from "next/server";
import { reviewChannel } from "@/lib/chat/service";
import { chatAuth } from "../../_session";

/** GET /api/chat/review/[id]?caseRef=AZ-2026/12 — Einsicht im Streitfall: nur Duty Manager, nur mit Aktenzeichen, protokolliert. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await chatAuth();
  if (!a.ok) return a.response;
  const { id } = await params;
  const r = await reviewChannel(a.s, id, req.nextUrl.searchParams.get("caseRef") ?? "");
  if (!r) return NextResponse.json({ error: "Nur Duty Manager, mit gültigem Aktenzeichen." }, { status: 403 });
  return NextResponse.json(r);
}
