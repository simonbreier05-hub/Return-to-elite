# Status: Import- und Zählfehler 28.10.2026 — 2026-10-28

Branch: `fix/import-count-v1`, abgezweigt von `feat/dm-live-listen` (= Preview-Stand, 17 Commits vor `main`, enthält alle Zwischen-Branches). Kein Commit auf `main`, nichts gepusht.

## Ergebnis in einem Satz
Der Fehler lag **in der Planungsberechnung, nicht im Parser**: Bleiber wurden nur aus der Departures-Liste abgeleitet, die bei dir nur 3 Tage abdeckt. Die In-House-Liste wurde zwar eingelesen, aber nie für den Tagesplan benutzt. Dazu zählten mehrere Ansichten „belegt“ und „zu reinigen“ jeweils selbst.

## Wichtig: Testdateien
Deine fünf PDFs lagen nicht im Projekt. Ich habe sie nach deiner Beschreibung mit reportlab nachgebaut (`tests/fixtures/opera/2026-10-28/`, erfundene Namen, mehrseitig, Etagenüberschriften, Firma leer/gefüllt, V1/V2, „T“, XAS/XDL, Kinder). **Bitte die Originale nachreichen** — dann laufen dieselben Tests dagegen (`npx tsx scripts/diagnose-import.ts <PDFs> --day=2026-10-28`, gibt nur Zahlen/Zimmernummern aus).

## Parser gegen den Nachbau (vorher = nachher, alle Zeilen erkannt)
| Liste | erkannt | erwartet | verworfen |
|---|---|---|---|
| In-House | 113 (38 RESV + 75 CKIN), 155 Personen | 113 | 0 |
| Departures | 71 (26 / 24 / 21) | 71 | 0 |
| Arrivals | 38 | 38 | 0 |
| Traces | 44 gelesen, 30 offen übernommen | 44 / 30 | 14 erledigt (gewollt) |
| Forecast | Zeile 28.10.: 113 / 38 / 26 / 155 / 3 OOO / 79,58 % | ✓ | History (gewollt) |

Hypothesen geprüft: RESV verworfen — nein (Parser behält alle; aber In-House wurde im Plan nicht genutzt). Seitenumbruch — nein. Leere Firma / V1/V2 / „T“ — nein. XAS/XDL/Kinder — nein. Stand-Datum-Filter — nein. Gefunden: Zeilen ohne erkennbare Zimmernummer wurden **still** übersprungen (jetzt Warnung), und der In-House-Parser verlangte eine Nächte-Spalte an fester Stelle (jetzt optional).

## Ursachen (Stand vor dem Fix, Datei:Zeile)
1. `src/lib/dayplan/derive.ts:69–97` (`mergeStays`) und `src/lib/dayplan/merge.ts:50–54`: Aufenthalte nur aus Departures + Arrivals. Bleiber mit Abreise nach dem Departures-Zeitraum (bei dir ab 31.10.) fehlten → nur ~25 statt 75 Bleiber, „49 zu reinigen“, Credits nur für 49 Zimmer.
2. `src/lib/dayplan/dayNumbers.ts:229–230`: „belegt“ = morgens laut Board belegt + Service-Zimmer. Anreisen (RESV) zählten nicht, Abreisen schon → nie 113. Zahl 145 = `Setting roomInventory` (korrekt).
3. Getrennte Zählungen: `src/lib/lists/serviceOverview.ts:17` (eigene Regel, nur eigene Etagen), `src/lib/planung/model.ts:50` (Etagen: Abreise+Turn+Bleiber), `src/lib/autoplan/load.ts:63` (eigener Filter).
4. `src/lib/dayplan/merge.ts:238`: jede In-House-Zeile, auch RESV, hätte das Zimmer morgens schmutzig/belegt gesetzt.
5. `src/lib/dayplan/merge.ts:62–66`: Zimmer außerhalb des Zimmerstamms (139 digitalisiert, Haus 145) werden übersprungen — nur als Warnung sichtbar. Vermutlich ein Teil deiner Differenz (14 statt 26 Abreisen bzw. 10 statt 12 Turns), nicht prüfbar ohne deine Dateien.
Kürzung nach Etage/Mitarbeitern/Zeitfenster/Limit vor dem Zählen: keine gefunden (nur die Service-Übersicht war für Supervisor auf eigene Etagen gefiltert).

## Fix
- **Tagesplan:** In-House ist dritte Quelle (`mergeStays`); Konflikte bei Abreisedaten → Warnung. RESV-Zeilen machen Zimmer weder belegt noch schmutzig.
- **Eine Zählregel** in `dayNumbers.ts`: `isToClean` (Abreisen + Turns + alle Bleiber + Anreisen in nicht gereinigte Zimmer, ohne außer Betrieb) und `isOccupiedTonight` (Bleiber + Turns + Anreisen = Forecast „Total Occ.“). Genutzt von Tageszahlen, Service-Übersicht, Etagenbalken, Autoplan/Entwurf (Credits über alle zu reinigenden Zimmer). Service-Seite zeigt oben dieselben Kacheln wie das Duty-Manager-Board.
- **Parser:** In-House liest Status RESV/CKIN, optionale Spalten, Nächte aus den Daten; alle PDF-Parser melden verworfene Datumszeilen (`ROW_SKIPPED`).
- **Plausibilität (neu):** Warnung oben im Planungstool mit konkreten Zahlen („In-House zeigt 90 belegt, Forecast erwartet 113.“) für belegt, Anreisen, Abreisen, Personen, Auslastung, unbekannte Zimmer. Nicht blockierend; „Gesehen, trotzdem planen“ (Logbuch).
- **Löschen + neu einlesen:** Frontend entfernt alle Zustände des Typs und setzt den Schritt zurück; Gate neu geladen.
- Fairness-Gewichtung und Multi-Tenant nicht angefasst. **Keine Schema-Änderung, keine Migration** (Status steckt im JSON der Importzeile) → kein Backup nötig.

## Vorher / Nachher (Nachbau 28.10.)
| Zahl | vorher | nachher | Soll |
|---|---|---|---|
| Bleiber | 30 | 75 | 75 |
| Abreisen heute / Turns | 26 / 12 | 26 / 12 | 26 / 12 |
| Belegt | ≠ 113 | 113 von 145 | 113 |
| Zu reinigen | 56 | 101 (12 Turn + 14 Abreise + 25 Bleiber m. Wäsche + 50 Bleiber) | 101 |
| Entwurf-Zimmer (Credits) | 56 | 101 | 101 |
Deine Preview-Zahlen (90 / 49) weichen von meinen „vorher“-Werten ab, weil die Zimmerverteilung im Nachbau anders ist; das Muster (Bleiber fehlen) ist dasselbe.

## Tests
- `npx vitest run`: **80 Dateien, 667 Tests grün** (vorher 77/648). Neu: `tests/import2810.fixtures.test.ts` (exakte Soll-Zahlen je Liste, Tagesplan, Regression), `tests/import2810.integration.test.ts` (DB: alle Zähler gleich, Löschen → neu einlesen ohne Navigation), `tests/importCountFix.test.ts` (Layout-Varianten, zu reinigen mit Bleibern, Plausibilitätswarnung, Reset nach Löschen). 6 bestehende Tests an die neue „belegt“-Definition angepasst.
- `tsc` sauber, `next build` ok. ESLint ist im Repo nicht eingerichtet.
- Browser (Playwright, Produktions-Build, Nachbau-PDFs): Desktop 1280, iPad 820, Handy 390 — fünf Listen einlesen, 113/145 und 101 überall gleich, In-House löschen → neu hochladen → übernehmen ohne Seitenwechsel, Warnbanner, kein horizontales Scrollen, keine JS-Fehler.

## Deploy
Nicht deployt: Laut Vorgabe nicht pushen ohne Rückfrage — Preview-Deploy braucht den Push. Schema identisch mit `feat/dm-live-listen`, Umstellen der Preview-Quelle ist also unkritisch.

## Offen / unsicher
1. Originale PDFs fehlen — Layout deiner Dateien nicht direkt geprüft.
2. 6 Zimmer des Hauses fehlen im Zimmerstamm (z. B. 430). Liegen belegte Zimmer darunter, fehlen sie im Plan; die Warnung nennt sie jetzt. Welche Nummern sind es?
3. „Belegt“ heißt jetzt „heute Nacht belegt“ (wie Forecast). Abreise-Zimmer zählen nicht mehr als belegt. So gewollt?
4. Echte Opera-In-House-Exporte führen meist abreisende Gäste (DUOT) mit; das wird korrekt als Abreise gelesen, ist aber nur am Nachbau getestet.
