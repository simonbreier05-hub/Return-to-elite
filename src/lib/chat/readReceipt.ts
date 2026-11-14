/**
 * Betrieb L2 (Punkt 10, Meeting 13.11.2026): Lesebestätigung — der Absender sieht je eigener Nachricht, wie viele der
 * Leserinnen/Leser des Kanals (Abteilung) bzw. die Person (Direktnachricht) sie gelesen haben. Kein neues Speicherfeld:
 * abgeleitet aus `ChatReadState.lastReadAt` (wer den Kanal nach der Nachricht geöffnet hat). Rein, ohne DB.
 */
export interface ReadReceipt {
  read: number;
  total: number;
}

export function readReceipt(createdAt: Date, authorId: string, readerIds: string[], lastReadAt: Map<string, Date>): ReadReceipt {
  const others = [...new Set(readerIds)].filter((id) => id !== authorId);
  const read = others.filter((id) => {
    const at = lastReadAt.get(id);
    return !!at && at.getTime() >= createdAt.getTime();
  }).length;
  return { read, total: others.length };
}
