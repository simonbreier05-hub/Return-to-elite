# Prompt S1 — Sicherheit: Live-Kanal und Gastcode (v1.2, 16.11.2026)

> **Start im Terminal:** im Ordner `Return-to-elite` `claude` starten (Modell mit `/model` wählen) und eingeben:
> `Lies docs/simulation/folgeprompts/Prompt_S1_Sicherheit_v1.2.md vollständig und arbeite ihn ab. Beginne mit Schritt 0.`

Du arbeitest im Repo StayClean (`Return-to-elite`). Lies zuerst `CLAUDE.md` und in `docs/simulation/Fehlerbericht_Simulation_v2.md` die Befunde **K2** und **H1**.

## Entscheidungen (16.11.2026)

- Die App lief nie mit echten Gastdaten. Mit echten Daten ist sie nur mit Login nutzbar (Gastbildschirm ausgenommen, siehe unten).
- Jedes Zimmer hat einen **festen QR-Code**. Der Gastbereich ist an den Aufenthalt aus dem Opera-Import gekoppelt; der Gast sieht „Anrede Titel Nachname“.
- Nach Check-out wird der Verlauf des Zimmers gespeichert und der Gastbereich zurückgesetzt.
- **Der Gastbildschirm grüßt immer nur den aktuellen Gast.** Ein Gast darf nie den Namen des Vorgasts sehen. Das ist ein Muss-Kriterium dieses Pakets.

## Ziel

Der Live-Kanal (Socket.IO, die Verbindung, über die Bildschirme sich sofort aktualisieren) liefert nur noch an angemeldete Mitarbeiter, und nur das, was deren Rolle sehen darf. Gastnamen und Gastcodes laufen nie mehr an alle.

## SCHRITT 0 — Ist-Abgleich (keine Codeänderung, Bericht max. 40 Zeilen)

1. Basis prüfen: `git status` muss sauber sein. Der lokale Branch `fix/basis-simulation-v2` muss existieren — sonst STOPP und auf `docs/simulation/folgeprompts/START.md` verweisen. `git ls-remote origin`, `git fetch origin` mit expliziten Refspecs, dann `git log --oneline fix/basis-simulation-v2..design/glass | wc -l` (gibt es neue Commits auf `design/glass`? dann melden). Welche Fix-Pakete sind schon in `fix/basis-simulation-v2` gemergt (`git log --oneline --merges fix/basis-simulation-v2`, Abgleich mit `00_Reihenfolge_v1.2.md`)? Ist das vorige Paket laut Reihenfolge noch nicht gemergt: melden.
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
5b. **Immer der richtige Name (entschieden, Muss):** Name und Anrede werden bei jeder Abfrage frisch aus dem gerade aktiven Aufenthalt bestimmt (eine Funktion, überall genutzt), nie aus einem Zwischenspeicher: `/status` mit `Cache-Control: no-store`, Service Worker/PWA cacht die Antwort nicht, kein Speichern von Name/Anrede im Browser. Regeln:
   - Same-Day-Turn: nach Check-out des Vorgasts neutral, bis der neue Gast eingecheckt ist (laut Front Office bzw. Import).
   - Late Check-out: bis zum Check-out der bisherige Gast, danach neutral.
   - Zimmerwechsel (F3): altes Zimmer sofort neutral, neues Zimmer zeigt den Gast.
   - Zwei Aufenthalte gleichzeitig „im Haus“ (Datenfehler aus dem Import): neutral und Warnung an den DM — nie raten.
   - Eine bereits offene Gastseite prüft beim nächsten Abfragen erneut und wechselt auf neutral, sobald der Aufenthalt endet.
6. **Gastbildschirm:** bleibt beim Abfragen von `/status` (siehe `CLAUDE.md`), nie am Live-Kanal.
7. **Prüfen:** Mit `scripts/simulation/` gibt es einen Mitschnitt des Kanals ohne Anmeldung (`messen.mjs`, Abschnitt Datenschutz). Nach dem Umbau muss er leer bleiben.

## Abnahme

- `tests/simulation/befunde.test.ts`: die zwei K2-Fälle werden grün (`.fails` entfernen).
- Neuer Test: Anfrage über den Code eines Zimmers ohne aktiven Aufenthalt wird abgelehnt; nach Check-out zeigt `/status` keinen Gastnamen mehr.
- `tests/guestServer.test.ts` grün.
- Neue Test-Matrix „richtiger Name“: Same-Day-Turn (vor/nach Check-out, nach Check-in), Late Check-out, Zimmerwechsel (alt/neu), doppelter aktiver Aufenthalt, Antwort-Header `no-store`. In keinem Fall erscheint der Name eines anderen Aufenthalts.
- Neuer Test: Verbindung ohne Cookie wird abgelehnt; Housekeeper-Socket erhält kein Ereignis mit `guestName` oder `guestAccessCode`.
- `npm test` grün. Alle Bildschirme aktualisieren sich weiter live (Stichprobe mit `tests/e2e/`).

## Grenzen

- Eigener Branch von `fix/basis-simulation-v2`, z. B. `feature/s1-live-kanal`. `main`, `design/glass` und Produktion nie anfassen, kein Force-Push, **nicht pushen ohne Rückfrage**.
- Nur lokale Test-Datenbank, nur erfundene Gastdaten.
- Der feste QR-Code im Zimmer bleibt (Entscheidung). Restrisiko im Abschlussbericht nennen: Wer sich im Zimmer aufhält, kann während des Aufenthalts Anfragen senden und sieht den Gastnamen.
- Migrationen nur additiv, Backup vor Migration; Rechte-/Sicherheitsänderungen: vor dem Merge STOPP und Simon fragen.
- Abschlussbericht für Simon in einfacher Sprache, höchstens 20 Zeilen.

## Abschluss

- Nach dem OK zu Schritt 0: `git switch -c <Branch aus „Grenzen“> fix/basis-simulation-v2`.
- `npm test` und `npm run build` grün. In `tests/simulation/befunde.test.ts` das `.fails` der behobenen Befunde entfernen.
- `CLAUDE.md` ergänzen (höchstens 5 Zeilen, was sich an Regeln/Abläufen geändert hat).
- Commit(s) auf dem Feature-Branch. **Nicht pushen ohne Rückfrage.**
- Abschlussbericht für Simon in einfacher Sprache (siehe „Grenzen“) mit Abnahme-Checkliste für das iPad.
- Erst nach Simons ausdrücklichem OK: `git switch fix/basis-simulation-v2 && git merge --no-ff <Branch>`. Danach `00_Reihenfolge_v1.2.md`: Paket als „gemergt“ markieren, und im Fehlerbericht den Status der Befunde auf „behoben“ setzen.
