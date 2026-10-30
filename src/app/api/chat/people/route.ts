import { NextResponse } from "next/server";
import { peopleFor } from "@/lib/chat/service";
import { chatAuth } from "../_session";

/** GET /api/chat/people — wem ich eine Direktnachricht schreiben darf (Housekeeper-Regel bereits angewandt). */
export async function GET() {
  const a = await chatAuth();
  if (!a.ok) return a.response;
  return NextResponse.json({ people: await peopleFor(a.s) });
}
