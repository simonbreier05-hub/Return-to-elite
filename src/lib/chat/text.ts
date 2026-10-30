import { DEPT_MENTIONS, type ChatChannelKey } from "./policy";

/** Höchstlänge einer Nachricht (Zeichen, nach Bereinigung). */
export const CHAT_MAX_LENGTH = 1000;

/**
 * Text bereinigen: Steuerzeichen raus (außer Zeilenumbruch/Tab), Zeilenumbrüche vereinheitlicht, höchstens 3 Leerzeilen
 * am Stück, getrimmt. HTML bleibt Text — die Oberfläche rendert nie HTML (kein dangerouslySetInnerHTML), daher kein XSS.
 */
export function sanitizeBody(raw: unknown): { ok: true; body: string } | { ok: false; error: "EMPTY" | "TOO_LONG" } {
  if (typeof raw !== "string") return { ok: false, error: "EMPTY" };
  const body = raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
  if (!body) return { ok: false, error: "EMPTY" };
  if (body.length > CHAT_MAX_LENGTH) return { ok: false, error: "TOO_LONG" };
  return { ok: true, body };
}

export type ChatToken = { kind: "text"; text: string } | { kind: "room"; number: string } | { kind: "mention"; text: string };

const TOKEN_RE = /#(\d{3,4})\b|@([A-Za-zÀ-ÿ][\wÀ-ÿ-]{1,30})/g;

/** Zum Anzeigen: „#312“ → Zimmer-Link, „@Name“ → hervorgehoben. Alles andere bleibt reiner Text. */
export function tokenize(body: string): ChatToken[] {
  const out: ChatToken[] = [];
  let last = 0;
  for (const m of body.matchAll(TOKEN_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: "text", text: body.slice(last, at) });
    out.push(m[1] ? { kind: "room", number: m[1] } : { kind: "mention", text: m[0] });
    last = at + m[0].length;
  }
  if (last < body.length) out.push({ kind: "text", text: body.slice(last) });
  return out;
}

/** Zimmernummern im Text (für Tests/Hinweise), ohne Dubletten. */
export const roomRefs = (body: string) => [...new Set(tokenize(body).flatMap((t) => (t.kind === "room" ? [t.number] : [])))];

/**
 * Erwähnungen auflösen: @Abteilung (DEPT_MENTIONS) und @Vorname einer Person aus `people` (eindeutig, ohne Groß/Klein).
 * Mehrdeutige oder unbekannte Namen werden ignoriert (keine Benachrichtigung an die Falsche).
 */
export function resolveMentions(body: string, people: { id: string; name: string }[]): { users: string[]; depts: ChatChannelKey[] } {
  const users = new Set<string>();
  const depts = new Set<ChatChannelKey>();
  for (const t of tokenize(body)) {
    if (t.kind !== "mention") continue;
    const word = t.text.slice(1).toLowerCase();
    if (DEPT_MENTIONS[word]) { depts.add(DEPT_MENTIONS[word]); continue; }
    const hits = people.filter((p) => p.name.split(/\s+/)[0]?.toLowerCase() === word);
    if (hits.length === 1) users.add(hits[0].id);
  }
  return { users: [...users], depts: [...depts] };
}
