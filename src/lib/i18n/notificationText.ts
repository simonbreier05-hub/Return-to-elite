import { SOURCE_DICTS, type Vars } from "./core";
import type { TKey } from "./translations";

type T = (key: TKey, vars?: Vars) => string;

export interface LocalizableNotification {
  message: string;
  messageKey?: string | null;
  messageVars?: string | null;
}

/** Werte, deren Name auf `Key` endet, sind selbst Textschlüssel (z. B. `typeKey: "roomTaskType.LINEN"`) und werden mit übersetzt. */
function resolveVars(raw: Record<string, unknown>, t: T): Vars {
  const out: Vars = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== "string" && typeof v !== "number") continue;
    if (k.endsWith("Key") && typeof v === "string") {
      out[k.slice(0, -3)] = v in SOURCE_DICTS.de ? t(v as TKey) : v;
    } else out[k] = v;
  }
  return out;
}

function parseVars(json: string | null | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Meldungstext in der Sprache des Lesers: Textschlüssel, falls der Server einen mitschickt, sonst der gespeicherte Klartext. */
export function notificationText(n: LocalizableNotification, t: T): string {
  if (n.messageKey && n.messageKey in SOURCE_DICTS.de) return t(n.messageKey as TKey, resolveVars(parseVars(n.messageVars), t));
  return n.message;
}

/**
 * Server: Textschlüssel + Werte zu einer Meldung (`prisma.notification.create({ data: { message, ...keyed(...) } })`).
 * `message` bleibt der bisherige Klartext (Fallback, Logs). Werte nie mit Gastnamen (CLAUDE.md); Werte mit Namen auf
 * `Key` (z. B. `roleKey: "role.houseman"`) übersetzt der Client mit.
 */
export function keyed(key: TKey, vars: Record<string, string | number> = {}): { messageKey: string; messageVars: string } {
  return { messageKey: key, messageVars: JSON.stringify(vars) };
}
