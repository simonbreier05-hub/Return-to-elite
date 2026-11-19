/**
 * Betrieb L2 (Punkt 10, Meeting 13.11.2026): Lesebestätigung — der Absender sieht je eigener Nachricht, wie viele der
 * Leserinnen/Leser des Kanals (Abteilung) bzw. die Person (Direktnachricht) sie gelesen haben. Kein neues Speicherfeld:
 * abgeleitet aus `ChatReadState.lastReadAt` (wer den Kanal nach der Nachricht geöffnet hat). Rein, ohne DB.
 */
export interface ReadReceipt {
  read: number;
  total: number;
  /** F5-Nachtrag (M16, B10): Namen für die aufklappbare Liste — nur für den Absender selbst ausgeliefert. */
  readNames?: string[];
  unreadNames?: string[];
}

/** Wie `readReceipt`, zusätzlich mit Namen (wer hat gelesen, wer noch nicht). */
export function readReceiptWithNames(createdAt: Date, authorId: string, readers: { id: string; name: string }[], lastReadAt: Map<string, Date>): ReadReceipt {
  const others = readers.filter((r, i, a) => r.id !== authorId && a.findIndex((x) => x.id === r.id) === i);
  const isRead = (id: string) => { const at = lastReadAt.get(id); return !!at && at.getTime() >= createdAt.getTime(); };
  const readNames = others.filter((r) => isRead(r.id)).map((r) => r.name).sort((a, b) => a.localeCompare(b));
  const unreadNames = others.filter((r) => !isRead(r.id)).map((r) => r.name).sort((a, b) => a.localeCompare(b));
  return { read: readNames.length, total: others.length, readNames, unreadNames };
}

export function readReceipt(createdAt: Date, authorId: string, readerIds: string[], lastReadAt: Map<string, Date>): ReadReceipt {
  const others = [...new Set(readerIds)].filter((id) => id !== authorId);
  const read = others.filter((id) => {
    const at = lastReadAt.get(id);
    return !!at && at.getTime() >= createdAt.getTime();
  }).length;
  return { read, total: others.length };
}
