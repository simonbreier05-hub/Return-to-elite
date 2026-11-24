/**
 * F9 (A2): Geheime Zugangswerte stehen nie in Mitarbeiter-Antworten. Der Prisma-Client lässt sie standardmäßig weg;
 * wer sie wirklich braucht (Gästezugang-Seite für Supervisor/DM, Code erzeugen, Zimmerliste-Sync), liest sie
 * ausdrücklich mit `select: { guestAccessCode: true }`. Suchen über `where` funktioniert weiter.
 */
export const PRISMA_OMIT = {
  room: { guestAccessCode: true },
  stay: { stayToken: true },
} as const;
