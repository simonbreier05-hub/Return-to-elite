import { NextResponse } from "next/server";
import { retractOrHide } from "@/lib/chat/service";
import { chatAuth } from "../../../_session";

/** POST /api/chat/messages/[id]/retract — Autor binnen 5 Minuten (zurückgezogen) oder Duty Manager (ausgeblendet); gekennzeichnet, kein Bearbeiten. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await chatAuth();
  if (!a.ok) return a.response;
  const { id } = await params;
  const r = await retractOrHide(a.s, id);
  if (r === "ok") return NextResponse.json({ ok: true });
  const status = r === "notFound" ? 404 : 403;
  return NextResponse.json({ error: r === "tooLate" ? "Zurückziehen ist nur in den ersten 5 Minuten möglich." : "Nicht erlaubt." }, { status });
}
