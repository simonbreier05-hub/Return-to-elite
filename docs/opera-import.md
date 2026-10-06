# Opera-Import (Morgenplanung)

Der Duty Manager legt morgens die Opera-Listen (Forecast, Departures, Arrivals, Traces) ab. StayClean liest sie aus,
zeigt Vorschau und Befunde und übernimmt sie nach Bestätigung. Opera bleibt das führende System.

## Datenschutz-Whitelist (verbindlich für jeden Parser)

| Speichern | Sofort verwerfen, nie speichern, nie loggen |
|---|---|
| Zimmernummer; Anreise-/Abreisedatum, Anreisezeit, Nächte | Credit Card No., Rate Amount, Rate Code, Currency, Pay Mth., Deposit Received, Balance, Room Revenue, Average Rate |
| Erwachsene, Kinder; VIP-Kennzeichen; Res.-Status | Conf No., Company / Travel Agent / Group, Mkt./Src./Block/Carr. Code, Packages, Fixed Charges, Inventory Items, Method of Arrival, Last Room # |
| Gast: Anrede, Titel, Nachname (voller Name nur für berechtigte Rollen) | |
| Traces: Code, Datum, Text | |

Das PDF wird im Browser gelesen (`pdfjs-dist`); gespeichert wird nur der SHA-256. Fotos/Scans ohne Textebene werden abgelehnt (keine OCR).

## Layouts

- **Arrivals: Detailed** — Block je Reservierung (Zeile 1: Zimmer/Name/Daten/Personen/Status; Zeile 2: Conf-Nr., VIP, Anreisezeit; danach `Fixed Charges:`, `Traces:`, `Inventory Items:`). Geschäftsdatum = Anreisetag der Liste (Fuß: „Stay From Date"), nicht das Druckdatum.
- **Departures** — Gruppen „Departure <Datum>" mit `Total`-Zeilen (werden gegen die Zeilen geprüft). Über einen Zeitraum ersetzt sie die fehlende In-House-Liste: Bleiber = Abreise nach heute, Anreise bis heute. Empfohlen: heute bis +30 Tage.
- **History and Forecast** — nur heutiger und spätere Tage; Umsatz/Durchschnittspreis werden verworfen; Occ.% wird gegen belegt ÷ (Zimmer − OOO) geprüft.
- **Traces** — PDF oder CSV; Twin-/Zusatzbett-Texte werden zu Hausmann-Aufgaben (`traceClassifier.ts`).

## Datumsformat

Pro Liste aus allen Werten bestimmt: Format mit ungültigem Wert (Monat > 12) scheidet aus, beim Forecast zusätzlich über den Wochentag. Bleiben beide Lesarten gültig, wird **nicht geraten**: kritischer Befund `DATE_AMBIGUOUS`, die Vorschau zeigt beide Lesarten, der Nutzer bestätigt.

## Befunde

Kritisch (nichts wird übernommen): kein Text (Foto/Scan), Pflichtfeld unlesbar, Datum mehrdeutig, > 20 % unbekannte Zimmer, Geschäftsdatum unlesbar.
Warnung: Seite fehlt, Zeitraum < 30 Tage, Arrivals unvollständig (Gegenprobe gegen Departures), unbekannte Zimmer (einzelne), Summenzeile passt nicht, Auslastung unplausibel, doppelte Zeilen, Anrede fehlt.

## Testdaten

Nachbau-PDFs mit erfundenen Namen: `npm run fixtures:opera` (→ `tests/fixtures/opera/`). Durchlauf eines Morgens: `scripts/morning-demo.ts` (Wegwerf-DB, Aufruf im Kopf der Datei).
