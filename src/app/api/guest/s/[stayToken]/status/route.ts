import { resolveGuestAccessByStayToken } from "@/lib/guestServer";
import { guestStatusResponse } from "@/lib/guestStatusResponse";

export const dynamic = "force-dynamic";

/** GET /api/guest/s/<stayToken>/status — wie die Zimmer-Code-Variante, für den persönlichen Link (S1). */
export async function GET(_req: Request, { params }: { params: Promise<{ stayToken: string }> }) {
  const { stayToken } = await params;
  return guestStatusResponse(await resolveGuestAccessByStayToken(stayToken));
}
