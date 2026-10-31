/**
 * „Das ist jetzt wichtig“ — Ereignis-Feed der Supervisor-Startansicht. Rein, ohne Datenbank (client-sicher).
 * Quelle: Logbuch (AuditLog) und Eskalations-Meldungen (Notification); geladen in `load.ts`.
 *
 * Datenschutz: ein Feed-Eintrag trägt nie Freitext oder Gastnamen — nur Zimmer, Etage, Ereignisart, Zeit, auslösende
 * Rolle (Personalname nur bei Personal, nie beim Gast) und Enum-Werte (Blockier-Grund, Mangel-Kategorie).
 */

/** Höchstens so viele Einträge auf einmal; „Mehr anzeigen“ lädt jeweils so viele dazu. */
export const FEED_PAGE_SIZE = 30;
/** Obergrenze für eine Anfrage (Schutz vor sehr großen Antworten). */
export const FEED_MAX_LIMIT = 200;
/** Gleiche Ereignisart im gleichen Zimmer innerhalb dieses Fensters → ein Eintrag mit Zähler (z. B. Pause/Fortsetzen-Pingpong). */
export const COLLAPSE_WINDOW_MS = 10 * 60_000;
/** Wichtige Ereignisse (Gewicht ≥ PIN_MIN_WEIGHT) der letzten PIN_WINDOW_MS stehen oben, danach alles neueste zuerst. */
export const PIN_WINDOW_MS = 30 * 60_000;
export const PIN_MIN_WEIGHT = 3;

export type FeedKind =
  | "STARTED" | "PAUSED" | "RESUMED" | "FINISHED" | "RELEASED" | "REWORK" | "BLOCKED" | "OUT_OF_ORDER" | "RESET" | "REWIND"
  | "DEFECT" | "GUEST_DND_ON" | "GUEST_DND_OFF" | "GUEST_CLEAN" | "GUEST_CONTACT" | "PRIORITY_ETA" | "BLOCKED_RECHECK" | "WELFARE_CHECK";

/** Gewicht je Ereignisart: 3 = wichtig (oben angeheftet), 2 = handeln bald, 1 = zur Kenntnis. */
export const FEED_WEIGHT: Record<FeedKind, 1 | 2 | 3> = {
  DEFECT: 3, PRIORITY_ETA: 3, WELFARE_CHECK: 3, BLOCKED_RECHECK: 3, GUEST_CLEAN: 3,
  FINISHED: 2, REWORK: 2, BLOCKED: 2, GUEST_DND_ON: 2, GUEST_CONTACT: 2, OUT_OF_ORDER: 2,
  STARTED: 1, PAUSED: 1, RESUMED: 1, RELEASED: 1, RESET: 1, REWIND: 1, GUEST_DND_OFF: 1,
};

/** Rohes Ereignis, wie `load.ts` es aus AuditLog/Notification baut (schon ohne Freitext). */
export interface RawFeedEvent {
  id: string;
  at: string;
  /** AuditLog.action oder `NOTIFICATION:<type>`. */
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  roomId: string;
  roomNumber: string;
  floor: number;
  actorRole?: string | null;
  actorName?: string | null;
  blockReason?: string | null;
  defectCategory?: string | null;
}

export interface FeedItem {
  /** Id des neuesten zusammengefassten Ereignisses. */
  id: string;
  kind: FeedKind;
  weight: 1 | 2 | 3;
  at: string;
  /** Ältestes Ereignis der Gruppe (bei count > 1). */
  firstAt: string;
  count: number;
  roomId: string;
  roomNumber: string;
  floor: number;
  actorRole: string | null;
  actorName: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  blockReason: string | null;
  defectCategory: string | null;
}

const STATUS_KIND: Record<string, FeedKind> = {
  IN_PROGRESS: "STARTED", CLEAN: "FINISHED", INSPECTED: "RELEASED", PICKUP: "REWORK", BLOCKED: "BLOCKED",
  OUT_OF_ORDER: "OUT_OF_ORDER", OUT_OF_SERVICE: "OUT_OF_ORDER", DIRTY: "RESET",
};
const ACTION_KIND: Record<string, FeedKind> = {
  WORK_PAUSED: "PAUSED", WORK_RESUMED: "RESUMED", STATUS_REWIND: "REWIND", DEFECT_REPORTED: "DEFECT",
  GUEST_DND_REQUESTED: "GUEST_DND_ON", GUEST_DND_CANCELLED: "GUEST_DND_OFF", GUEST_CLEAN_REQUESTED: "GUEST_CLEAN",
  GUEST_CONTACT_REQUESTED: "GUEST_CONTACT", "NOTIFICATION:ETA_AT_RISK": "PRIORITY_ETA",
  "NOTIFICATION:BLOCKED_RECHECK": "BLOCKED_RECHECK", "NOTIFICATION:WELFARE_CHECK": "WELFARE_CHECK",
};

/** Logbuch-Aktionen, die der Feed liest (für die Datenbankabfrage). */
export const FEED_AUDIT_ACTIONS = ["STATUS_CHANGE", ...Object.keys(ACTION_KIND).filter((a) => !a.startsWith("NOTIFICATION:"))];
/** Meldungsarten, die als Prioritäts-/Eskalationsereignis erscheinen. */
export const FEED_NOTIFICATION_TYPES = Object.keys(ACTION_KIND).filter((a) => a.startsWith("NOTIFICATION:")).map((a) => a.slice("NOTIFICATION:".length));

/** Ereignisart eines Roh-Ereignisses; `null` = nicht relevant für den Feed (z. B. DEFECT_REPORTED als Status — das kommt als DEFECT). */
export function classify(e: Pick<RawFeedEvent, "action" | "toStatus">): FeedKind | null {
  if (e.action === "STATUS_CHANGE") return (e.toStatus && STATUS_KIND[e.toStatus]) || null;
  return ACTION_KIND[e.action] ?? null;
}

/** Nur Ereignisse der eigenen Etagen. Leere Etagenliste = nichts (nie „alles“). */
export function onOwnFloors<T extends { floor: number }>(events: T[], floors: number[]): T[] {
  const set = new Set(floors);
  return events.filter((e) => set.has(e.floor));
}

/**
 * Klassifizieren und zusammenfassen: gleiche Art + gleiches Zimmer innerhalb COLLAPSE_WINDOW_MS (gemessen am jeweils
 * neueren Ereignis der Gruppe) werden ein Eintrag mit `count`. Eingabe in beliebiger Reihenfolge.
 */
export function collapse(events: RawFeedEvent[]): FeedItem[] {
  const sorted = [...events].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const out: FeedItem[] = [];
  const open = new Map<string, FeedItem>();
  for (const e of sorted) {
    const kind = classify(e);
    if (!kind) continue;
    const key = `${e.roomId}|${kind}`;
    const group = open.get(key);
    if (group && Date.parse(group.firstAt) - Date.parse(e.at) <= COLLAPSE_WINDOW_MS) {
      group.count++;
      group.firstAt = e.at;
      continue;
    }
    const item: FeedItem = {
      id: e.id, kind, weight: FEED_WEIGHT[kind], at: e.at, firstAt: e.at, count: 1,
      roomId: e.roomId, roomNumber: e.roomNumber, floor: e.floor,
      actorRole: e.actorRole ?? null, actorName: e.actorRole === "guest" ? null : e.actorName ?? null,
      fromStatus: e.fromStatus ?? null, toStatus: e.toStatus ?? null,
      blockReason: e.blockReason ?? null, defectCategory: e.defectCategory ?? null,
    };
    open.set(key, item);
    out.push(item);
  }
  return out;
}

/** Reihenfolge: wichtige Einträge der letzten PIN_WINDOW_MS oben (neueste zuerst), dann der Rest neueste zuerst. */
export function orderFeed(items: FeedItem[], now: Date): FeedItem[] {
  const pinned = (i: FeedItem) => i.weight >= PIN_MIN_WEIGHT && now.getTime() - Date.parse(i.at) <= PIN_WINDOW_MS;
  return [...items].sort((a, b) => Number(pinned(b)) - Number(pinned(a)) || Date.parse(b.at) - Date.parse(a.at));
}

/** Ganze Kette: eigene Etagen → zusammenfassen → ordnen → begrenzen. */
export function buildFeed(events: RawFeedEvent[], floors: number[], now: Date, limit: number): { items: FeedItem[]; hasMore: boolean } {
  const all = orderFeed(collapse(onOwnFloors(events, floors)), now);
  return { items: all.slice(0, limit), hasMore: all.length > limit };
}
