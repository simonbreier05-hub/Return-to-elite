# Status: Listenentwurf — konsistente Zahlen, Drag&Drop, gebündelt zuteilen, Bestätigen (v1) — 2026-10-26

Branch: `feat/listenentwurf` (von `feat/listen-einlesen-loeschen`; Prompt 3 ist dort umgesetzt). Kein Commit auf `main`, kein Force-Push.

## Schritt 0 — was schon da war (nicht doppelt gebaut)
Entwurf ansehen/bearbeiten (`PlanEditorWindow`), keine Sperren, Bestätigen in einer Transaktion (`confirmProposal`), Meldungen (`notifyPlanConfirmed`, `notifyReassignment`), Grundriss als Zuteilungsansicht, Betriebstag und Hub als einzige Datenquelle. Neu gebaut wurde nur das Fehlende (siehe „Änderungen").

## Ursachen je Punkt
| Beobachtung | Ursache |
|---|---|
| **113 belegt** | `Room.occupancy = OCCUPIED` aller Zimmer (live). |
| **35 zugeteilt** | Der Entwurf (`loadDay`) ließ Zimmer, die schon „fertig" (CLEAN/INSPECTED) und niemandem zugeordnet waren, still weg („nichts zu planen") — das waren die 78 fehlenden Zimmer: Demo-Altlast (Seed setzte Zimmer fertig). Die Kachel nahm dann die Entwurfsmenge (35) als Grundmenge. Typen der 78 (Abreise/Turn/Bleiber) lassen sich aus den Altdaten nicht mehr rekonstruieren; seit dem Hub-Status (Prompt 3b) sind alle belegten Zimmer „schmutzig" und damit in der Planmenge. |
| **55 gereinigt** | `occupancy = OCCUPIED` und CLEAN/INSPECTED — über *alle* belegten Zimmer, nicht über die zugeteilten. |
| **72 Wäschewechsel** | Der Browser rechnete selbst: jeder Bleiber ohne erfasstes Wechseldatum galt als „fällig" (`lastLinenChangeAt` leer = fällig), und niemand erfasst Wechsel → fast alle. Zusätzlich schrieb der Import die Anreise als Wechseldatum (erfundene Daten). |
| **Alle Zimmermädchen nach Bestätigen / vorher** | `loadDay` nahm ohne Auswahl *alle* aktiven Kräfte als anwesend; der Tagesplan-Merge rief sofort die Umverteilungsprüfung auf — noch vor der Bestätigung entstanden Vorschläge mit nicht gewählten Kräften (und Meldungen). Die Auswahl wurde nirgends als „die Mannschaft des Tages" gelesen. |
| **Hausmann-Traces** | Standard war „für alle" (`assignedToId = null`) — auch nicht gewählte Hausmänner sahen und bekamen alles; nur Handänderungen wurden gespeichert. Hausmann-Liste lud nach „Bestätigen" nicht nach (hörte nicht auf `assignments:applied`). |
| **Seite lädt nach jeder Zuteilung neu** | Jede Zuteilung sendet `room:update`; `AssignmentFloorPlan` baute das ganze Panel mit `key={version}` neu auf (Ladezustand, Scroll-Stand, Auswahl, Ansicht weg). Fehler setzten zudem das ganze Panel auf eine Fehlerseite. |
| **Meldungen unzuverlässig** | Zimmermädchen wurden nur gemeldet, wenn sich ihre Liste gegenüber vorher geändert hatte (schon zugeteilte bekamen nichts); *alle* Supervisoren/Hausmänner bekamen Meldungen, nicht nur die gewählten. |

## Änderungen
- **A Zahlen:** eine Funktion `computeDayNumbers` (+ `getDayNumbers`, `GET /api/day-numbers`, Kacheln `DayNumberTiles`): Belegt N/145, Zu reinigen, Zugeteilt X von N, Gereinigt Y von N, Offen N−X (Link zu den offenen Zimmern). „Fertig" zählt als zugeteilt; außer Betrieb/außer Service/Gast lehnt ab stehen als Zahl mit Grund da; Zuteilungen an nicht gewählte Kräfte zählen als offen und werden gemeldet. Grundriss, Duty-Manager-Board und Entwurf nutzen sie; alte Zählfunktion `occupancyCleanCount` entfernt.
- **B Mannschaft:** `teamIdsFor`/`savedTeamFor`; Vorschlag, Umverteilung, Bestätigen, Meldungen nur mit den Gewählten. Umverteilung erst ab bestätigtem Plan (Altlast-Vorschläge werden ausgeblendet/ersetzt). Reicht das Personal nicht: alle Zimmer werden trotzdem verteilt, Warnung „Personal reicht nicht: benötigt N Kräfte, ausgewählt M …".
- **C Wäsche:** Regel in `derive.ts` (erfasster Wechsel + Intervall, sonst jede n-te Nacht ab Anreise; Intervall = Einstellung `linenCycleDays`, Standard 3). Import schreibt kein Wechseldatum mehr; beim Fertigmelden eines fälligen Bleibers wird der Wechsel automatisch erfasst. Ohne Anreisedaten gibt es keine Kachel. Fällige Zimmer sind im Grundriss/in Listen markiert und Teil der Zuteilung (kein eigener Topf).
- **D Hausmann:** `distributeHouseman` beim Bestätigen (ein Hausmann = alle; mehrere nach Etage; Handwahl bleibt; nie ein nicht gewählter). Vorschau im Entwurf. Liste lädt nach dem Bestätigen live nach.
- **E/F Brett:** `DragDropBoard` für Zimmer→Zimmermädchen, Etagen→Supervisor (Entwurf), Traces→Hausmann (Entwurf): Antippen = Mehrfachauswahl, Schnellauswahl „Alle offenen"/je Etage, Umschalt+Klick = Bereich, Leiste „Zuteilen an" (zwei Taps), Halten bzw. Ziehen (Maus und Touch, Auto-Scroll). Begonnene Zimmer fragen gebündelt nach. Das Modal „+ Zimmer" ist jetzt Mehrfachauswahl.
- **F live:** `POST /api/rooms/bulk-assign` (nur Supervisor/Duty Manager; 409 `STARTED_ROOMS` ohne Bestätigung; eine Meldung je Person via `notifyBulkReassignment`).
- **G Kein Neuladen:** `key`-Neuaufbau ersetzt durch `reloadToken` + Hintergrund-Nachladen; optimistisches Update, bei Serverfehler Hinweis und Zurückrollen; Fehler sind nie mehr Vollbild.
- **H Bestätigen:** erste Bestätigung des Tages meldet jeder gewählten Kraft mit Zimmern ihre fertige Liste; Hausmänner/Supervisoren nur die gewählten; Duty Manager Gesamtmeldung; ein Eintrag je Person (dedupeKey); live per `notification:new` + Listen-Updates (`assignments:applied`, `trace:update`).
- Keine Schema-Änderung, keine Migration.

## Tests
- `npx vitest run`: **74 Dateien, 623 Tests grün** (neu: `tests/listenentwurf.test.ts` — Zahlen-Invariante mit 200 Zufallstagen, 113-belegt-Szenario, Wäsche nur aus echten Daten, Hausmann-Verteilung, Scan „kein Neuladen"; `tests/listenentwurf.integration.test.ts` — Datenbankzahlen, 4 von 6 Kräften auch nach Bestätigen, ein Hausmann bekommt alle, Meldungen nur an die Betroffenen, Mehrfachzuteilung/Verschieben/Rollen/Bestätigung begonnener Zimmer; angepasst: Derive-, Merge-, Purge-, Autoplan-Tests).
- `tsc` sauber, `next build` ok.
- Browser (Playwright, Produktions-Build, Beispiel-PDFs): Desktop 1280, iPad 820, Handy 390 — Alle offenen → Kraft (11 Zimmer, ein Schritt), Ziehen eines Zimmers auf eine andere Kraft (Maus; Touch mit langem Drücken), Kacheln konsistent (Belegt 14/145, Zu reinigen 11, Zugeteilt 0→11, Wäschewechsel 2), **0 Navigationen, Panel bleibt dasselbe (Marker bleibt), keine Fehler**.

## Deploy-Status
Siehe PR; Preview-Quelle erst umstellen, wenn das Schema des laufenden Branches enthalten ist (hier: identisch, keine Schemaänderung).

## Offene Fragen
1. **Supervisor-/Hausmann-Zuteilung nach dem Bestätigen** per Ziehen: im Entwurf fertig. Für die *bestätigte* Live-Liste (Etagen→Supervisor, Traces→Hausmann nachträglich) gibt es bisher `PUT /api/planung/houseman` und die Etagen-Zuteilung, aber noch kein Brett. Gewünscht?
2. **Bereich „ziehen" (Lasso)** zum Auswählen gibt es nicht; stattdessen Antippen, „Alle offenen", je Etage, Umschalt+Klick (Bereich). Reicht das?
3. **Grundriss-Ansicht** wählt weiter ein Zimmer pro Tipp (Modus „Housekeeper → Zimmer"); Mehrfachauswahl/Ziehen gibt es in der Listenansicht. Auch im Grundriss gewünscht?
4. Das Wäsche-Intervall (3 Tage) ist als Einstellung `linenCycleDays` hinterlegt; es gibt dafür noch kein Eingabefeld in den Einstellungen. Soll ich eines ergänzen?
5. Alte Demo-Zimmer „fertig ohne Zuteilung" zählen als zugeteilt (fertig = erledigt). Ist das so richtig, oder sollen sie als eigene Zahl „bereits fertig" erscheinen?
