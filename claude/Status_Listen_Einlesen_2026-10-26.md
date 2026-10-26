# Status: Listen einlesen stabilisieren + Listen löschen (v1) — 2026-10-26

Branch: `feat/listen-einlesen-loeschen` — enthält `feat/plan-grundriss` (per Merge-Commit, kein Force-Push). PR gegen `feat/plan-grundriss`, nicht gegen `main`.

## Ist-Stand vorher (Schritt 0)
- **Prompt 1 (Betriebstag) ist umgesetzt — aber nur auf `feat/plan-grundriss`, nicht in `main`** (Commit c60b20d: `berlinToday()`, Gate `listBlockers`/`planningAllowed`, „Trotzdem verwenden" für veraltete Listen, Datumslayout). Das habe ich zuerst übersehen (nur `main` geprüft) und kurz einen eigenen Betriebstag-Filter gebaut; der ist wieder entfernt. Jetzt gilt allein das Modell aus Prompt 1, nichts doppelt.
- Einlesen: `useImportSession` (Hook, genutzt von `/planung` und `/import`). Kein SWR/React Query, keine Server Actions — einfacher React-State + `fetch`. `/planung` ist `force-dynamic`, der Router-Cache spielt keine Rolle.
- Gate: `listsReady()` → `missingLists()` (`src/lib/import/readiness.ts`), serverseitig `missingAppliedLists()` in Merge/Vorschlag.
- Löschen von übernommenen Listen gab es nicht.

## Ursache (im Browser nachgestellt)
1. **„Listen übernehmen" schickte alle fünf Listen gleichzeitig** (`Promise.all`). Jede Übernahme ist eine Datenbank-Transaktion (Prisma-Standard: 5 s). Gleichzeitig sperrten sie sich gegenseitig → **4 von 5 Listen scheiterten** („Transaction already closed … 5000 ms", „Socket timeout"). Der Forecast speicherte zudem jeden Tag einzeln (viele Abfragen in der Transaktion).
2. Danach rief der Hub den Tagesplan-Merge auf; der scheiterte am Gate (Listen fehlten) — der Fehler wurde **still verschluckt** (`.catch(() => null)`). Es „passierte nichts".
3. Beim Verlassen und Wiedereintreten waren die bereits gespeicherten Listen da, nur noch wenige mussten neu eingelesen werden → weniger Gleichzeitigkeit → klappte. Daher der Eindruck „geht erst beim zweiten Mal".
4. Zusätzlich veraltet: Listen von gestern zählten als „übernommen".

## Änderungen
- **Übernehmen nacheinander** (`inOrder` in `useImportSession.ts`); danach wird der Stand **abgewartet und neu geladen**, erst dann der Merge. Hub (Karten, Ring, Gate, Haus) aktualisiert sich sofort.
- `applyBatch` (`src/lib/import/store.ts`): Forecast als `deleteMany` + `createMany`, Transaktions-Timeout 20 s; Ersetzen wird als `IMPORT_REPLACED` protokolliert.
- **Fehler sichtbar** mit „Erneut versuchen" (pro Karte: Lesen oder Übernehmen wiederholen; Tagesplan-Berechnung wiederholen). Datenbankfehler kommen nie roh an die Oberfläche (Apply-Route → 503 mit verständlicher Meldung).
- Betriebstag/Gate: unverändert aus Prompt 1 (`listBlockersNow`). `GET /api/import/status` liefert zusätzlich `plan` (bestätigt / Listen geändert).
- **Liste löschen** je Kachel (zwei Taps: „Liste löschen" → „Liste löschen?" → „Ja, löschen"/„Abbrechen"): `DELETE /api/import/lists/[type]`, Logik `src/lib/import/deleteList.ts`.
  - Löscht die eingelesene Liste — alle übernommenen Stände des Typs, sonst würde ein älterer Stand als „veraltet" nachrücken. Danach fehlt sie im Gate, ein neuer Import ersetzt sie.
  - Entfernt Gastdaten/Traces nur, wenn sie allein aus dieser Liste stammen: Import-Aufenthalte (nicht in der anderen Liste Departures↔Arrivals), erwartete Import-Anreisen, offene Traces (nicht auch in Arrivals↔Traces), Forecast-Tage. **Bleiben**: erledigte Traces und Traces mit Hausmann-Aufgabe (Arbeitsnachweis), manuelle Anreisen, der Tagesplan (Zimmerarten).
  - Logbuch `IMPORT_LIST_DELETED`: Liste, Betriebstag, Nutzer, Zähler — keine Namen/Texte.
  - **Bestätigter Plan**: Die Rückfrage zeigt „Plan bleibt bestehen …"; der Server verlangt diese Bestätigung (409 ohne `keepPlan=1`). Danach zeigt der Hub „Listen geändert, Plan neu berechnen?" mit Link zum Plan.
  - Nur Supervisor und Duty Manager (`requireRole(["supervisor"])`).
- Live: Broadcast `import:deleted` (nur Typ + Datum) → andere offene Hubs laden neu.
- Texte de/en, Doku `docs/opera-import.md`, `CLAUDE.md` (+4 Zeilen).
- **Datenbank: keine Schema-Änderung, keine Migration** (nur vorhandene Tabellen). Deshalb kein Backup nötig; lokal nur eine frische SQLite-Test-DB.

## Tests
- `npx vitest run` (nach dem Merge mit `feat/plan-grundriss`): **72 Dateien, 594 Tests grün**.
  - Neu `tests/importDeleteList.integration.test.ts`: Löschen setzt Gate zurück (auch ältere Stände weg, kein „veraltet"-Nachrücken), Nachimport ersetzt, Logbuch ohne Gastdaten, Rollen (Housekeeper/Front Office 403, ohne Login 401, Duty Manager ok), Gastdaten/Traces nur aus dieser Liste, Forecast, bestätigter Plan (409 → keepPlan → Hinweis).
  - Neu `tests/planung/importRefresh.test.ts`: Übernahme nacheinander, Gate öffnet sich in derselben Sitzung, nach Löschen sofort fehlend, verständliche Fehlermeldungen.
- `npx tsc --noEmit` sauber, `npm run build` erfolgreich.
- **Browser (Playwright, Produktions-Build, Beispiel-PDFs mit erfundenen Namen)** auf Desktop 1280 px, **Mobil 390 px** und **iPad 820 px**: 5 Listen einlesen → übernehmen → alle „übernommen", „Weiter: Team" aktiv, keine API-Fehler; Liste löschen (zwei Taps) → Kachel „wartet", Gate zu; neu einlesen → wieder komplett. Kein seitliches Scrollen. Screenshots nur lokal, nicht im Repo.

## Deploy-Status
- Railway-Projekt „StayClean", Dienst `StayClean-preview` (eigene DB `postgres-preview`, URL stayclean-preview-production.up.railway.app). Production (`StayClean`) **nicht angefasst**.
- **Zwischenfall — Datenverlust auf der Preview-DB (nicht Production), mein Fehler:** Ich hatte die Preview zuerst auf den `main`-basierten Stand (d7c0c39) umgestellt, ohne zu prüfen, was sie vorher lief: `feat/plan-grundriss`, mit 3 Spalten, die `main` nicht hat. Ich habe sofort zurückgestellt; der schon gestartete Build wurde um 10:35 trotzdem ausgerollt. Das Startskript (`db push --accept-data-loss`) hat auf `postgres-preview` gelöscht: `ImportBatch.staleAcceptedAt`/`staleAcceptedById` (5 Werte = 5 „Trotzdem verwenden“-Bestätigungen) und `Trace.assignedToId` (7 Werte = 7 Hausmann-Zuteilungen). Der nächste Deploy legt die Spalten wieder an, **die Werte sind ohne Backup nicht zurückzuholen**. Folge auf der Preview: diese Listen müssen ggf. erneut „trotzdem verwendet“ und die 7 Hausmann-Aufgaben neu zugeteilt werden. Lehre (auch in CLAUDE.md): vor dem Umstellen der Preview-Quelle den laufenden Branch und dessen Schema vergleichen.
- Jetzt: Preview auf `feat/listen-einlesen-loeschen` (= `feat/plan-grundriss` + diese Änderungen, **gleiches Schema**, kein Löschen von Spalten). Status siehe PR.

## Offene Fragen
1. `feat/plan-grundriss` ist noch nicht in `main`. Reihenfolge: erst diesen Branch (PR) nach `feat/plan-grundriss`, dann `feat/plan-grundriss` nach `main`?
2. Löschen von **Departures/Arrivals** entfernt Import-Aufenthalte, auch eingecheckte (`IN_HOUSE`) — deren Gast-Link (`/g/s/…`) funktioniert dann nicht mehr, bis neu importiert wird. Ist das so gewollt, oder sollen eingecheckte Aufenthalte bleiben?
3. Der **Tagesplan** (Zimmerarten im Haus-Bild) bleibt nach dem Löschen stehen, bis neu importiert wird. Soll er beim Löschen von Departures sofort geleert werden?
4. Löschen gibt es im Planungstool; auf der Seite `/import` noch nicht. Gewünscht?
5. Der Fehler trat lokal mit SQLite sehr deutlich auf; auf Railway (Postgres) vermutlich durch knappe Verbindungen/Latenz. Bitte einmal auf der Preview mit echten Listen prüfen, und vor einem Release einmal in echtem Safari.

---

# Nachtrag 26.10.: Planungshub als einzige Datenquelle

**Vorgabe:** Die App arbeitet ausschließlich mit den Daten aus dem Planungshub. Entscheidungen: ohne eingelesene Listen für heute → leer + Hinweis; Demo-Tagesdaten entfernen; Statusänderungen, manuelle Anreisen (Front Office) und Zuteilungsänderungen im Grundriss bleiben erlaubt.

**Ist-Stand vorher (Ursachen):**
- Ansichten fielen auf „zuletzt eingelesenen Tag" bzw. den jüngsten Tagesplan zurück (`latestPlanDate`, `dayRoomPlan.findFirst`) → still der Stand von gestern.
- Belegung/Abreise auf dem Board kamen **nie automatisch** aus dem Hub: nur per Knopf „aufs Board" auf `/import`. Sonst standen dort die erfundenen Seed-Werte.
- Zimmer ohne Tagesplan-Eintrag behielten alte Werte, wenn die Departures-Liste < 30 Tage abdeckte.
- Zuteilungen von gestern erschienen weiter auf Board und „Meine Zimmer".
- Seed legte Demo-Status, Belegung, Abreisen, Zuteilungen, Anreisen, einen Aufenthalt, Ausflüge, Defekt, Aufgaben, Notizen an.

**Änderungen:**
- `src/lib/dayplan/hubDay.ts`: eine Prüfung „gibt es für heute einen Tagesplan?". Tag ist immer der Betriebstag.
- `POST /api/dayplan/merge` rechnet nur für den Betriebstag und übernimmt den Plan sofort aufs Board; Zimmer ohne Eintrag: keine Abreise, belegt nur laut In-House-Liste. Eine im Hub als veraltet bestätigte Departures-Liste wird für heute verwendet.
- Ohne Tagesplan für heute: Board (Supervisor, Duty Manager), Grundriss, „Meine Zimmer", Priorität, Umverteilungskarten, alter Planer → leer + Hinweis „Für heute sind noch keine Listen eingelesen" (Planer mit Knopf „Zum Planungshub"). Hausmann-Liste und „Zimmer und Service heute" ebenso. Schnellsuche findet Zimmer weiter, ohne Tagesdaten.
- Zuteilungen zählen nur, wenn sie von heute sind (`assignedOn`).
- Ansichten laden automatisch nach, sobald der Hub den Tagesplan berechnet (`dayplan:updated`).
- Seed: nur Mitarbeiter, Zimmer-Stammdaten, Etagen-Einrichtungen, Einstellungen.
- `prisma/reset-day-data.ts`: entfernt einmalig Demo-Tagesdaten aus einer bestehenden DB (Hub-Daten bleiben). Läuft beim Start nur mit `RESET_DAY_DATA_ONCE=1` — gesetzt nur am Preview-Dienst, nicht an Production.
- Keine Schema-Änderung.

**Tests:** 73 Dateien, 601 Tests grün (neu `tests/hubDay.integration.test.ts`; 5 bestehende Testdateien stellen jetzt die Uhr auf ihren Testtag). `tsc` sauber, Build ok. Browser (390 px / Desktop): Hinweis vor dem Einlesen auf Supervisor-Board, Duty-Manager-Board, „Meine Zimmer", Grundriss; nach dem Einlesen im Hub Board sofort gefüllt (139 Zimmer, Belegung/Abreisen laut Listen), keine Fehler.

**Offene Fragen:**
1. Zimmerstatus (schmutzig/sauber …) kommt nicht aus den Opera-Listen. Neue/bereinigte Zimmer starten mit dem Schema-Standard „schmutzig". Soll der Status morgens aus dem Tagesplan gesetzt werden (z. B. Abreise/Bleiber → schmutzig, sonst geprüft)?
2. Die Gast-Vorschau-Kachel auf der Login-Seite brauchte den Demo-Aufenthalt in 301 und zeigt jetzt „Zurzeit nicht verfügbar", bis ein echter Aufenthalt aus dem Hub da ist. Kachel entfernen oder auf ein Zimmer aus dem Tagesplan zeigen lassen?
3. Production hat vermutlich noch Demo-Tagesdaten. Dort ebenfalls einmal bereinigen (`RESET_DAY_DATA_ONCE=1` am Production-Dienst)? Ich habe Production nicht angefasst.
4. Der Knopf „Tagesplan aufs Board" auf `/import` ist jetzt überflüssig (läuft automatisch). Entfernen?
