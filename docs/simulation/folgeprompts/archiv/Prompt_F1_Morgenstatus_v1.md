# Prompt F1 — Morgenstatus und Tageszahlen

Du arbeitest im Repo StayClean (`Return-to-elite`). Lies zuerst `CLAUDE.md` (Abschnitt Tagesplan aus dem Import) und in `docs/simulation/Fehlerbericht_Simulation_v2.md` die Befunde **K1**, **K3** und **M5**.

## Ziel

Ein Zimmer, das gestern nicht gereinigt wurde, gilt am nächsten Morgen nie als „geprüft“. Jedes Zimmer, das heute jemandem zugeteilt ist, zählt in allen Zahlen und Listen mit.

## Ausgangslage (geprüft)

- `src/lib/dayplan/boardStatus.ts:24–26`: Ein Zimmer mit Status von gestern gilt als „heute unberührt“. Steht es nicht im heutigen Plan, wird es auf `INSPECTED` gesetzt, auch wenn es `DIRTY`, `IN_PROGRESS`, `CLEAN` (ungeprüft) oder `PICKUP` war.
- `src/lib/dayplan/merge.ts:212–236` (`initRoomStatus`): „schmutzig“ sind nur heutige Abreisen, Turns, Bleiber und In-House-Zimmer.
- `src/lib/dayplan/dayNumbers.ts:49–51`: ohne Art (`kind`) zählt ein Zimmer nie als „zu reinigen“.
- `src/lib/lists/dayRows.ts:129–130`: ohne Tagesplan-Eintrag keine Art und 0 Credits. `src/lib/lists/supervisorList.ts:66` zeigt solche Zimmer nur, wenn sie heute zugeteilt sind.
- In der Simulation: Tag 4, 26 Abreise-Zimmer von gestern standen um 05:31 auf „geprüft“.

## Aufgaben

1. **Morgenstatus:** In `planBoardStatus` darf ein Zimmer nur dann auf `INSPECTED` gehen, wenn sein letzter Status schon „fertig“ war. War es gestern `DIRTY`, `IN_PROGRESS`, `PICKUP`, `BLOCKED` oder `DEFECT_REPORTED`, bleibt es `DIRTY`. War es `CLEAN` (gereinigt, nicht geprüft), bleibt es `CLEAN`.
2. **Sichtbar machen:** Diese Zimmer bekommen im Tagesplan eine eigene Art „Rest vom Vortag“ (Vorschlag: `DayRoomPlan.cleaningType = "CARRYOVER"`, Reinigung wie Abreise, Credits nach Zimmertyp). Sie erscheinen im Zuteilungsvorschlag, in Tageszahlen, Supervisor- und Housekeeper-Liste mit Kennzeichen „seit gestern offen“.
3. **Hinweis:** Beim Import zeigt `/planung` „N Zimmer seit gestern nicht gereinigt“ mit Zimmernummern. Der Duty Manager bekommt dazu eine Meldung (Stufe Warnung).
4. **Zimmer ohne Planeintrag:** Wird ein Zimmer ohne Art heute zugeteilt und ist nicht fertig, zählt es als „zu reinigen“ und trägt Credits nach Zimmertyp (K3). Keine nackten Nummern mit 0 Credits mehr.
5. **Zahlen (M5):** Liste alle Stellen auf, die Zimmer zählen (`dayNumbers.ts`, `src/lib/dayplan/glance.ts`, Übergabe, Board, Grundriss). Wo dieselbe Zahl gemeint ist, dieselbe Funktion verwenden; wo Verschiedenes gemeint ist, die Beschriftung eindeutig machen (z. B. „gereinigt“ gegen „freigegeben“). Ergebnis als kurze Tabelle in den Abschlussbericht.

## Abnahme

- `tests/simulation/befunde.test.ts`: K1- und K3-Fall werden grün (`.fails` entfernen).
- `tests/dayplanMerge.integration.test.ts` um den Fall „gestern DIRTY, heute nicht im Plan“ erweitern.
- Bestehende Regel bleibt: heute schon bearbeitete und gesperrte Zimmer fasst der Morgenstatus nicht an; ein Nachimport am selben Tag überschreibt keine Arbeit.
- `npm test` grün.

## Grenzen

- **Annahme, vom Hotel nicht bestätigt:** „Rest vom Vortag bleibt schmutzig und steht zuoberst im Plan“ (Frage 3 im Bericht). Im Abschlussbericht so kennzeichnen.
- Neue Spalte oder neuer Wert im Schema: beide Dateien `prisma/schema.prisma` und `prisma/schema.postgres.prisma` gleich halten; `db push` nur lokal.
- Eigener Branch von `design/glass`, z. B. `feature/f1-morgenstatus`. `main` und Produktion nie anfassen, **nicht pushen ohne Rückfrage**. Nur lokale Test-Datenbank, nur erfundene Gastdaten.
- Abschlussbericht für Simon in einfacher Sprache, höchstens 20 Zeilen.
