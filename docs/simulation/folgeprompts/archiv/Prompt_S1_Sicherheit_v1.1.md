# Prompt S1 — Sicherheit: Live-Kanal und Gastcode (v1.1, 16.11.2026)

Du arbeitest im Repo StayClean (`Return-to-elite`). Lies zuerst `CLAUDE.md` und in `docs/simulation/Fehlerbericht_Simulation_v2.md` die Befunde **K2** und **H1**.

## Entscheidungen (16.11.2026)

- Die App lief nie mit echten Gastdaten. Mit echten Daten ist sie nur mit Login nutzbar (Gastbildschirm ausgenommen, siehe unten).
- Jedes Zimmer hat einen **festen QR-Code**. Der Gastbereich ist an den Aufenthalt aus dem Opera-Import gekoppelt; der Gast sieht „Anrede Titel Nachname“.
- Nach Check-out wird der Verlauf des Zimmers gespeichert und der Gastbereich zurückgesetzt.

## Ziel

Der Live-Kanal (Socket.IO, die Verbindung, über die Bildschirme sich sofort aktualisieren) liefert nur noch an angemeldete Mitarbeiter, und nur das, was deren Rolle sehen darf. Gastnamen und Gastcodes laufen nie mehr an alle.

## SCHRITT 0 — Ist-Abgleich (keine Codeänderung, Bericht max. 40 Zeilen)

1. Remote-Stand prüfen: `git ls-remote origin`, `git fetch` mit expliziten Refspecs, `git log --oneline A..B | wc -l`. Ist `design/glass` noch die richtige Basis? Welche früheren Fix-Pakete (siehe `00_Reihenfolge.md`) sind schon gemergt?
2. Jede Datei:Zeile-Angabe unten gegen den aktuellen Code prüfen; Abweichungen auflisten.
3. Lies `docs/simulation/Entscheidungen_Hotel_Simulation_v2_2026-11-16.md`. Die dortigen Entscheidungen gehen den Regeln im Fehlerbericht und in diesem Prompt vor. Widersprüche sofort melden.
4. Geplante Schema-Änderungen nennen (additiv, beide Prisma-Dateien).
**STOPP:** Bericht schicken, auf OK von Simon warten.

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
5. **Gastzugang an den Aufenthalt binden (H1):** Der feste Code identifiziert nur das Zimmer. Anfragen (Wünsche, Mängel, DND, Green Option) werden nur angenommen, wenn für das Zimmer gerade ein Aufenthalt „im Haus“ besteht (Check-in erfolgt bzw. Anreise heute laut Import und nicht ausgecheckt). Nach Check-out oder Zimmerwechsel: der Gastbildschirm zeigt eine neutrale Willkommensseite ohne Namen und nimmt nichts an, bis zum nächsten Check-in. Einfache Drosselung je Code (z. B. max. 20 Anfragen/Stunde). Prüfe dabei den roten Test `tests/guestServer.test.ts` („Link vor dem Anreisetag ungültig“) und behebe ihn.
6. **Gastbildschirm:** bleibt beim Abfragen von `/status` (siehe `CLAUDE.md`), nie am Live-Kanal.
7. **Prüfen:** Mit `scripts/simulation/` gibt es einen Mitschnitt des Kanals ohne Anmeldung (`messen.mjs`, Abschnitt Datenschutz). Nach dem Umbau muss er leer bleiben.

## Abnahme

- `tests/simulation/befunde.test.ts`: die zwei K2-Fälle werden grün (`.fails` entfernen).
- Neuer Test: Anfrage über den Code eines Zimmers ohne aktiven Aufenthalt wird abgelehnt; nach Check-out zeigt `/status` keinen Gastnamen mehr.
- `tests/guestServer.test.ts` grün.
- Neuer Test: Verbindung ohne Cookie wird abgelehnt; Housekeeper-Socket erhält kein Ereignis mit `guestName` oder `guestAccessCode`.
- `npm test` grün. Alle Bildschirme aktualisieren sich weiter live (Stichprobe mit `tests/e2e/`).

## Grenzen

- Eigener Branch von `design/glass`, z. B. `feature/s1-live-kanal`. `main` und Produktion nie anfassen, kein Force-Push, **nicht pushen ohne Rückfrage**.
- Nur lokale Test-Datenbank, nur erfundene Gastdaten.
- Der feste QR-Code im Zimmer bleibt (Entscheidung). Restrisiko im Abschlussbericht nennen: Wer sich im Zimmer aufhält, kann während des Aufenthalts Anfragen senden und sieht den Gastnamen.
- Migrationen nur additiv, Backup vor Migration; Rechte-/Sicherheitsänderungen: vor dem Merge STOPP und Simon fragen.
- Abschlussbericht für Simon in einfacher Sprache, höchstens 20 Zeilen.
