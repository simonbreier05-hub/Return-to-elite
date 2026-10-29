import { prisma } from "@/lib/db";
import { ROOM_TYPES, type RoomType } from "@/lib/domain";

/**
 * Zimmerart aus den Opera-Listen. Die Parser lesen nur den **Code** (z. B. „DLX“); welche Zimmerart er bedeutet, steht in
 * `Setting roomTypeMap` (Code → Zimmerart, in den Einstellungen pflegbar) — nie geraten. Gesetzt wird nur, wenn das Zimmer noch
 * „UNVERIFIED“ ist (von Hand oder früher gesetzte Arten bleiben). `Setting roomTypeSeen` merkt sich Code → Zimmernummern des
 * letzten Imports, damit die Einstellungen unbekannte Codes anzeigen und ein neues Mapping sofort anwenden können.
 */
const MAP_KEY = "roomTypeMap";
const SEEN_KEY = "roomTypeSeen";

const parse = <T,>(raw: string | undefined, fallback: T): T => { try { return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; } };

export async function getRoomTypeMap(): Promise<Record<string, RoomType>> {
  const row = await prisma.setting.findUnique({ where: { key: MAP_KEY } });
  const raw = parse<Record<string, string>>(row?.value, {});
  return Object.fromEntries(Object.entries(raw).filter(([, v]) => (ROOM_TYPES as readonly string[]).includes(v) && v !== "UNVERIFIED")) as Record<string, RoomType>;
}
export async function getRoomTypeSeen(): Promise<Record<string, string[]>> {
  return parse<Record<string, string[]>>((await prisma.setting.findUnique({ where: { key: SEEN_KEY } }))?.value, {});
}
const put = (key: string, value: unknown) => prisma.setting.upsert({ where: { key }, create: { key, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } });

/** Mapping speichern und auf die zuletzt gesehenen, noch unbestimmten Zimmer anwenden. */
export async function saveRoomTypeMap(map: Record<string, string>): Promise<{ applied: number }> {
  const clean = Object.fromEntries(Object.entries(map).filter(([c, v]) => /^[A-Z][A-Z0-9]{1,5}$/.test(c) && (ROOM_TYPES as readonly string[]).includes(v) && v !== "UNVERIFIED"));
  await put(MAP_KEY, clean);
  return applyRoomTypes(await getRoomTypeSeen(), clean as Record<string, RoomType>);
}

/** `seen`: Code → Zimmernummern. Setzt die Art nur bei Zimmern, die noch UNVERIFIED sind. */
export async function applyRoomTypes(seen: Record<string, string[]>, map?: Record<string, RoomType>): Promise<{ applied: number }> {
  const m = map ?? (await getRoomTypeMap());
  let applied = 0;
  for (const [code, numbers] of Object.entries(seen)) {
    const type = m[code];
    if (!type || !numbers.length) continue;
    applied += (await prisma.room.updateMany({ where: { number: { in: numbers }, type: "UNVERIFIED" }, data: { type } })).count;
  }
  return { applied };
}

/** Beim Tagesplan-Merge: Codes der Listenzeilen merken und anwenden. Gibt Codes ohne Zuordnung zurück (Hinweis in der Oberfläche). */
export async function recordRoomTypes(rows: { room: string; roomType?: string | null }[]): Promise<{ applied: number; unmapped: string[] }> {
  const seen: Record<string, string[]> = {};
  for (const r of rows) if (r.roomType) (seen[r.roomType] ??= []).includes(r.room) || seen[r.roomType].push(r.room);
  if (!Object.keys(seen).length) return { applied: 0, unmapped: [] };
  const prev = await getRoomTypeSeen();
  const merged: Record<string, string[]> = { ...prev };
  for (const [c, ns] of Object.entries(seen)) merged[c] = [...new Set([...(merged[c] ?? []), ...ns])];
  await put(SEEN_KEY, merged);
  const map = await getRoomTypeMap();
  const { applied } = await applyRoomTypes(seen, map);
  return { applied, unmapped: Object.keys(seen).filter((c) => !map[c]).sort() };
}
