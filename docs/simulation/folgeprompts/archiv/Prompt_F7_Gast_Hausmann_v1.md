# Prompt F7 — Gastbildschirm, Hausmann, Concierge

Du arbeitest im Repo StayClean (`Return-to-elite`). Lies zuerst `CLAUDE.md` (Abschnitte Guest access, Guest screen, DSGVO retention), `docs/guest-api.md` und in `docs/simulation/Fehlerbericht_Simulation_v2.md` die Befunde **H13**, **H16**, **M10**, **M14**, **M15**, **M18**, **M21** und **M24**.

## Ausgangslage (geprüft)

- Offene Team-Notizen ohne Bezug zum Aufenthalt: `src/lib/lists/dayRows.ts:103`. Gastwünsche ohne Datum: `dayRows.ts:106`, `120`. Schließen nur von Hand: `src/app/api/guest-requests/[id]/route.ts:42`.
- Gaststatus liest nur `GuestRequest.status`: `src/lib/guestStatusFeed.ts:63–69`. Fertigmelden schreibt ihn nicht fort.
- Gastsprachen: `src/lib/guestI18n/translations.ts:12` (nur de, en); Rückfall auf Deutsch in `GuestLocaleContext.tsx:30`.
- Hausmann-Liste nur mit heutigem Datum: `src/lib/lists/housemanList.ts:42`. Offene Aufgaben ohne Tagesbezug: `src/app/api/roomtasks/route.ts:19`. Wiederkehrende Aufgabe legt je Fälligkeit eine neue an: `src/lib/houseman/recurring.ts:21–28`.
- Ausflüge: nur Anlegen (`src/app/api/excursions/route.ts`).

## Aufgaben

### Altlasten (H13)

1. Beim Check-out (und beim Zimmerwechsel aus F3) werden offene Gastwünsche des Aufenthalts geschlossen und offene Team-Notizen zum Zimmer als „vom Vorgast“ abgelegt — sie erscheinen beim nächsten Gast nicht mehr.
2. Ein Reinigungswunsch („jetzt“, „ab 13 Uhr“) gilt nur für den Tag, an dem er gestellt wurde.
3. Notizen und Wünsche, die nicht von heute sind, tragen ein Datum.

### Gastbildschirm

4. **Status (M10):** Wird das Zimmer fertig gemeldet, geht ein offener Reinigungswunsch auf „Erledigt“. Beim Start auf „In Bearbeitung“. Bei Mängeln zeigt der Gast „Behoben“.
5. **Sprache (M14, Annahme B12):** Gastsprachen erweitern. **Annahme:** fr, es, it, zh, ar zusätzlich (Frage 11 im Bericht). Die Sprache des Aufenthalts wird auch mit Regionskürzel erkannt („en-US“ → en). Vor dem Check-in gilt die Browsersprache.
6. **Textlänge (M18):** Stelle den Befund zuerst nach (Gast sendet 6000 Zeichen). Laut Code sind Notizen auf 2000 begrenzt. Wenn ein Feld ohne Grenze existiert: begrenzen, mit Zähler und deutscher/englischer Fehlermeldung. Wenn nicht nachstellbar: im Abschlussbericht als „nicht bestätigt“ schließen.
7. **Hinweise:** Bei „Bitte nicht stören“ der Satz „Ihr Zimmer wird heute nicht gereinigt, bis Sie es aufheben“. Green Option am selben Tag zurücknehmbar.

### Hausmann (Annahme B7)

8. **Aufgaben vom Vortag (H16):** Offene Hausmann-Aufgaben für Gäste, die im Haus sind, bleiben in der Liste, bis sie erledigt sind, mit Kennzeichen „seit …“.
9. **Doppelte (M15):** Ist die wiederkehrende Aufgabe vom letzten Mal noch offen, wird keine zweite angelegt; die offene bekommt „überfällig seit …“.
10. **Einmal-Aufgabe** mit Datum. **Mehrfach-Erledigt.** Kennzeichen „Gast noch im Zimmer“ beim Twin-Rückbau, mit Rückfrage vor dem Erledigen.
11. **Opera-Hinweise (M21):** Technik-Hinweise erscheinen beim Techniker als Auftrag. „cleaning after HH:MM“ im Opera-Hinweis zählt wie der Gastwunsch „Reinigung ab“ (Regel P9).

### Concierge (M24, Annahme B11)

12. Ausflug bearbeiten und löschen (nur eigener Eintrag, Logbuch). Die Zeile zeigt den Reinigungsstand des Zimmers (nur Status, keine Namen von Kräften). Nachricht an die Abteilung Housekeeping möglich.

## Abnahme

- `tests/simulation/befunde.test.ts`: M14-Fall wird grün (`.fails` entfernen; die Liste der Sprachen im Test an die Entscheidung des Hotels anpassen).
- Neue Tests: Gastwunsch von gestern setzt keine Priorität; Notiz des Vorgasts erscheint nach Check-out nicht in der Liste; Hausmann-Aufgabe vom Vortag erscheint; keine doppelte wiederkehrende Aufgabe; Gaststatus nach Fertigmelden „Erledigt“.
- `tests/guestI18n.test.ts`: jede neue Sprache hat alle Schlüssel.
- Nachtlöschung und Aufbewahrung unverändert wirksam (`tests/guestDataPurge.integration.test.ts`).
- `npm test` grün.

## Grenzen

- Der Gastbildschirm bleibt beim Abfragen von `/status` und abonniert nie den Live-Kanal (`CLAUDE.md`).
- Übersetzungen für den Gastbildschirm bitte als „maschinell, vor dem Pilot von Muttersprachlern gegenlesen“ kennzeichnen.
- **Annahmen** (Fragen 11 und 14 im Bericht) im Abschlussbericht nennen.
- Eigener Branch von `design/glass`, z. B. `feature/f7-gast-hausmann`. `main` und Produktion nie anfassen, **nicht pushen ohne Rückfrage**. Nur lokale Test-Datenbank, nur erfundene Gastdaten.
- Abschlussbericht für Simon in einfacher Sprache, höchstens 20 Zeilen.
