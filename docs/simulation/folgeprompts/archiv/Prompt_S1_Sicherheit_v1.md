# Prompt S1 — Sicherheit: Live-Kanal und Gastcode

Du arbeitest im Repo StayClean (`Return-to-elite`). Lies zuerst `CLAUDE.md` und in `docs/simulation/Fehlerbericht_Simulation_v2.md` die Befunde **K2** und **H1**.

## Ziel

Der Live-Kanal (Socket.IO, die Verbindung, über die Bildschirme sich sofort aktualisieren) liefert nur noch an angemeldete Mitarbeiter, und nur das, was deren Rolle sehen darf. Gastnamen und Gastcodes laufen nie mehr an alle.

## Ausgangslage (geprüft)

- `server.js:29–39`: Jede Verbindung wird angenommen, ohne Anmeldung.
- `src/lib/realtime.ts:33–36`: `broadcast()` sendet mit `io.emit` an alle. `emitTo()` und `joinChatRooms()` (Zeile 43–62) zeigen bereits das Muster „Raum nur nach Prüfung der Sitzung“.
- Gastname: `src/app/api/arrivals/route.ts:66`, `src/app/api/arrivals/[id]/route.ts:45`.
- Gastcode: ganzer Zimmer-Datensatz samt `guestAccessCode` in `src/lib/rooms/applyStatusChange.ts:188` und allen anderen `broadcast("room:update", …)`.
- Standort der Kraft mit Namen: `applyStatusChange.ts:152`. Notiztext: `src/lib/rooms/addRoomNote.ts:35`.
- Gastcode entsteht erst beim Öffnen der Code-Seite: `src/app/api/rooms/guest-access/route.ts:27`.

## Aufgaben

1. **Anmeldung am Kanal:** In `server.js` beim Verbindungsaufbau das Sitzungs-Cookie prüfen (gleiche Prüfung wie `src/lib/auth.ts`). Ohne gültige Sitzung: Verbindung ablehnen. Rolle und Nutzer am Socket merken, Socket in Räume `role:<rolle>` und `user:<id>` setzen.
2. **Kein `io.emit` mehr:** `broadcast()` so umbauen, dass jedes Ereignis nur an die Rollen geht, die es brauchen. Lege dafür eine Tabelle „Ereignis → Rollen“ in `realtime.ts` an. Housekeeper, Hausmann, Techniker und Concierge bekommen nie Gastnamen.
3. **Schlanke Nutzlast:** `room:update` ohne `guestAccessCode`. `arrival:update` ohne Gastnamen (Bildschirme laden die Details über die bestehende, geschützte API nach). `note:new` ohne Text.
4. **Gastcodes vorab:** Codes für alle Zimmer beim Seed und beim Zimmerlisten-Abgleich erzeugen (`ensureRoomAccessCode`), nicht erst beim Öffnen der Seite.
5. **Gastbildschirm:** bleibt beim Abfragen von `/status` (siehe `CLAUDE.md`), nie am Live-Kanal.
6. **Prüfen:** Mit `scripts/simulation/` gibt es einen Mitschnitt des Kanals ohne Anmeldung (`messen.mjs`, Abschnitt Datenschutz). Nach dem Umbau muss er leer bleiben.

## Abnahme

- `tests/simulation/befunde.test.ts`: die zwei K2-Fälle werden grün (`.fails` entfernen).
- Neuer Test: Verbindung ohne Cookie wird abgelehnt; Housekeeper-Socket erhält kein Ereignis mit `guestName` oder `guestAccessCode`.
- `npm test` grün. Alle Bildschirme aktualisieren sich weiter live (Stichprobe mit `tests/e2e/`).

## Grenzen

- Eigener Branch von `design/glass`, z. B. `feature/s1-live-kanal`. `main` und Produktion nie anfassen, kein Force-Push, **nicht pushen ohne Rückfrage**.
- Nur lokale Test-Datenbank, nur erfundene Gastdaten.
- Kein Umbau der Gast-Anmeldung (Code im Zimmer bleibt). Ob der Code allein reicht, ist eine offene rechtliche Frage (Bericht Abschnitt 7) — im Abschlussbericht als „Annahme, offen“ nennen.
- Abschlussbericht für Simon in einfacher Sprache, höchstens 20 Zeilen.
