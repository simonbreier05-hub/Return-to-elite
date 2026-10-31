# Zähllogik „belegt" / „zu reinigen" (Prüfung 31.10.2026)

Tests: `tests/countLogic.test.ts`. Keine Logik geändert.

## Wo welche Zahl herkommt

| Anzeige | Datei / Funktion | Quelle | Regel |
|---|---|---|---|
| `/planung` „belegt" | `src/lib/planung/model.ts` `houseTotals` ← `getHouseData` | `DayRoomPlan` (Import), nur 139 Kacheln | Abreise + Turn + Bleiber |
| `/planung` „Abreisen"/„Anreisen" | dto. | dto. | Abreise + Turn / Anreise + Turn |
| Import „Zu reinigen" | `src/lib/dayplan/derive.ts` `figures.cleaningCount` | Opera-Zeilen (bekannte Zimmer) | Abreisen (inkl. Turn) + Bleiber |
| Import „Belegt heute Nacht" | dto. `eveningOccupancy` | dto. | Bleiber + Anreisen |
| Duty Manager / Planungshub „N belegt, M davon gereinigt" | `src/lib/rooms/occupancyCleanCount.ts` | `Room.occupancy` + `Room.status` (Live-Board) | belegt = OCCUPIED; gereinigt = CLEAN/INSPECTED |
| `/supervisor/planning` „Zimmer zu reinigen" | `src/app/api/assignments/plan/route.ts` (`roomsNeedingWork`) | `Room.occupancy` + `isCheckoutToday` | OCCUPIED oder Abreise heute; Unterzeile „noch offen" = Status DIRTY/PICKUP/BLOCKED/IN_PROGRESS |
| Planungstool Schritt 2 Bedarf / Autoplan | `src/lib/autoplan/load.ts` `loadDay` | `DayRoomPlan` + `Room.status` | Abreise + Turn + Bleiber, **ohne** OOO/OOS/Green-Opt-out, **ohne** Zimmer, die schon CLEAN/INSPECTED und heute niemandem zugeteilt sind |

Es gibt also **keine gemeinsame Funktion** für alle Screens: zwei Quellen (Import-Tagesplan vs. Live-Board-Felder) und vier Regeln.

## Regeln in einfachen Sätzen

- **Belegt (Planungstool):** Zimmer, in dem heute Morgen ein Gast ist: Abreise, Turn, Bleiber. Ein Turn zählt einmal.
- **Zu reinigen (Import-Tagesplan):** dieselben Zimmer. Daher sind im Import „Zu reinigen" und im Planungstool „belegt" gleich groß (bis auf nicht digitalisierte Zimmer, s. u.).
- **Zählt nicht:** reine Anreise in ein leeres Zimmer, leere Zimmer. DND wird nirgends abgezogen (DND ist kein Status, nur ein Signal).
- **Außer Betrieb (OOO/OOS):** zählt im Planungstool, im Import und auf dem Live-Board als belegt bzw. zu reinigen, wenn Opera einen Gast führt; nur der Autoplan nimmt sie heraus.

## Befunde

1. **Stimmt:** Turn wird einmal gezählt; Teilmengen ergeben je Etage und im Haus immer die Gesamtzahl (Test).
2. **Stimmt:** Etage 5 ohne 501–512; 139 Kacheln, 145 laut `roomInventory`. Opera-Zeilen für die 6 nicht digitalisierten Zimmer werden mit Warnung `UNKNOWN_ROOM` übersprungen, sie fehlen in allen Zählern.
3. **Stimmt:** Wäschewechsel alle 3 Tage ab Anreise/letztem Wechsel, nur Bleiber. Zimmerzahl und Credits werden nicht vermischt.
4. **Abweichung zum Prompt:** Der Bleiber-Faktor ist **0,5** (`stayoverFactor`, Bleiber mit Wäschewechsel 1,0), nicht 0,7. Er wirkt nur auf Credits, nie auf die Zimmerzahl.
5. **Unklar / möglicher Fehler:** `Room.status` wird morgens nicht zurückgesetzt (der Import schreibt bewusst keinen Status, die PMS-Anbindung ist ein Stub). Ein Bleiber, der gestern CLEAN/INSPECTED war, steht heute noch so:
   - „… davon gereinigt" (Duty Manager) ist morgens zu hoch.
   - Autoplan/Planungstool lassen solche Zimmer als „schon erledigt" weg → „zu reinigen" kleiner als „belegt".
   - **Mögliche Erklärung für 101 belegt / 90 zu reinigen:** 11 Zimmer mit Status CLEAN/INSPECTED (ohne heutige Zuteilung) oder OOO/OOS/Green-Opt-out. In der Datenbank prüfbar, hier nicht möglich (kein Zugriff auf Preview).
6. **Text stimmt nicht genau:** `planning.staffingExplain` sagt „Bleiber, Abreisen und Anreisen". Gezählt werden aber nur Anreisen, die schon eingecheckt sind (Board: OCCUPIED); reine Anreisen fehlen.
7. **Unterschiedliche Quelle:** Eine schon eingecheckte Frühanreise ist im Tagesplan ARRIVAL (nicht in „zu reinigen"), auf dem Board aber OCCUPIED (im Duty-Manager-„belegt"). Deshalb können Duty Manager und Planungstool bei „belegt" um einige Zimmer auseinanderliegen.
