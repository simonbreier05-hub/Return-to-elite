import { NextResponse } from "next/server";
import { listAllDirects } from "@/lib/chat/service";
import { chatAuth } from "../_session";

/** GET /api/chat/review — Direkt-Unterhaltungen (nur Beteiligte, kein Inhalt) für die Einsicht im Streitfall. Nur Duty Manager. */
export async function GET() {
  const a = await chatAuth();
  if (!a.ok) return a.response;
  const list = await listAllDirects(a.s);
  if (!list) return NextResponse.json({ error: "Nur Duty Manager." }, { status: 403 });
  return NextResponse.json({ directs: list });
}
