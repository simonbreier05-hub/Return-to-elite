# Prompt F4 — Planung an Engpasstagen

Du arbeitest im Repo StayClean (`Return-to-elite`). Lies zuerst `CLAUDE.md` (Abschnitte Zuteilungsvorschlag, Planungstool, Credits), `docs/autoplan.md` und in `docs/simulation/Fehlerbericht_Simulation_v2.md` die Befunde **H2**, **H3**, **H11**, **M6**, **M7** und **M8**.

## Ziel

Auch bei Personalmangel landen Suiten, VIP- und Allergiker-Zimmer zuerst bei den erfahrenen Kräften. Wer von Hand umverteilt, sieht Stufe und Warnung. Eine Krankmeldung geht nicht verloren.

## Ausgangslage (geprüft)

- `src/lib/autoplan/cost.ts:76–81`: `eligible()` gibt immer „ja“. Level 1 und Einschränkungen sind nur Strafpunkte (`weights.ts:19–20`, `29`). `CLAUDE.md` nennt die Level-1-Regel einen „Filter“ — Code und Doku widersprechen sich.
- `src/lib/autoplan/result.ts:119–133`: eine Warnung je Zimmer (Tag 3: 38 Zeilen). `:97–101` und `:139–146`: „nicht vor Schichtende fertig“ und „mehr Kräfte als nötig“ rechnen mit verschiedenen Grundlagen.
- Zuteilen von Hand prüft keine Stufe: `src/app/api/rooms/bulk-assign/route.ts`, `rooms/[id]/assign/route.ts`, `src/lib/rooms/moveRoomBetweenAttendants.ts`.
- `src/lib/planung/teamData.ts:92–94`: Team speichern setzt eine heutige Krankmeldung zurück.
- `src/lib/import/readiness.ts:24`: übernommene Vortagsliste gilt wie frisch.
- Simulation Tag 3: Präsidentensuite an Level 1; Level 3 mit 2 großen Suiten; Kraft mit „keine Suiten“ bekam 6.

## Aufgaben

1. **Reihenfolge bei Engpass (H2):** Anspruchsvolle Zimmer (Suite, VIP, Allergiker) werden zuerst auf Stufe 3, dann Stufe 2 verteilt. Level 1 bekommt sie erst, wenn alle Kräfte der Stufe 2/3 ihr Tagesziel plus Toleranz erreicht haben. Gleiches für „keine Suiten“. **Annahme:** weiterhin Warnung, keine Sperre (Regel P6) — nur die Gewichtung wird so stark, dass es praktisch als Letztes passiert. `CLAUDE.md` an den tatsächlichen Stand anpassen.
2. **Umverteilen von Hand (H3):** Die Zuteil-Wege geben Warnungen zurück („Stufe 1 + Suite“, „keine Suiten“, „mehr als 2 Suiten“, „über Tagesziel“). Die Oberfläche zeigt sie vor dem Speichern als Rückfrage. Der Supervisor sieht Stufe und Einschränkung in der Auswahlliste — nur dort, nie für Housekeeper (Allow-List in `tests/autoplan/privacy.test.ts` beachten).
3. **Krankmeldung (H11):** `saveTeam` setzt eine heutige Krankmeldung nicht zurück. Ist eine krank gemeldete Kraft in der Auswahl, fragt die Oberfläche nach („Fatima ist heute krank gemeldet — wieder anwesend?“).
4. **Warnungen (M7):** Im Dialog bündeln je Art mit Zimmernummern („Stufe 1 mit anspruchsvollen Zimmern: Petra 304, 325; Lucia 104 …“). Dieselben Warnungen schon in der Hinweisliste des Entwurfs. „Personal reicht nicht“ dort ganz oben. Rohtext `planungTool.typeEXTERN` übersetzen.
5. **Widerspruch (M6):** „Mehr Kräfte als nötig“ nicht zeigen, wenn gleichzeitig jemand über Schichtende liegt. Gelernte Minuten erst verwenden, wenn genug Messwerte da sind (Schwelle als Einstellung); sonst Standard Credit × Minuten (Regel P1).
6. **Entwurf (M8):** Entwurf und Handzuteilungen bleiben beim Verlassen von `/planung` erhalten. Eine mit „Trotzdem verwenden“ übernommene Liste behält das Kennzeichen „Stand vom …“. Importverlauf des Tages (wer, wann, welche Liste) als kleine Liste.
7. **Wenn Zeit bleibt** (Bericht 3.4): Nr. 2, 3, 4, 8, 11, 12.

## Abnahme

- `tests/simulation/befunde.test.ts`: H11-Fall wird grün (`.fails` entfernen).
- Neuer Test mit dem Tag-3-Szenario (5 Kräfte, 3× Stufe 1, 85 Zimmer): keine Suite bei Stufe 1, solange Stufe 2/3 unter Ziel plus Toleranz liegt.
- Neuer Test: Handzuteilung Suite → Stufe 1 liefert eine Warnung.
- Bestehende Autoplan-Tests grün; Laufzeit des Vorschlags unverändert unter 2 Sekunden.

## Grenzen

- **Annahmen** (Fragen 1 und 2 im Bericht): Warnung statt Sperre; höchstens 2 Suiten; was als Suite zählt. Im Abschlussbericht kennzeichnen.
- Eigener Branch von `design/glass`, z. B. `feature/f4-planung`. `main` und Produktion nie anfassen, **nicht pushen ohne Rückfrage**. Nur lokale Test-Datenbank, nur erfundene Gastdaten.
- Abschlussbericht für Simon in einfacher Sprache, höchstens 20 Zeilen.
