# Status: Import-Fehler nach Deploy #39 — 2026-10-23

## Ist-Stand vorher
Beim Übernehmen: Forecast „Druckdatum nicht lesbar“ (0 Zeilen), Arrivals „Datumsformat weicht vom Layout ab“, 32× „ohne Anrede“, und Departures/Traces/In House standen als „übernommen, Stand 06.10.“, obwohl heute der 23.10. war.

## Ursache je Punkt
1. **Forecast:** Der Parser suchte das Druckdatum nur im „Kopf“, der erst ab der Spaltenzeile „Rooms …“ erkannt wird. Wird sie nicht gefunden, ist der Kopf leer → kein Datum → `TODAY_UNKNOWN` (kritisch). Das Datum hing außerdem allein am Dateikopf, nicht am Betriebstag.
2. **Datumsformat:** Das „gespeicherte Layout“ war fest im Code (`DEFAULT_MAPPING.dateFormat = MDY`, Demo-Hotel); `ImportMapping` war nie angebunden. Das Hotel liefert TT/MM/JJ → bei jeder Datei Warnung.
3. **Anrede:** Der Name wurde nur aus einer Zelle zerlegt; ohne Anrede im Namen blieb sie leer und `NO_SALUTATION` meldete einmal pro Datei die Gesamtzahl (hier 32 von 32) als Warnung.
4. **„Stand 06.10.“:** `dataStatus` nahm den zuletzt übernommenen Stand je Typ, das Gate (`missingLists`) prüfte nur, ob irgendein Stand existiert — nie das Datum.

## Änderungen
- Betriebstag = Berlin heute (`src/lib/import/businessDay.ts`); Browser-Standard `todayIso()` jetzt Berlin statt Gerätezeit.
- Druckdatum robust (`parseCommon.findHeaderDateRaw`): Label → erstes Datum im Kopf (auch „Datum Uhrzeit“ in einer Zelle) → erste 12 Zeilen der Seite; Forecast zusätzlich: erste Datumszeile unter „Forecast“. Filter-/Datenzeilen zählen nicht. Nichts gefunden → `NO_PRINT_DATE` (Info), Liste gilt für den Betriebstag (`store.storeBatch`).
- Forecast schneidet History am Betriebstag ab (Datei nur Abgleich).
- Veraltet: `LIST_NOT_TODAY` (Warnung); Gate (`readiness.listBlockers`) + `merge`/`propose` (409) verlangen Stand = Betriebstag oder Bestätigung. Neu: `POST /api/import/stale` („Trotzdem verwenden“, Audit `IMPORT_STALE_ACCEPTED`), Knopf im Planungstool und auf `/import`.
- Layout: `GET/PUT /api/import/layout` (`ImportMapping`), Speichern nach „Übernehmen“. Plausibilitätsprüfung (`implausibleDateCount`): passt es zum Betriebstag, ist die Abweichung nur Info; sonst `DATE_IMPLAUSIBLE`.
- Anrede optional: `salutationIssues` (ein Hinweis statt Schwall), Anrede auch aus eigener Spalte neben dem Namen.
- **Schema (additiv):** `ImportBatch.staleAcceptedAt`, `ImportBatch.staleAcceptedById` (beide nullable) in `schema.prisma` und `schema.postgres.prisma`. Kein Backup nötig/möglich: es gibt keine lokale Dev-DB-Datei; auf Railway gleicht der Boot per `db push` ab (nur Spalten hinzufügen). Migrationsordner gibt es im Projekt nicht.

## Tests
`npx vitest run`: 67 Dateien, 550 Tests grün (neu: `tests/importBetriebstag.test.ts`, `tests/importStale.integration.test.ts`; zwei Erwartungen in `importSheets.test.ts` angepasst). `tsc` sauber, `npm run build` erfolgreich. Mobil (390 px): nicht visuell geprüft (nur Textzeile + Knopf ≥ 44 px an den Dateikarten).

## Deploy-Status
Siehe Abschlussmeldung im Chat.

## Offen / Fragen
1. Der echte Opera-Forecast-Kopf liegt nicht vor: die Erkennung ist an der beschriebenen Kopfzeile („06/10/26“, „07:06“) getestet, aber nicht an der echten Datei. Bitte einmal in der Preview mit der echten Datei prüfen.
2. Echte Anrede-Quelle unbekannt (eigene Spalte? andere Wörter wie „Hr.“ ist drin)? Bei 32/32 bleibt es jetzt ein Hinweis.
3. Soll „Trotzdem verwenden“ auch Duty-Manager-only sein? Aktuell: Supervisor und Duty Manager.
4. Der Betriebstag wechselt um 00:00 Berlin; soll der Morgen-Import bis z. B. 04:00 noch als Vortag gelten?
