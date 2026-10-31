import type { Role } from "@/lib/domain";

/**
 * Chat-Hub — die EINE Stelle für Rechte (Server prüft hiermit jede Anfrage, die Oberfläche fragt dieselben Funktionen).
 * Rein, ohne Datenbank (client-sicher). Entscheidungen (Freigabe Chat-Konzept):
 *  - Vier Abteilungskanäle; jede Rolle liest/schreibt nur im eigenen Kanal, Supervisor + Duty Manager in allen.
 *  - Concierge hat keinen Kanal, nimmt nur über Direktnachrichten teil.
 *  - Direktnachrichten zwischen allen Rollen — außer Housekeeper (room_attendant): nur mit HOUSEKEEPER_DM_ROLES,
 *    in beide Richtungen. Die Liste ist per Setting `chat.housekeeperDmRoles` änderbar (getChatSettings).
 */
export const CHAT_CHANNELS = ["HOUSEKEEPING", "ENGINEERING", "FRONT_OFFICE", "HOUSEMAN"] as const;
export type ChatChannelKey = (typeof CHAT_CHANNELS)[number];

/** Kanal → Rollen, die ihn lesen und darin schreiben. Supervisor/Duty Manager kommen über ALL_CHANNEL_ROLES dazu. */
export const CHANNEL_ROLES: Record<ChatChannelKey, readonly Role[]> = {
  HOUSEKEEPING: ["room_attendant"],
  ENGINEERING: ["engineering"],
  FRONT_OFFICE: ["front_office"],
  HOUSEMAN: ["houseman"],
};
export const ALL_CHANNEL_ROLES: readonly Role[] = ["supervisor", "duty_manager"];

/** Standard: Housekeeper schreiben direkt nur mit diesen Rollen (und nur diese starten eine Direktnachricht an sie). */
export const DEFAULT_HOUSEKEEPER_DM_ROLES: readonly Role[] = ["supervisor", "duty_manager"];
export const HOUSEKEEPER_ROLE: Role = "room_attendant";

export const isChannelKey = (k: string): k is ChatChannelKey => (CHAT_CHANNELS as readonly string[]).includes(k);

export function canUseChannel(role: string, key: string): boolean {
  if (!isChannelKey(key)) return false;
  return ALL_CHANNEL_ROLES.includes(role as Role) || CHANNEL_ROLES[key].includes(role as Role);
}

export function channelsForRole(role: string): ChatChannelKey[] {
  return CHAT_CHANNELS.filter((k) => canUseChannel(role, k));
}

/**
 * Darf `from` eine Direktnachricht an `to` schreiben (bzw. eine Unterhaltung starten)? Symmetrisch: die Housekeeper-Regel
 * gilt in beide Richtungen. Niemand schreibt sich selbst.
 */
export function canDirectMessage(from: { id: string; role: string }, to: { id: string; role: string }, housekeeperDmRoles: readonly string[] = DEFAULT_HOUSEKEEPER_DM_ROLES): boolean {
  if (from.id === to.id) return false;
  if (from.role === HOUSEKEEPER_ROLE) return housekeeperDmRoles.includes(to.role);
  if (to.role === HOUSEKEEPER_ROLE) return housekeeperDmRoles.includes(from.role);
  return true;
}

/** Schlüssel einer Direkt-Unterhaltung: eindeutig je Paar, unabhängig von der Richtung. */
export const directKey = (a: string, b: string) => `dm:${[a, b].sort().join(":")}`;
export const directPartnerIds = (key: string): [string, string] | null => {
  const m = /^dm:([^:]+):([^:]+)$/.exec(key);
  return m ? [m[1], m[2]] : null;
};

/** Abteilungs-Erwähnung (@Housekeeping …) → Kanal-Schlüssel. */
export const DEPT_MENTIONS: Record<string, ChatChannelKey> = {
  housekeeping: "HOUSEKEEPING", technik: "ENGINEERING", engineering: "ENGINEERING",
  frontoffice: "FRONT_OFFICE", "front-office": "FRONT_OFFICE", hausmann: "HOUSEMAN", houseman: "HOUSEMAN",
};
