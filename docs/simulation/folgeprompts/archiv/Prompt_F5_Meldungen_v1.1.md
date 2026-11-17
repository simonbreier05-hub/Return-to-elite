# Prompt F5 — Meldungen (Übergabe zurückgestellt) (v1.1, 16.11.2026)

Du arbeitest im Repo StayClean (`Return-to-elite`). Lies zuerst `CLAUDE.md`, `docs/benachrichtigungen.md` und in `docs/simulation/Fehlerbericht_Simulation_v2.md` die Befunde **H14**, **M2**, **M9** und **M16**. **H15 (Übergabe) ist zurückgestellt** (Entscheidung 16.11.) und wird hier nicht bearbeitet.

Voraussetzung: Pakete F2 (Sperren) und F3 (Zimmerwechsel) sind gemergt. Falls nicht, die betroffenen Punkte auslassen und im Abschlussbericht nennen.

## Ziel

Der Duty Manager erfährt sofort, was den Tag gefährdet. Die Glocke bleibt lesbar. Alle Meldungen sind übersetzt.

## SCHRITT 0 — Ist-Abgleich (keine Codeänderung, Bericht max. 40 Zeilen)

1. Remote-Stand prüfen: `git ls-remote origin`, `git fetch` mit expliziten Refspecs, `git log --oneline A..B | wc -l`. Ist `design/glass` noch die richtige Basis? Welche früheren Fix-Pakete (siehe `00_Reihenfolge.md`) sind schon gemergt?
2. Jede Datei:Zeile-Angabe unten gegen den aktuellen Code prüfen; Abweichungen auflisten.
3. Lies `docs/simulation/Entscheidungen_Hotel_Simulation_v2_2026-11-16.md`. Die dortigen Entscheidungen gehen den Regeln im Fehlerbericht und in diesem Prompt vor. Widersprüche sofort melden.
4. Geplante Schema-Änderungen nennen (additiv, beide Prisma-Dateien).
**STOPP:** Bericht schicken, auf OK von Simon warten.

## Ausgangslage (geprüft)

- `src/app/api/notifications/route.ts:28`: höchstens 50 Meldungen, ohne Filter. In der Simulation bis zu 128 Check-out-Meldungen an einem Tag.
- Krankmeldung erzeugt keine Meldung: `src/lib/autoplan/service.ts:267–280`.
- Englische Meldungstexte fest im Code, z. B. `src/lib/rooms/applyStatusChange.ts:175`, `src/lib/escalations.ts:58`, `148`, `src/lib/guestActions.ts:76`, `112`.
- Übergabe: `src/lib/handover/generate.ts:48–62`, `70–78` (englischer Text), `src/lib/handover/collectFacts.ts` (keine Krankmeldung, kein Zimmerwechsel, keine Sperrgründe), Menü nur beim Supervisor (`src/lib/nav.ts:45`, `50–56`).

## Aufgaben

1. **Meldungen an den Duty Manager (H14)**, alle mit Ton und Pop-up, ohne Gastnamen:
   - Krankmeldung („Sena krank gemeldet, 12 Zimmer offen“) — **immer direkt an den DM** (entschieden, Frage 9), keine Rückfrage. Supervisoren der betroffenen Etagen: **Annahme**, ebenfalls informieren.
   - Personal reicht nicht (nach Krankmeldung neu rechnen).
   - „Fortschritt hinter Plan“: Restzeit der offenen Zimmer größer als Restkapazität bis Schichtende; höchstens einmal je Stunde.
   - VIP-Anreise verspätet freigegeben.
   - Sperre, „Mangel behoben“, Zimmerwechsel und Late-Check-out-Konflikt kommen aus F2/F3 — hier nur prüfen, dass sie bei Supervisor und DM als dringend ankommen.
2. **Glocke (M2):** Seitenweise laden statt Deckel 50. Filter „dringend / alle“. Gleichartige Routine bündeln („28 Zimmer ausgecheckt“, aufklappbar). Datum bei Meldungen, die nicht von heute sind. „Alte schließen“ für alles vor heute.
3. **Sprache (M9):** Alle Meldungen über `keyed(...)` und die Übersetzung; der feste Text im Feld `message` wird deutsch. Suche nach verbliebenen englischen Sätzen in `src/lib` und `src/app/api` und liste sie im Abschlussbericht.
4. **Rückstau-Alarm:** erst ab Arbeitsbeginn (Einstellung), mit aktueller Zahl, deutsch.
5. **Übergabe:** zurückgestellt. Nicht anfassen; nur Übergabe-Texte in die Liste der englischen Sätze (Aufgabe 3) aufnehmen.
6. **Nachrichten (M16, Annahme B10):** Lesebestätigung mit Namen („gelesen: 5 von 13“ aufklappbar) für den Absender; Datum im Chat; Abteilungsnachricht mit Pop-up und Ton bei allen Empfängern.
7. **Wenn Zeit bleibt** (Bericht 3.4): Nr. 5 und 9.

## Abnahme

- `tests/simulation/befunde.test.ts`: M2-Fall wird grün (`.fails` entfernen).
- Neue Tests: Krankmeldung erzeugt eine Meldung an den Duty Manager; Glocke lädt seitenweise und bündelt Routine.
- Kein Gastname in Meldungen und im Logbuch (bestehender Scan-Test bleibt grün).
- `npm test` grün.

## Grenzen

- Frage 9 entschieden (DM direkt). Frage 10 zurückgestellt. **Weiter Annahme:** Supervisoren bekommen Krankmeldung auch. Kennzeichnen.
- Mitarbeiternamen in Meldungen nur für Supervisor und Duty Manager.
- Eigener Branch von `design/glass`, z. B. `feature/f5-meldungen`. `main` und Produktion nie anfassen, **nicht pushen ohne Rückfrage**. Nur lokale Test-Datenbank, nur erfundene Gastdaten.
- Abschlussbericht für Simon in einfacher Sprache, höchstens 20 Zeilen.
