import { now as clockNow } from "@/lib/clock";
import { prisma } from "@/lib/db";
import { berlinDate, berlinToUtc } from "@/lib/dayplan/time";
import { classifyTraceText } from "@/lib/import/traceClassifier";
import { parseCleanWish } from "@/lib/planung/listOrder";
import { GREEN_KIND } from "@/lib/guest/green";

/**
 * F8 (entschieden 16.11.2026): Vorschlag fürs Opera-Gastprofil nach der Abreise. StayClean baut kein eigenes Profil und
 * schreibt nie nach Opera — der Duty Manager übernimmt die Punkte von Hand.
 *
 * Nur REGELBASIERT aus strukturierten Daten (keine Auswertung von Freitext, keine KI):
 *  - Reinigung „ab HH:MM“ an mindestens 2 Tagen → bevorzugte Reinigungszeit (häufigste Uhrzeit),
 *  - Green Option an mindestens 2 Tagen → verzichtet auf täglichen Wäschewechsel,
 *  - Babybett / Extrabett / Twin-Aufbau (Opera-Hinweis bzw. Hausmann-Aufgabe) → Hinweis,
 * (Review: „wiederkehrender Opera-Code“ gestrichen — Codes sind Abteilungskürzel, und nach der Nachtlöschung fehlt der
 *  Text, an dem Gesundheitsdaten zu erkennen wären. Nur noch Punkte aus einer festen, harmlosen Positivliste.)
 * Annahme: Schwelle „2×“. Gibt es nichts Brauchbares, entsteht KEIN Vorschlag.
 *
 * Nie im Vorschlag (Annahme Art. 9 DSGVO): Gesundheitsdaten (Allergien, Diät mit Gesundheitsbezug, Medizinisches,
 * Barrierefreiheit), Mängel, Beschwerden und jeder Freitext. Ein Trace, dessen Code oder Text auf eine dieser Arten
 * hinweist, wird komplett übergangen (`isExcludedTrace`).
 */
export const PROFILE_MIN_DAYS = 2;

/** Ausgeschlossene Arten (Art. 9 DSGVO / Beschwerden) — als Code-Bestandteil oder im Trace-Text. Getestet. */
export const EXCLUDED_PROFILE_TYPES = [
  "ALLERG", "ALLERGIE", "ALLERGY", "DIAET", "DIÄT", "DIET", "GLUTEN", "LAKTOSE", "LACTOSE", "NUSS", "NUT", "MEDIC", "MEDIZIN", "INSULIN",
  "KRANK", "SICK", "HEALTH", "GESUND", "ROLLSTUHL", "WHEELCHAIR", "HANDICAP", "BARRIER", "ACCESSIB", "BEHINDER", "DISAB", "COMPLAINT", "BESCHWERDE", "DEFECT", "MANGEL",
  "HALAL", "KOSCHER", "KOSHER", "SCHWANGER", "PREGNAN", "DIABET", "ASTHMA", "HÖRGERÄT", "HEARING", "BLIND", "VEGAN", "VEGETAR",
] as const;

export function isExcludedTrace(t: { code: string; text: string }): boolean {
  const hay = `${t.code} ${t.text}`.toUpperCase();
  return EXCLUDED_PROFILE_TYPES.some((x) => hay.includes(x));
}

const BABY_COT = /baby\s*(cot|bett|crib)|kinderbett|babybett|\bcrib\b|\bcot\b/i;

export type ProfileItemCode = "CLEAN_AFTER" | "NO_DAILY_LINEN" | "BABY_COT" | "EXTRA_BED" | "TWIN";
export interface ProfileItem { code: ProfileItemCode; vars?: Record<string, string>; status: "OPEN" | "TAKEN" | "DISCARDED" }

/** Rein: Punkte aus den strukturierten Daten eines Aufenthalts. */
export function profileItemsFrom(input: {
  cleanWishes: { detail: string | null; createdAt: Date }[];
  green: { createdAt: Date }[];
  traces: { code: string; text: string; date: string }[];
}): ProfileItem[] {
  const items: ProfileItem[] = [];
  // Reinigung „ab HH:MM“ an ≥ 2 Tagen → häufigste Uhrzeit
  const afterByDay = new Map<string, string>();
  for (const w of input.cleanWishes) { const a = parseCleanWish(w.detail).cleanAfter; if (a) afterByDay.set(berlinDate(w.createdAt), a); }
  if (afterByDay.size >= PROFILE_MIN_DAYS) {
    const count = new Map<string, number>();
    for (const t of afterByDay.values()) count.set(t, (count.get(t) ?? 0) + 1);
    const time = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    items.push({ code: "CLEAN_AFTER", vars: { time }, status: "OPEN" });
  }
  // Green Option an ≥ 2 Tagen
  if (new Set(input.green.map((g) => berlinDate(g.createdAt))).size >= PROFILE_MIN_DAYS) items.push({ code: "NO_DAILY_LINEN", status: "OPEN" });
  // Opera-Hinweise: Gesundheitsdaten/Beschwerden komplett übergehen; Ausstattung als Hinweis; wiederkehrende Codes nur als Typ
  const usable = input.traces.filter((t) => !isExcludedTrace(t));
  const flags = new Set<ProfileItemCode>();
  for (const t of usable) {
    if (BABY_COT.test(t.text)) { flags.add("BABY_COT"); continue; }
    const c = classifyTraceText(t.text);
    if (c?.type === "TWIN_SETUP") { flags.add("TWIN"); continue; }
    if (c?.type === "SONSTIGES") { flags.add("EXTRA_BED"); continue; }
  }
  for (const f of ["BABY_COT", "EXTRA_BED", "TWIN"] as const) if (flags.has(f)) items.push({ code: f, status: "OPEN" });
  return items;
}

/**
 * Baut den Vorschlag für einen abgereisten Aufenthalt — einmal je Aufenthalt (`stayId` eindeutig; Rücknahme und erneuter
 * Check-out legen keinen zweiten an). Ohne brauchbare Punkte: nichts. Gibt die Id zurück oder null.
 */
export async function buildProfileSuggestion(stayId: string, now = clockNow()): Promise<string | null> {
  if (await prisma.profileSuggestion.findUnique({ where: { stayId }, select: { id: true } })) return null;
  // Schon einmal erzeugt und danach erledigt/gelöscht? Logbuch merkt es sich (nur Id, kein Name).
  if (await prisma.auditLog.findFirst({ where: { action: "PROFILE_SUGGESTION_CREATED", meta: { contains: stayId } }, select: { id: true } })) return null;
  const stay = await prisma.stay.findUnique({ where: { id: stayId }, include: { room: { select: { number: true } } } });
  if (!stay) return null;
  // Nur der eigene Aufenthalt: Einträge mit seiner stayId, oder ohne stayId im Zimmer während seines Aufenthalts —
  // nie Einträge eines anderen Aufenthalts (Turn: der Neuankömmling; Zimmerwechsel: der Vorbeleger).
  const window = { gte: stay.checkIn, lte: now };
  const [requests, traces] = await Promise.all([
    prisma.guestRequest.findMany({ where: { OR: [{ stayId }, { stayId: null, roomId: stay.roomId, createdAt: window }], kind: { in: ["CLEAN_REQUEST", GREEN_KIND] } }, select: { kind: true, detail: true, status: true, createdAt: true } }),
    prisma.trace.findMany({ where: { OR: [{ stayId }, { stayId: null, roomId: stay.roomId, date: { gte: berlinDate(stay.checkIn), lte: berlinDate(now) } }] }, select: { code: true, text: true, date: true } }),
  ]);
  const items = profileItemsFrom({
    cleanWishes: requests.filter((r) => r.kind === "CLEAN_REQUEST"),
    green: requests.filter((r) => r.kind === GREEN_KIND && r.status !== "CANCELLED"),
    traces,
  });
  if (!items.length) return null;
  const s = await prisma.profileSuggestion.create({
    data: {
      stayId, roomNumber: stay.room.number, guestSalutation: stay.guestSalutation, guestTitle: stay.guestTitle, guestLastName: stay.guestLastName,
      departure: now, items: JSON.stringify(items),
    },
  });
  await prisma.auditLog.create({ data: { action: "PROFILE_SUGGESTION_CREATED", meta: JSON.stringify({ suggestionId: s.id, stayId }) } });
  return s.id;
}

/*
 * Gastname im Vorschlag (Entscheidung Simon 19.11.2026 — kleine, bewusste Ausnahme von der Nachtlöschung um 22 Uhr):
 * sichtbar bis 24 Uhr am Abreisetag (Berlin), dann gelöscht (Löschtakt alle 10 Minuten). Kein Notfallzugriff —
 * nachts schlägt man den Gast wie bisher in Opera nach.
 */
const nextBerlinDay = (d: Date) => { const t = new Date(`${berlinDate(d)}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };
/** Ende der normalen Anzeige: 24 Uhr am Abreisetag (= 0 Uhr am Folgetag, Berlin). */
export const profileNameVisibleUntil = (departure: Date) => berlinToUtc(nextBerlinDay(departure), "00:00");
/** Löschung des Namens: ebenfalls 24 Uhr am Abreisetag. */
export const profileNameDeleteAt = profileNameVisibleUntil;

/** Namen löschen, deren Frist abgelaufen ist (`all`: sofort alle — „Gastdaten jetzt löschen“ des DM). Gibt die Anzahl zurück. */
export async function purgeExpiredProfileNames(now = clockNow(), all = false): Promise<number> {
  const rows = await prisma.profileSuggestion.findMany({
    where: { OR: [{ guestSalutation: { not: null } }, { guestTitle: { not: null } }, { guestLastName: { not: null } }] },
    select: { id: true, departure: true },
  });
  const ids = rows.filter((r) => all || profileNameDeleteAt(r.departure) <= now).map((r) => r.id);
  if (!ids.length) return 0;
  return (await prisma.profileSuggestion.updateMany({ where: { id: { in: ids } }, data: { guestSalutation: null, guestTitle: null, guestLastName: null } })).count;
}

/** Nachtlöschung (aus `purgeGuestDataNow`): abgelaufene Namen leeren (siehe oben), Vorschläge älter als `days` Tage löschen. */
export async function purgeProfileSuggestions(now = clockNow(), days = 30, all = false): Promise<number> {
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  await purgeExpiredProfileNames(now, all);
  const r = await prisma.profileSuggestion.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return r.count;
}
