/**
 * Meldungs-Zentrum (Paket O1): reine Anzeige-Regeln für Pop-up, Ton und Banner — ohne React, ohne DB, testbar.
 * Der Server bleibt maßgeblich (`/api/notifications` filtert); diese Regeln entscheiden nur, was der Client zeigt.
 */

export interface NotifyMe {
  role: string;
  userId: string | null;
}

/** Minimal-Form einer Meldung (aus `/api/notifications` oder `notification:new`). */
export interface NotifyNotification {
  id: string;
  type: string;
  level: string;
  targetRole: string;
  targetUserId?: string | null;
  roomId?: string | null;
  acknowledged?: boolean;
  messageVars?: string | null;
}

/** Ein Pop-up: eine Meldung, eine Chat-Nachricht oder eine Sammelanzeige „N neue Meldungen“. */
export type NotifyToast =
  | { id: string; kind: "notification"; urgent: boolean; notification: NotifyNotification }
  | { id: string; kind: "chat"; urgent: boolean; channelId: string; title: string; text: string }
  | { id: string; kind: "summary"; urgent: boolean; count: number };

export const MAX_TOASTS = 3;
export const BURST_MIN = 3;
export const NORMAL_TOAST_MS = 8000;

/**
 * Ist die Meldung an mich gerichtet (Pop-up, Ton, Ungelesen-Zähler)?
 * Rolle muss passen; ist sie an eine Person gerichtet, nur wenn ich das bin.
 * Duty Manager: liest alle Meldungen in der Liste, „meine“ sind aber nur die an den Duty Manager bzw. an mich.
 */
export function isMine(n: Pick<NotifyNotification, "targetRole" | "targetUserId">, me: NotifyMe): boolean {
  if (n.targetUserId) return !!me.userId && n.targetUserId === me.userId;
  return n.targetRole === me.role;
}

/** Darf die Meldung in meiner Liste stehen (gleiche Regel wie der Server-Filter von GET /api/notifications)? */
export function isVisible(n: Pick<NotifyNotification, "targetRole" | "targetUserId">, me: NotifyMe): boolean {
  if (me.role === "duty_manager") return true;
  if (n.targetRole !== me.role) return false;
  return !n.targetUserId || n.targetUserId === me.userId;
}

/** Ungelesen und meins — zählt für Glocke und Banner. */
export function isUnreadMine(n: NotifyNotification, me: NotifyMe): boolean {
  return !n.acknowledged && isMine(n, me);
}

/** Dringend = Stufe warning/critical bzw. Chat „dringend“: bleibt bis Antippen und klingt doppelt. */
export function isUrgent(x: { level?: string | null; urgent?: boolean }): boolean {
  return !!x.urgent || x.level === "warning" || x.level === "critical";
}

/** Schon gezeigt/gemerkt? (Socket-Ereignis und Neuladen liefern dieselbe Meldung oft doppelt.) */
export function isDuplicate(seen: ReadonlySet<string>, id: string): boolean {
  return seen.has(id);
}

/** Neue, ungelesene, an mich gerichtete Meldungen, die noch nicht gezeigt wurden (Reihenfolge wie geliefert). */
export function freshFor(list: NotifyNotification[], seen: ReadonlySet<string>, me: NotifyMe): NotifyNotification[] {
  return list.filter((n) => isUnreadMine(n, me) && !isDuplicate(seen, n.id));
}

/** Sammeln: ab 3 gleichzeitig eingehenden Meldungen ein einziges Pop-up „N neue Meldungen“, sonst je Meldung eins. */
export function toastsFor(batch: NotifyNotification[]): NotifyToast[] {
  if (batch.length >= BURST_MIN) {
    return [{ id: `summary:${batch.map((n) => n.id).join(",")}`, kind: "summary", urgent: batch.some(isUrgent), count: batch.length }];
  }
  return batch.map((n) => ({ id: n.id, kind: "notification" as const, urgent: isUrgent(n), notification: n }));
}

/**
 * Stapel mit höchstens 3 Pop-ups, neueste oben. Läuft er über, fällt zuerst das älteste nicht dringende heraus
 * (eine dringende Meldung verschwindet nie ungesehen, solange es eine normale zu verdrängen gibt).
 */
export function pushToasts(current: NotifyToast[], incoming: NotifyToast[], max = MAX_TOASTS): NotifyToast[] {
  const ids = new Set(current.map((t) => t.id));
  let out = [...incoming.filter((t) => !ids.has(t.id)).reverse(), ...current];
  while (out.length > max) {
    let drop = -1;
    for (let i = out.length - 1; i >= 0; i--) if (!out[i].urgent) { drop = i; break; }
    out = out.filter((_, i) => i !== (drop >= 0 ? drop : out.length - 1));
  }
  return out;
}

/** Anzeigedauer: normal 8 s, dringend bleibt (null) bis zum Antippen/Schließen. */
export function toastDuration(t: Pick<NotifyToast, "urgent">): number | null {
  return t.urgent ? null : NORMAL_TOAST_MS;
}

/** Welcher Ton zu neuen Pop-ups gehört: dringend (doppelt), normal, oder keiner. */
export function soundFor(toasts: Pick<NotifyToast, "urgent">[]): "urgent" | "normal" | null {
  if (!toasts.length) return null;
  return toasts.some((t) => t.urgent) ? "urgent" : "normal";
}

/** Eigene Chat-Nachricht oder gerade geöffneter Kanal: kein Pop-up, kein Ton. */
export function chatNeedsToast(m: { authorId: string; channelId: string }, me: NotifyMe, activeChannelId: string | null, onChatPage: boolean): boolean {
  if (me.userId && m.authorId === me.userId) return false;
  return !(onChatPage && activeChannelId === m.channelId);
}

function roomNumberOf(n: NotifyNotification): string | null {
  if (!n.messageVars) return null;
  try {
    const v = JSON.parse(n.messageVars) as Record<string, unknown>;
    return typeof v.n === "string" || typeof v.n === "number" ? String(v.n) : null;
  } catch {
    return null;
  }
}

export type NotifyTarget =
  | { kind: "room"; roomId: string; number: string | null }
  | { kind: "chat"; channelId: string }
  | { kind: "href"; href: string }
  | { kind: "list" };

/** Wohin führt Antippen? Zimmer → Zimmerfenster, Chat → Kanal, Auftrag → Techniker-Ansicht, sonst die Meldungsliste. */
export function targetFor(t: NotifyToast, me: NotifyMe): NotifyTarget {
  if (t.kind === "chat") return { kind: "chat", channelId: t.channelId };
  if (t.kind === "summary") return { kind: "list" };
  const n = t.notification;
  if (n.type === "CHAT") return { kind: "href", href: "/chat" };
  if (n.type === "WORK_ORDER" && me.role === "engineering") return { kind: "href", href: "/engineering" };
  if (n.roomId) return { kind: "room", roomId: n.roomId, number: roomNumberOf(n) };
  return { kind: "list" };
}

/** Ton-Einstellung je Gerät: unset = noch nicht gefragt (Banner „Ton aktivieren“), on/off = Entscheidung. */
export type SoundPref = "on" | "off" | null;

export function parseSoundPref(raw: string | null | undefined): SoundPref {
  return raw === "on" || raw === "off" ? raw : null;
}

/** Ab wann eine fehlende Verbindung angezeigt wird (kurze Aussetzer beim Seitenwechsel nicht melden). */
export const OFFLINE_HINT_DELAY_MS = 3000;
/** Neu laden höchstens alle 2 s (Rückkehr + online + Reconnect kommen oft gleichzeitig). */
export const RESYNC_MIN_GAP_MS = 2000;

export function shouldResync(lastAt: number, now: number): boolean {
  return now - lastAt >= RESYNC_MIN_GAP_MS;
}
