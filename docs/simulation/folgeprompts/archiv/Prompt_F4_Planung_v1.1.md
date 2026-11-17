# Prompt F4 — Planung an Engpasstagen (v1.1, 16.11.2026)

Du arbeitest im Repo StayClean (`Return-to-elite`). Lies zuerst `CLAUDE.md` (Abschnitte Zuteilungsvorschlag, Planungstool, Credits), `docs/autoplan.md` und in `docs/simulation/Fehlerbericht_Simulation_v2.md` die Befunde **H2**, **H3**, **H11**, **M6**, **M7** und **M8**.

## Entscheidungen (16.11.2026)

- **Level 1 (P6 neu):** Der Zuteilungsvorschlag gibt Level 1 **nie** Suite, VIP, Allergiker oder Zimmer mit vielen Traces. Von Hand zuteilen bleibt erlaubt, mit Warnung.
- **Suiten (P4):** höchstens 2 je Kraft, **Junior Suite zählt mit**. Reicht das Personal nicht: Suiten so gleichmäßig verteilen, dass die höchste Suitenzahl je Kraft so klein wie möglich ist.
- **Krankmeldung (P11):** keine Rückfrage; der DM wird direkt benachrichtigt (Meldung in F5) und passt den Plan von Hand an.
- **Präferenz-Etagen (P5):** pflegt nur der DM; Supervisor sieht sie nur.

## Ziel

Auch bei Personalmangel landen Suiten, VIP- und Allergiker-Zimmer zuerst bei den erfahrenen Kräften. Wer von Hand umverteilt, sieht Stufe und Warnung. Eine Krankmeldung geht nicht verloren.

## SCHRITT 0 — Ist-Abgleich (keine Codeänderung, Bericht max. 40 Zeilen)

1. Remote-Stand prüfen: `git ls-remote origin`, `git fetch` mit expliziten Refspecs, `git log --oneline A..B | wc -l`. Ist `design/glass` noch die richtige Basis? Welche früheren Fix-Pakete (siehe `00_Reihenfolge.md`) sind schon gemergt?
2. Jede Datei:Zeile-Angabe unten gegen den aktuellen Code prüfen; Abweichungen auflisten.
3. Lies `docs/simulation/Entscheidungen_Hotel_Simulation_v2_2026-11-16.md`. Die dortigen Entscheidungen gehen den Regeln im Fehlerbericht und in diesem Prompt vor. Widersprüche sofort melden.
4. Geplante Schema-Änderungen nennen (additiv, beide Prisma-Dateien).
**STOPP:** Bericht schicken, auf OK von Simon warten.

## Ausgangslage (geprüft)

- `src/lib/autoplan/cost.ts:76–81`: `eligible()` gibt immer „ja“. Level 1 und Einschränkungen sind nur Strafpunkte (`weights.ts:19–20`, `29`). `CLAUDE.md` nennt die Level-1-Regel einen „Filter“ — Code und Doku widersprechen sich.
- `src/lib/autoplan/result.ts:119–133`: eine Warnung je Zimmer (Tag 3: 38 Zeilen). `:97–101` und `:139–146`: „nicht vor Schichtende fertig“ und „mehr Kräfte als nötig“ rechnen mit verschiedenen Grundlagen.
- Zuteilen von Hand prüft keine Stufe: `src/app/api/rooms/bulk-assign/route.ts`, `rooms/[id]/assign/route.ts`, `src/lib/rooms/moveRoomBetweenAttendants.ts`.
- `src/lib/planung/teamData.ts:92–94`: Team speichern setzt eine heutige Krankmeldung zurück.
- `src/lib/import/readiness.ts:24`: übernommene Vortagsliste gilt wie frisch.
- Simulation Tag 3: Präsidentensuite an Level 1; Level 3 mit 2 großen Suiten; Kraft mit „keine Suiten“ bekam 6.

## Aufgaben

1. **Harter Filter im Vorschlag (H2, entschieden):** `eligible()` schließt Level 1 für Suite (inkl. Junior Suite), VIP, Allergiker und viele Traces aus; ebenso Kräfte mit Einschränkung „keine Suiten“ für Suiten (**Annahme**, gleiche Logik). Anspruchsvolle Zimmer gehen zuerst an Stufe 3, dann Stufe 2. Ist niemand passend frei, bleibt das Zimmer im Vorschlag **unzugeteilt** und erscheint oben in den Hinweisen („3 anspruchsvolle Zimmer ohne passende Kraft — bitte von Hand zuteilen“). Schritt 0: Liste der Kategorien mit Kennzeichen „Suite“ (XJS = Junior Suite zählt; XCL, XGS, XDL/XAS, XPS prüfen) an Simon. `CLAUDE.md` an den Stand anpassen.
1b. **Suiten gleichmäßig (P4):** max. 2 je Kraft (weich, Warnung); bei Engpass die höchste Suitenzahl je Kraft minimieren statt einzelne Kräfte zu füllen.
2. **Umverteilen von Hand (H3):** Die Zuteil-Wege geben Warnungen zurück („Stufe 1 + Suite“, „keine Suiten“, „mehr als 2 Suiten“, „über Tagesziel“). Die Oberfläche zeigt sie vor dem Speichern als Rückfrage. Der Supervisor sieht Stufe und Einschränkung in der Auswahlliste — nur dort, nie für Housekeeper (Allow-List in `tests/autoplan/privacy.test.ts` beachten).
3. **Krankmeldung (H11):** `saveTeam` setzt eine heutige Krankmeldung nicht zurück; die Kraft bleibt sichtbar „krank“ und bekommt keine neuen Zimmer. Keine Rückfrage (entschieden). Nur DM/Supervisor können die Krankmeldung aktiv zurücknehmen.
3b. **Präferenz-Etagen nur DM (Frage 12):** Bearbeiten nur im DM-Bildschirm; Supervisor sieht sie nur lesend; Server-Route lehnt Supervisor ab (403). Test ergänzen.
4. **Warnungen (M7):** Im Dialog bündeln je Art mit Zimmernummern („Stufe 1 mit anspruchsvollen Zimmern: Petra 304, 325; Lucia 104 …“). Dieselben Warnungen schon in der Hinweisliste des Entwurfs. „Personal reicht nicht“ dort ganz oben. Rohtext `planungTool.typeEXTERN` übersetzen.
5. **Widerspruch (M6):** „Mehr Kräfte als nötig“ nicht zeigen, wenn gleichzeitig jemand über Schichtende liegt. Gelernte Minuten erst verwenden, wenn genug Messwerte da sind (Schwelle als Einstellung); sonst Standard Credit × Minuten (Regel P1).
6. **Entwurf (M8):** Entwurf und Handzuteilungen bleiben beim Verlassen von `/planung` erhalten. Eine mit „Trotzdem verwenden“ übernommene Liste behält das Kennzeichen „Stand vom …“. Importverlauf des Tages (wer, wann, welche Liste) als kleine Liste.
7. **Wenn Zeit bleibt** (Bericht 3.4): Nr. 2, 3, 4, 8, 11, 12.

## Abnahme

- `tests/simulation/befunde.test.ts`: H11-Fall wird grün (`.fails` entfernen).
- Neuer Test mit dem Tag-3-Szenario (5 Kräfte, 3× Stufe 1, 85 Zimmer): **keine** Suite/VIP/Allergiker bei Stufe 1 im Vorschlag; nicht deckbare Zimmer bleiben unzugeteilt mit Hinweis; höchste Suitenzahl je Kraft minimal.
- Neuer Test: Supervisor kann Präferenz-Etagen nicht ändern (403).
- Neuer Test: Handzuteilung Suite → Stufe 1 liefert eine Warnung.
- Bestehende Autoplan-Tests grün; Laufzeit des Vorschlags unverändert unter 2 Sekunden.

## Grenzen

- Fragen 1, 2, 9, 12 entschieden. **Weiter Annahme:** „keine Suiten“ als harter Filter im Vorschlag. Im Abschlussbericht kennzeichnen.
- Eigener Branch von `design/glass`, z. B. `feature/f4-planung`. `main` und Produktion nie anfassen, **nicht pushen ohne Rückfrage**. Nur lokale Test-Datenbank, nur erfundene Gastdaten.
- Abschlussbericht für Simon in einfacher Sprache, höchstens 20 Zeilen.
