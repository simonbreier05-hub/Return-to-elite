import { prisma } from "./db";

/**
 * Datenschutz-/Impressum-Links des Gäste-Screens (D6). Kommen aus der
 * `Setting`-Tabelle (Schlüssel unten), damit jedes Haus seine eigenen
 * Adressen einträgt — kein fester Link im Code. Leer/ungültig = Link wird
 * nicht angezeigt. Nur `https://…`/`http://…` oder ein Pfad im eigenen Haus
 * (`/…`) werden akzeptiert, nie `javascript:` o. Ä.
 */
export const GUEST_PRIVACY_URL_KEY = "guestPrivacyUrl";
export const GUEST_IMPRINT_URL_KEY = "guestImprintUrl";

export interface GuestLegalLinkUrls {
  privacy: string | null;
  imprint: string | null;
}

export function sanitizeLegalUrl(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (v.startsWith("/") && !v.startsWith("//")) return v;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export async function getGuestLegalLinks(): Promise<GuestLegalLinkUrls> {
  try {
    const rows = await prisma.setting.findMany({ where: { key: { in: [GUEST_PRIVACY_URL_KEY, GUEST_IMPRINT_URL_KEY] } } });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return { privacy: sanitizeLegalUrl(map[GUEST_PRIVACY_URL_KEY]), imprint: sanitizeLegalUrl(map[GUEST_IMPRINT_URL_KEY]) };
  } catch {
    // Links sind Beiwerk — ein DB-Fehler hier darf den Gäste-Screen nicht kippen.
    return { privacy: null, imprint: null };
  }
}
