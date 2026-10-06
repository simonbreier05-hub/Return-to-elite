# Löschkonzept Gastdaten (M3)

StayClean ist nur Arbeitsansicht — **Opera bleibt das führende System**. Jeden Abend werden alle Gastdaten aus StayClean gelöscht;
am nächsten Morgen kommen Namen und Traces über den Import aus den Opera-Listen zurück.

## Ablauf

- Zeitplan: täglich zur Stunde `Setting.guestPurgeHour` (Standard **22:00 Europe/Berlin**). `server.js` prüft alle 10 Minuten und beim Start, ob seit dem letzten geplanten Zeitpunkt ein erfolgreicher Lauf stattfand — ein ausgefallener Lauf wird **nachgeholt**.
- Geschützter Aufruf: `POST /api/internal/guest-data-purge` nur mit dem Geheimnis `INTERNAL_TICKER_SECRET` (beim Start zufällig erzeugt, nie nach außen) oder als Duty Manager.
- Idempotent: ein zweiter Lauf findet nichts mehr; gleichzeitige Läufe werden übersprungen.
- Manuell: Einstellungen → „Löschung der Gastdaten" → „Gastdaten jetzt löschen" (Duty Manager). Einzellöschung je Aufenthalt (Auskunfts-/Löschwunsch) ebenda.
- Nachweis: Tabelle `PurgeRun` (Zeit, Auslöser, Zähler je Kategorie, Ergebnis) — **keine personenbezogenen Daten**; Anzeige in den Einstellungen. Fehler speichern nur den Fehlertyp.
- Nach dem Lauf zeigen Import- und Planungsseite: „Gastdaten wurden um HH:MM Uhr gelöscht. Bitte die Listen neu importieren."

## Datenkarte: Feld → Regel

| Feld | Regel |
|---|---|
| `Stay.guestName`, `Arrival.guestName` | auf `""` (kein Soft-Delete); `Stay` ganz gelöscht `guestStayDeleteDays` (30) Tage nach der Abreise |
| `Excursion.guestName`, `Excursion.note` | `NULL` |
| `Trace.text` | auf `""`. Die Zeile bleibt mit HMAC-Schlüssel (`h1:…`, `AUTH_SECRET`), damit „erledigt" und „Hausmann-Aufgabe angelegt" nicht verloren gehen. Der Text kommt mit dem nächsten Import zurück |
| `ImportRow` (Roh-Zwischenablage) | gelöscht; `ImportBatch`/`ImportIssue`/`ForecastDay` enthalten keine Gastdaten |
| `RoomNote` vom Gäste-Systemkonto | gelöscht (alle Status) |
| `AuditLog.meta`: Schlüssel `guestName`, `name`, `text`, `note`, `body`, `message` | Schlüssel entfernt, Rest des Eintrags bleibt |
| Gäste-Fotos, geschlossene `GuestRequest` | bestehende Regel (`guestDataRetention`), im selben Lauf |
| **Bleibt** (nicht personenbezogen) | Zimmer, Reinigungsart, Zeiten, Status, Credits, Wäschewechsel, Zähler, Personenzahl, An-/Abreisedatum, VIP-Kennzeichen am Tagesplan, Zuteilungen, Hausmann-Aufgaben (Typ, Standardnotiz) |

## Zuständigkeiten

- Duty Manager: manuelle Löschung, Einzellöschung bei Auskunfts-/Löschwünschen, Löschzeit und Frist einstellen.
- Hotelleitung / Datenschutzbeauftragte: Verarbeitungsverzeichnis, AV-Vertrag, Backup-Fristen (siehe unten).

## Offene Punkte (nicht von StayClean lösbar, bitte klären)

1. **Backups bei Railway:** Aufbewahrung der Datenbank-Backups prüfen. Gelöschte Gastdaten dürfen nicht in langen Backups weiterleben.
2. **AV-Vertrag** mit dem Hotel (Auftragsverarbeitung) abschließen/prüfen.
3. **Verarbeitungsverzeichnis:** Eintrag für StayClean (Zweck: Zimmerplanung; Datenarten: Name, Aufenthaltsdaten, Wünsche; Löschfrist: täglich).
4. **Freitext von Mitarbeitenden:** Notizen von Mitarbeitenden (`RoomNote`, `Defect.note`, `RoomTask.note`, Status-Notizen) werden nicht automatisch gelöscht. Mitarbeitende sollen dort keine Gastnamen eintragen (Schulung/Hinweis).
5. **Server-Logs:** Es werden keine Gastdaten geloggt; Datenbank-Fehlermeldungen von Prisma können Werte enthalten — Log-Aufbewahrung bei Railway prüfen.
6. **Gäste-Zugang:** `Stay.stayToken` bleibt bis zur Löschung des Aufenthalts erhalten (kein Name). Rechtstexte des Gäste-Screens sind noch Platzhalter (siehe `docs/guest-api.md`).
