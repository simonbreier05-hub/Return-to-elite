import { NextResponse } from "next/server";
import { getChatSettings } from "@/lib/settings";

/** GET /api/i18n/default — Hotel-Standardsprache (für die Login-Seite, keine Anmeldung nötig; kein Geheimnis). */
export async function GET() {
  const { hotelDefaultLanguage } = await getChatSettings();
  return NextResponse.json({ language: hotelDefaultLanguage });
}
