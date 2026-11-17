# Prompt F1 — Morgenstatus und Tageszahlen (v1.2, 16.11.2026)

> **Start im Terminal:** im Ordner `Return-to-elite` `claude` starten (Modell mit `/model` wählen) und eingeben:
> `Lies docs/simulation/folgeprompts/Prompt_F1_Morgenstatus_v1.2.md vollständig und arbeite ihn ab. Beginne mit Schritt 0.`

Du arbeitest im Repo StayClean (`Return-to-elite`). Lies zuerst `CLAUDE.md` (Abschnitt Tagesplan aus dem Import) und in `docs/simulation/Fehlerbericht_Simulation_v2.md` die Befunde **K1**, **K3** und **M5**.

## Ziel

Ein Zimmer, das gestern nicht gereinigt wurde, gilt am nächsten Morgen nie als „geprüft“. Jedes Zimmer, das heute jemandem zugeteilt ist, zählt in allen Zahlen und Listen mit.

## SCHRITT 0 — Ist-Abgleich (keine Codeänderung, Bericht max. 40 Zeilen)

1. Basis prüfen: `git status` muss sauber sein. Der lokale Branch `fix/basis-simulation-v2` muss existieren — sonst STOPP und auf `docs/simulation/folgeprompts/START.md` verweisen. `git ls-remote origin`, `git fetch origin` mit expliziten Refspecs, dann `git log --oneline fix/basis-simulation-v2..design/glass | wc -l` (gibt es neue Commits auf `design/glass`? dann melden). Welche Fix-Pakete sind schon in `fix/basis-simulation-v2` gemergt (`git log --oneline --merges fix/basis-simulation-v2`, Abgleich mit `00_Reihenfolge_v1.2.md`)? Ist das vorige Paket laut Reihenfolge noch nicht gemergt: melden.
2. Jede Datei:Zeile-Angabe unten gegen den aktuellen Code prüfen; Abweichungen auflisten.
3. Lies `docs/simulation/Entscheidungen_Hotel_Simulation_v2_2026-11-16.md`. Die dortigen Entscheidungen gehen den Regeln im Fehlerbericht und in diesem Prompt vor. Widersprüche sofort melden.
4. Geplante Schema-Änderungen nennen (additiv, beide Prisma-Dateien).
**STOPP:** Bericht schicken, auf OK von Simon warten.

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

- **Vom Hotel entschieden (Frage 3):** Rest vom Vortag bleibt schmutzig, ist sichtbar gekennzeichnet, steht oben im Plan und wird mit verplant; der DM bekommt einen Hinweis.
- Neue Spalte oder neuer Wert im Schema: beide Dateien `prisma/schema.prisma` und `prisma/schema.postgres.prisma` gleich halten; `db push` nur lokal.
- Eigener Branch von `fix/basis-simulation-v2`, z. B. `feature/f1-morgenstatus`. `main`, `design/glass` und Produktion nie anfassen, kein Force-Push, **nicht pushen ohne Rückfrage**. Nur lokale Test-Datenbank, nur erfundene Gastdaten.
- Abschlussbericht für Simon in einfacher Sprache, höchstens 20 Zeilen.

## Abschluss

- Nach dem OK zu Schritt 0: `git switch -c <Branch aus „Grenzen“> fix/basis-simulation-v2`.
- `npm test` und `npm run build` grün. In `tests/simulation/befunde.test.ts` das `.fails` der behobenen Befunde entfernen.
- `CLAUDE.md` ergänzen (höchstens 5 Zeilen, was sich an Regeln/Abläufen geändert hat).
- Commit(s) auf dem Feature-Branch. **Nicht pushen ohne Rückfrage.**
- Abschlussbericht für Simon in einfacher Sprache (siehe „Grenzen“) mit Abnahme-Checkliste für das iPad.
- Erst nach Simons ausdrücklichem OK: `git switch fix/basis-simulation-v2 && git merge --no-ff <Branch>`. Danach `00_Reihenfolge_v1.2.md`: Paket als „gemergt“ markieren, und im Fehlerbericht den Status der Befunde auf „behoben“ setzen.
