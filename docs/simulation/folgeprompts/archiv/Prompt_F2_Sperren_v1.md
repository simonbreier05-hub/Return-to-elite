# Prompt F2 — Sperren („außer Betrieb“, „nicht im Service“)

Du arbeitest im Repo StayClean (`Return-to-elite`). Lies zuerst `CLAUDE.md` und in `docs/simulation/Fehlerbericht_Simulation_v2.md` die Befunde **H4**, **H5**, **H6** und **M4**.

## Ziel

Jede Sperre hat einen Grund und ein Ende, ist für Duty Manager, Supervisor und Front Office sichtbar und lässt sich mit einem Knopf aufheben. Ein belegtes Zimmer wird nicht still gesperrt.

## Ausgangslage (geprüft)

- `Room.oooUntil` (`prisma/schema.prisma:97`) wird nur angezeigt, nie ausgewertet. `src/lib/escalations.ts` kennt das Feld nicht.
- `src/lib/dayplan/boardStatus.ts:16`: Der Morgenstatus lässt `OUT_OF_ORDER` und `OUT_OF_SERVICE` bewusst stehen. Das ist richtig, braucht aber ein eigenes Ende.
- `src/lib/rooms/applyStatusChange.ts:108–119`: Für `OUT_OF_ORDER` wird nur ein Enddatum verlangt. Keine Prüfung der Belegung, kein Grund, keine Meldung. `OUT_OF_SERVICE` hat weder Grund noch Ende.
- `src/lib/stateMachine.ts:29–30`: zurück geht nur nach `DIRTY`; `:51`: der Techniker darf sperren.
- `src/app/api/workorders/[id]/route.ts:19`, `71–102`: „Erledigt“ ohne Notiz möglich; das Zimmer bleibt gesperrt.
- In der Simulation: 322 seit Tag 3 gesperrt, an Tag 5 Anreise 18:25 ohne Warnung; 426 zwei Tage „nicht im Service“ mit Bleiber.

## Aufgaben

1. **Grund:** Neues Pflichtfeld „Sperrgrund“ (kurzer Text, keine Gastdaten) für beide Sperr-Arten. Anzeige im Zimmerfenster aller Rollen, die das Zimmer sehen dürfen.
2. **Ende:** Der Minutentakt (`runEscalations`) prüft abgelaufene `oooUntil`. **Annahme:** Die Sperre endet nicht von selbst, sondern erzeugt eine Meldung „Sperre 322 abgelaufen — wieder in Betrieb?“ an Supervisor der Etage und Duty Manager, einmal je Ablauf, danach täglich morgens. „Nicht im Service“ gilt nur für den Betriebstag und fällt beim nächsten Morgenstatus zurück auf „schmutzig“.
3. **Wieder in Betrieb:** Sichtbarer Knopf im Zimmerfenster für Supervisor und Duty Manager (setzt `DIRTY`, schreibt Logbuch). Der Techniker bekommt nach „Erledigt“ die Frage „Zimmer wieder in Betrieb?“; sein Ja geht als Vorschlag an den Supervisor.
4. **Belegtes Zimmer:** Sperrt jemand ein Zimmer mit `occupancy = OCCUPIED` oder mit Anreise heute, kommt eine Rückfrage mit Klartext. Nach Bestätigung geht eine dringende Meldung an Front Office und Duty Manager (nur Zimmer, Grund, Dauer).
5. **Sichtbarkeit:** Kachel „Gesperrte Zimmer“ auf den Startseiten von Duty Manager, Supervisor und Front Office: Zimmer, Art, Grund, bis wann, „Gast im Zimmer“ / „Anreise heute“. Gesperrte Zimmer im Grundriss farblich erkennbar. Sperren zählen in den Tageszahlen als eigene Zahl (ist in `dayNumbers.ts` `notCleaned` schon angelegt — überall anzeigen).
6. **Planung:** Der Zuteilungsvorschlag und der Bestätigungsdialog warnen bei „Anreise in gesperrtes Zimmer“.
7. **Techniker (M4, Annahme B8):** „Erledigt“ nur mit Notiz (Pflichtfeld im Dialog und serverseitig). Techniker kann ein Zimmer auch ohne Auftrag über die Oberfläche sperren.

## Abnahme

- `tests/simulation/befunde.test.ts`: H4-Fall wird grün (`.fails` entfernen).
- Neue Tests: abgelaufene Sperre erzeugt genau eine Meldung; Sperren eines belegten Zimmers ohne Bestätigung wird abgelehnt (409); „Erledigt“ ohne Notiz wird abgelehnt (400).
- `npm test` grün. Kein Gastname in den neuen Meldungen.

## Grenzen

- **Annahmen, vom Hotel nicht bestätigt** (Frage 4 im Bericht): Sperre endet nicht automatisch; wer aufheben darf; wer informiert wird. Im Abschlussbericht kennzeichnen.
- Schema-Änderungen in beiden Prisma-Dateien; `db push` nur lokal.
- Eigener Branch von `design/glass`, z. B. `feature/f2-sperren`. `main` und Produktion nie anfassen, **nicht pushen ohne Rückfrage**. Nur lokale Test-Datenbank, nur erfundene Gastdaten.
- Neue Texte deutsch und englisch über die bestehende Übersetzung (`src/lib/i18n/`), Meldungen mit `keyed(...)`.
- Abschlussbericht für Simon in einfacher Sprache, höchstens 20 Zeilen.
