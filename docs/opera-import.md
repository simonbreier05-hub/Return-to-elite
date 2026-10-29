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

Das PDF/XLSX/CSV wird im Browser gelesen (`pdfjs-dist`, `exceljs`, `papaparse`); gespeichert wird nur der SHA-256. Der Server nimmt nur Whitelist-Felder an (`src/lib/import/schema.ts`, `.strict()`) und prüft die Zimmer gegen den Zimmerstamm. Fotos/Scans ohne Textebene werden abgelehnt (keine OCR).

## Layouts

- **Arrivals: Detailed** — Block je Reservierung (Zeile 1: Zimmer/Name/Daten/Personen/Status; Zeile 2: Conf-Nr., VIP, Anreisezeit; danach `Fixed Charges:`, `Traces:`, `Inventory Items:`). Geschäftsdatum = Anreisetag der Liste (Fuß: „Stay From Date"), nicht das Druckdatum.
- **Departures** — Gruppen „Departure <Datum>" mit `Total`-Zeilen (werden gegen die Zeilen geprüft). Über einen Zeitraum ersetzt sie die fehlende In-House-Liste: Bleiber = Abreise nach heute, Anreise bis heute. Empfohlen: heute bis +30 Tage.
- **History and Forecast** — nur heutiger und spätere Tage; Umsatz/Durchschnittspreis werden verworfen; Occ.% wird gegen belegt ÷ (Zimmer − OOO) geprüft.
- **In House (Tagesbelegung)** — fünfte Liste, `INHOUSE`: eine Zeile je belegtes Zimmer (Zimmer, Name, Anreise, Abreise, Erw., Kinder, Nächte). Geschäftsdatum = Druckdatum. **Layout angenommen** (wie die Departures-Zeilen) — vor dem Echtbetrieb mit einem echten Opera-Export prüfen.
- **Traces** — PDF oder CSV; Twin-/Zusatzbett-Texte werden zu Hausmann-Aufgaben (`traceClassifier.ts`).

## Betriebstag und veraltete Listen

Betriebstag ist immer der heutige Tag der App-Uhr (Berlin). Das Datum in der Datei dient nur dem Abgleich: Liste vom anderen Tag = „veraltet (Datum)“ (Warnung `LIST_NOT_TODAY`, übernehmbar). Das Gate zählt eine veraltete Liste erst nach „Trotzdem verwenden“ (Supervisor/Duty Manager, wird im Logbuch protokolliert). Ohne lesbares Druckdatum: Hinweis `NO_PRINT_DATE`, die Liste gilt für den Betriebstag. Das Datumsformat je Listentyp wird nach dem Übernehmen als Layout gespeichert (`ImportMapping`).

## Einreichungs-Gate (fünf Listen)

Zusätzlich muss der Stand jeder Liste dem Betriebstag entsprechen (oder bestätigt sein). Die Planung (`POST /api/dayplan/merge`, `POST /api/autoplan/propose`, Weiter-Knopf im Planungstool) startet erst, wenn **alle fünf** Listen (Forecast, Departures, Arrivals, Traces, In House) übernommen (`APPLIED`) sind — auch vier von fünf reichen nicht. Eine Quelle: `src/lib/import/readiness.ts` (`missingLists`); serverseitig `listBlockersNow()` → HTTP 409 mit den fehlenden bzw. unbestätigt veralteten Typen.

## Liste löschen / ersetzen

`DELETE /api/import/lists/[type][?keepPlan=1]` (Supervisor, Duty Manager) löscht die übernommene Liste — alle übernommenen Stände des Typs, damit das Gate sie wieder als *fehlend* zählt (sonst rückte ein älterer Stand als „veraltet“ nach) (`src/lib/import/deleteList.ts`): Batch samt Zeilen, dazu Import-Aufenthalte, erwartete Import-Anreisen, offene Traces ohne Hausmann-Aufgabe und Forecast-Tage — nur was **nicht** auch in der jeweils anderen Liste steht (Departures↔Arrivals, Arrivals↔Traces). Ist für den Tag ein Plan bestätigt: 409 `planConfirmed`, bis `keepPlan=1` kommt; der Plan bleibt, `GET /api/import/status` meldet dann `plan.listsChanged` („Listen geändert, Plan neu berechnen?“). Logbuch: `IMPORT_LIST_DELETED` und `IMPORT_REPLACED` (Typ, Betriebstag, Zähler — keine Gastdaten). Broadcast `import:deleted`.

## Oberfläche und API

`/import` (Supervisor, Duty Manager; Link im Planungshub): mehrere Dateien per Drag-and-drop oder „Dateien wählen", Typ automatisch erkannt (sonst Auswahl), Vorschau mit maskierten Namen, Befunde, Datumsbestätigung, „Übernehmen"/„Verwerfen"/„Alle übernehmen", „Stand der Daten".
`POST /api/import/batches` (Vorschau ablegen) → `POST /api/import/batches/[id]/apply|reject`; `GET /api/import/status` (Stand je Liste, `today`, Plan-Hinweis `plan`). Der Browser übernimmt mehrere Listen **nacheinander** (parallele Übernahmen liefen in DB-Transaktions-Timeouts).
Excel/CSV: jede Zeile = Zellen in Druckreihenfolge (gleiche Parser wie PDF); Tabellen haben kein Druckdatum, das Formularfeld „Geschäftsdatum" springt ein. Zimmernummern, die Excel als Zahl gespeichert hat (4), werden zu „004" aufgefüllt. Bei PDFs gilt immer das Druckdatum; weicht es vom gewählten Tag ab, gibt es die Warnung `LIST_NOT_TODAY`.
Zimmeranzahl für die Forecast-Prüfung: Einstellung `roomInventory` (Standard 145, in /settings änderbar) — nicht die 139 Zimmer der Grundriss-Digitalisierung.

## Tagesplan (M2)

`POST /api/dayplan/merge` führt die übernommenen Listen zusammen (Code: `src/lib/dayplan/`):

| Art (`DayRoomPlan.cleaningType`) | Regel |
|---|---|
| `DEPARTURE` (im Konzept „CHECKOUT") | Abreise heute, kein anderer Gast reist heute ein |
| `SAME_DAY_TURN` | Abreise heute und ein anderer Gast reist heute ein |
| `STAYOVER` | Anreise vor heute, Abreise nach heute — täglich reinigen |
| `ARRIVAL` | Anreise heute, Zimmer vorher leer — keine Reinigung, nur Anzeige (auch Frühanreisen, die schon eingecheckt sind) |

- Aufenthalte (`Stay`) werden über **Zimmer + Anreisedatum** erkannt, nicht über die Reservierungsnummer. Fehlt einer in einem neuen Stand: `needsReview`, nie gelöscht. Widersprüche (z. B. unterschiedliche Abreise in beiden Listen) sind Hinweise, es gilt die Departures-Liste.
- Wäschewechsel: Zähler ab Anreise (ein Wechsel vor der Anreise zählt nicht), Intervall `linenCycleDays` (3), Abhaken (`/api/rooms/[id]/linen`) setzt zurück. Logik: `isLaundryDue`.
- Tageszahl = Abreisen (Turn einmal) + Bleiber. Gegenprobe gegen `ForecastDay` des Tages (Toleranz max(3, 5 %)): nur Warnung.
- Traces: Dublettenschlüssel Zimmer|Code|Datum|Text, erledigte bleiben erledigt. Abteilung über Setting `traceDept.<CODE>` (Standard in `traceDept.ts`), unbekannter Code → Housekeeping + Warnung. Twin-/Zusatzbett-Texte → Hausmann-Aufgabe (Twin-Rückbau erst am Abreisetag).
- `POST /api/dayplan/apply` überträgt auf die Felder, die Planungshub und Grundriss schon lesen (`isCheckoutToday`, `occupancy`, `Arrival`, `lastLinenChangeAt`). Zimmer ohne Eintrag werden nur auf „leer" gesetzt, wenn die Departures ≥ 30 Tage abdecken. Zuteilungen (`assignedToId`) und Status bleiben immer unberührt; ändert ein Nachimport die Art eines zugeteilten Zimmers, gibt es einen Hinweis an Supervisor und Room Attendants.
- Reinigungsart ändern: `POST /api/dayplan/override` (Audit `CLEANING_TYPE_CHANGED`, Listenwert bleibt in `derivedType`).
- Den Vorschlag „Plan auf das Team anwenden" liefert weiter der bestehende Planungshub (`/api/assignments/plan` + `apply`), er liest das Board. Der intelligente Vorschlag (Fairness, Stufen, 2-Etagen-Regel) ist M2b.

## Datumsformat

Pro Liste aus allen Werten bestimmt: Format mit ungültigem Wert (Monat > 12) scheidet aus, beim Forecast zusätzlich über den Wochentag. Bleiben beide Lesarten gültig, wird **nicht geraten**: kritischer Befund `DATE_AMBIGUOUS`, die Vorschau zeigt beide Lesarten, der Nutzer bestätigt.

## Befunde

Kritisch (nichts wird übernommen): kein Text (Foto/Scan), Pflichtfeld unlesbar, Datum mehrdeutig, > 20 % unbekannte Zimmer, Geschäftsdatum unlesbar.
Warnung: Seite fehlt, Zeitraum < 30 Tage, Arrivals unvollständig (Gegenprobe gegen Departures), unbekannte Zimmer (einzelne), Summenzeile passt nicht, Auslastung unplausibel, doppelte Zeilen, Anrede fehlt.

## Nachtlöschung (M3)

Alle Gastdaten werden abends gelöscht und kommen mit dem Import zurück — siehe `docs/datenschutz-loeschkonzept.md`.

## Testdaten

Nachbau-PDFs mit erfundenen Namen: `npm run fixtures:opera` (→ `tests/fixtures/opera/`). Durchlauf eines Morgens: `scripts/morning-demo.ts` (Wegwerf-DB, Aufruf im Kopf der Datei).

## Planungshub = einzige Datenquelle des Arbeitstags

Board, Grundriss, Arbeitslisten, Priorität und Zuteilung arbeiten ausschließlich mit dem Tagesplan des **Betriebstags** (`src/lib/dayplan/hubDay.ts`). `POST /api/dayplan/merge` berechnet ihn für heute und übernimmt ihn sofort aufs Board (Belegung, Abreise, erwartete Anreisen; Zimmer ohne Eintrag: belegt nur laut In-House-Liste). Gibt es für heute keinen Tagesplan, zeigen die Ansichten keine Tagesdaten, sondern den Hinweis „Für heute sind noch keine Listen eingelesen“ (Supervisor/Duty Manager mit Link zum Planungshub) — nie den Stand eines älteren Tages. Dabei setzt der Hub auch den morgendlichen Zimmerstatus: alle Zimmer sauber (INSPECTED), nur nachweislich belegte oder belegt gewesene (Abreise, Turn, Bleiber, In-House-Liste) schmutzig. Was heute schon bearbeitet wurde, bleibt; ein Nachimport am selben Tag macht neu abreisende Zimmer schmutzig. Der Knopf „Tagesplan aufs Board übernehmen“ entfällt (läuft automatisch). Tagsüber bleiben Statusänderungen, manuelle Anreisen (Front Office) und Zuteilungsänderungen im Grundriss erlaubt; Zuteilungen gelten nur am Tag, an dem sie gemacht wurden (`assignedOn`).
