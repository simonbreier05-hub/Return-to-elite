import type { Server as SocketIOServer } from "socket.io";
import { ROLES, type Role } from "@/lib/domain";

/**
 * Realtime bridge. The custom server (server.js) attaches the Socket.IO
 * instance to globalThis; API routes push live updates through `broadcast`.
 *
 * S1 (Simulation v2, Befund K2): Der Live-Kanal ist nur für angemeldete Mitarbeiter. server.js prüft beim
 * Verbindungsaufbau das Sitzungs-Cookie und setzt jeden Socket in genau die Räume `role:<rolle>` und `user:<id>`.
 * Es gibt kein `io.emit` an alle mehr: `broadcast` sendet jedes Ereignis nur an die Rollen aus `EVENT_ROLES`,
 * und nur mit der Nutzlast, die die Rolle sehen darf (`planBroadcast`, rein → testbar):
 *   - nie Gastcode/Gast-Token (`ALWAYS_STRIP`), an niemanden;
 *   - Gastnamen nur an `GUEST_NAME_ROLES` (Supervisor, Front Office, Duty Manager) — Housekeeper, Hausmann,
 *     Techniker und Concierge bekommen nie einen Gastnamen;
 *   - `arrival:update` ganz ohne Gastnamen, `note:new`/`note:update` ohne Notiztext: die Bildschirme laden
 *     Details über die geschützte API nach.
 * Ein neues Ereignis muss in `EVENT_ROLES` eingetragen werden, sonst wird es nicht gesendet
 * (tests/realtimeRouting.test.ts prüft, dass jedes `broadcast("…")` im Code eingetragen ist).
 *
 * Events:
 *   room:update        { room }                 — room payload after any change
 *   room:status        { roomId, from, to, by } — lightweight status ticker (by = Name der Kraft)
 *   attendant:location { userId, name, roomId } — live attendant location
 *   notification:new   { notification }         — new alert; geht an targetUserId bzw. targetRole (+ Duty Manager)
 *   workorder:update   { workOrder }            — engineering queue changes
 *   arrival:update     { arrival }              — front office arrivals board (ohne Gastnamen)
 *   note:new           { note }                 — cross-department room notes (ohne Text)
 *   note:update        { note }                 — a note's OPEN/DONE status changed (ohne Text)
 *   route:reordered    { attendantId, roomIds } — attendant's Laufplan reordered
 *   roomtask:update    { roomTask }             — houseman queue changes (new or done)
 *   user:floors        { userId, floors }       — a supervisor's floor assignment changed
 *   guestrequest:new    { guestRequest }        — guest raised DND/clean-request/contact
 *   guestrequest:update { guestRequest }        — its status/assignee changed
 */

declare global {
  // eslint-disable-next-line no-var
  var __io: SocketIOServer | undefined;
}

export function getIO(): SocketIOServer | null {
  return globalThis.__io ?? null;
}

/** Rollen, die Gastnamen sehen dürfen. */
export const GUEST_NAME_ROLES: ReadonlySet<Role> = new Set<Role>(["supervisor", "front_office", "duty_manager"]);

/** Felder, die nie über den Live-Kanal gehen (Zugang zum Gastbildschirm). */
export const ALWAYS_STRIP = ["guestAccessCode", "stayToken"] as const;

/** Felder mit Gastnamen — nur für `GUEST_NAME_ROLES`. */
export const GUEST_NAME_KEYS = ["guestName", "guestSalutation", "guestTitle", "guestLastName"] as const;

const ALL_STAFF: readonly Role[] = ROLES;
const LEADS: readonly Role[] = ["supervisor", "duty_manager"];

/** Ereignis → Rollen, die es bekommen. Nicht eingetragen = wird nicht gesendet. */
export const EVENT_ROLES: Record<string, readonly Role[]> = {
  // Zimmer-/Planungsstand: braucht jeder Bildschirm (Gastnamen werden je Rolle entfernt).
  "room:update": ALL_STAFF,
  // S0 Simulationsuhr (nur Preview): jeder Bildschirm zeigt die Sim-Zeit; keine Gastdaten.
  "clock:update": ALL_STAFF,
  "dayplan:updated": ALL_STAFF,
  "assignments:applied": ALL_STAFF,
  "trace:update": ALL_STAFF,
  "work:pause": ALL_STAFF,
  "roomtask:update": ALL_STAFF,
  "route:reordered": ALL_STAFF,
  "user:floors": ALL_STAFF,
  "workorder:update": ALL_STAFF,
  "note:new": ALL_STAFF,
  "note:update": ALL_STAFF,
  // Mit Personen- oder Gastbezug: nur Leitung bzw. Front Office.
  "room:status": ["supervisor", "front_office", "duty_manager"],
  "attendant:location": LEADS,
  "arrival:update": ["supervisor", "front_office", "duty_manager"],
  "guestrequest:new": [...LEADS, "front_office"], // F3: Front Office sieht Gast-DND (Karte „Bitte nicht stören“)
  "guestrequest:update": [...LEADS, "front_office"],
  "excursion:update": ["concierge", "supervisor", "front_office", "duty_manager"],
  "import:applied": LEADS,
  "import:deleted": LEADS,
  "planning:floors": LEADS,
  "redistribution:new": LEADS,
  // notification:new wird nach Empfänger geroutet (siehe planBroadcast).
  "notification:new": ALL_STAFF,
};

/** Felder, die bei diesem Ereignis für alle Empfänger entfernt werden. */
const EVENT_STRIP: Record<string, readonly string[]> = {
  "arrival:update": GUEST_NAME_KEYS,
  "note:new": ["body"],
  "note:update": ["body"],
};

/** Entfernt die Schlüssel `keys` in jeder Tiefe (nur einfache Objekte/Arrays; Date & Co. bleiben unberührt). */
export function stripKeys(value: unknown, keys: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) return value.map((v) => stripKeys(v, keys));
  if (value === null || typeof value !== "object") return value;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!keys.has(k)) out[k] = stripKeys(v, keys);
  }
  return out;
}

export interface BroadcastPlan {
  rooms: string[];
  payload: unknown;
}

/** Wohin und mit welcher Nutzlast ein Ereignis geht. Leere Liste = wird nicht gesendet. */
export function planBroadcast(event: string, payload: unknown): BroadcastPlan[] {
  const roles = EVENT_ROLES[event];
  if (!roles) return [];
  const base = [...ALWAYS_STRIP, ...(EVENT_STRIP[event] ?? [])];
  const withNames = stripKeys(payload, new Set(base));
  const withoutNames = stripKeys(payload, new Set([...base, ...GUEST_NAME_KEYS]));

  if (event === "notification:new") {
    const n = (payload as { notification?: { targetRole?: string; targetUserId?: string | null } } | null)?.notification;
    if (!n) return [];
    // Eine Person: nur sie (+ Duty Manager, der alle Meldungen sieht). Ein Aufruf → kein Socket bekommt es doppelt.
    if (n.targetUserId) return [{ rooms: [`user:${n.targetUserId}`, "role:duty_manager"], payload: withoutNames }];
    const target = (ROLES as readonly string[]).includes(n.targetRole ?? "") ? (n.targetRole as Role) : null;
    const recipients = new Set<Role>(["duty_manager", ...(target ? [target] : [])]);
    return split([...recipients], withNames, withoutNames);
  }
  return split(roles, withNames, withoutNames);
}

function split(roles: readonly Role[], withNames: unknown, withoutNames: unknown): BroadcastPlan[] {
  const named = roles.filter((r) => GUEST_NAME_ROLES.has(r)).map((r) => `role:${r}`);
  const unnamed = roles.filter((r) => !GUEST_NAME_ROLES.has(r)).map((r) => `role:${r}`);
  const plans: BroadcastPlan[] = [];
  if (named.length) plans.push({ rooms: named, payload: withNames });
  if (unnamed.length) plans.push({ rooms: unnamed, payload: withoutNames });
  return plans;
}

export function broadcast(event: string, payload: unknown) {
  const io = getIO();
  if (!io) return;
  const plans = planBroadcast(event, payload);
  if (!plans.length) console.warn(`[realtime] Ereignis „${event}“ ist nicht in EVENT_ROLES eingetragen — nicht gesendet.`);
  for (const p of plans) io.to(p.rooms).emit(event, p.payload);
}

/**
 * Chat-Hub: an einen Raum senden statt an alle. Räume: `chat:<channelId>` (Kanal/Unterhaltung) und `user:<userId>`
 * (persönlich: Zähler, neue Unterhaltung). Betreten wird ein Chat-Raum nur serverseitig über `joinChatRooms`
 * (POST /api/chat/join prüft Session + policy) — Clients können nicht selbst beitreten.
 */
export function emitTo(room: string, event: string, payload: unknown) {
  const io = getIO();
  if (io) io.to(room).emit(event, payload);
}

/**
 * Socket `socketId` in genau diese Chat-Räume setzen (alte Chat-Räume werden verlassen). Ein Socket gehört seit S1
 * schon beim Verbindungsaufbau fest zu seiner angemeldeten Person (`socket.data.userId`, server.js); ein Versuch,
 * ihn einer anderen Person zuzuordnen, wird abgelehnt. Der eigene Raum `user:<id>` bleibt immer erhalten.
 */
export function joinChatRooms(socketId: string, userId: string, rooms: string[]): "ok" | "unknown" | "foreign" {
  const io = getIO();
  const socket = io?.sockets.sockets.get(socketId);
  if (!socket) return "unknown";
  const owner = (socket.data?.userId ?? socket.data?.chatUserId) as string | undefined;
  if (owner && owner !== userId) return "foreign";
  socket.data.chatUserId = userId;
  const own = `user:${userId}`;
  for (const r of socket.rooms) if ((r.startsWith("chat:") || r.startsWith("user:")) && r !== own && !rooms.includes(r)) socket.leave(r);
  socket.join([...rooms, own]);
  return "ok";
}
