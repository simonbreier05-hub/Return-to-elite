# Prompt F3 — Front-Office-Korrekturen und Zimmerwechsel

Du arbeitest im Repo StayClean (`Return-to-elite`). Lies zuerst `CLAUDE.md` und in `docs/simulation/Fehlerbericht_Simulation_v2.md` die Befunde **K4**, **H7**, **H8**, **H9**, **H10** und **M22**.

Dieses Paket ist groß. Arbeite in vier Teilen mit je einem Commit und melde nach jedem Teil kurz den Stand. **Vor Teil 4 (Zimmerwechsel) STOPP und Simon fragen**, ob die Antworten des Hotels auf die Fragen 5 bis 8 (Bericht Abschnitt 7) vorliegen.

## Ausgangslage (geprüft)

- `src/app/api/rooms/[id]/checkout/route.ts:19–42`: nur Eintragen (`POST`); Zeile 25 lehnt ab, wenn heute keine Abreise im Plan steht (Bleiber).
- `src/app/api/rooms/[id]/late-checkout/route.ts:29`: Uhrzeit wird gespeichert, nie gegen die Anreise geprüft.
- `src/lib/rooms/applyStatusChange.ts:76–95`: Beim Start wird nur „Bitte nicht stören“ geprüft. `:160–182`: Freigabe ohne Blick auf den Vorgast.
- `src/lib/ui/frontOfficeHub.ts:53`: Einchecken ist möglich, sobald das Zimmer „geprüft“ ist.
- Zimmerwechsel: keine Funktion. `/api/rooms/[id]/move` verschiebt ein Zimmer zwischen Housekeepern.
- Gastcode hängt am Aufenthalt des Zimmers: `src/lib/guestStay.ts:11–13`.

## Teil 1 — Schutz „Gast noch im Zimmer“ (K4, H10)

1. Eine gemeinsame Funktion „Ist der Vorgast noch da?“: Abreise/Turn heute und Aufenthalt nicht `CHECKED_OUT`, oder Late Check-out später als jetzt.
2. Housekeeper-Start: Rückfrage mit Klartext („Gast laut Front Office noch im Zimmer, Late Check-out 15:00“). Supervisor-Freigabe: Rückfrage. **Annahme:** Warnung mit Bestätigung, keine Sperre.
3. Front Office: „Einchecken“ nur, wenn geprüft **und** Vorgast ausgecheckt; sonst Hinweis mit Grund.
4. Beim Setzen eines Late Check-outs und beim Setzen von Rush: Wenn die Anreise früher kommt als der Vorgast geht, Warnung an Front Office und Supervisor der Etage; Kennzeichen „Konflikt“ in Anreise-Liste und Warteschlange.

## Teil 2 — Check-out zurücknehmen und Mehrfach-Check-out (H7, M22)

1. `DELETE /api/rooms/[id]/checkout` für Front Office und Supervisor: Aufenthalt zurück auf „im Haus“, Zimmer belegt, Logbuch `GUEST_CHECKOUT_REVERTED`, Korrekturmeldung an die Housekeeperin und die Supervisoren der Etage. **Annahme:** nur am selben Betriebstag.
2. Front-Office-Liste: Mehrfachauswahl „ausgecheckt“ mit einer Rückfrage, die die Zimmernummern nennt. Die Liste darf während der Auswahl nicht springen.
3. Front Office darf ein „Bitte nicht stören“ des Gastes aufheben (mit Logbuch). **Annahme, bitte kennzeichnen.**

## Teil 3 — Vorzeitige Abreise (H8)

1. Front Office kann bei einem Bleiber „reist heute ab“ eintragen: Art wechselt auf Abreise (`overrideCleaningType` in `src/lib/dayplan/merge.ts:299` nutzen), danach normaler Check-out.
2. Meldung an Housekeeperin und Supervisor wie bei jeder Änderung der Liste. Der nächste Import überschreibt die Handeingabe nicht (Regel P14).

## Teil 4 — Zimmerwechsel (H9, Annahme B5)

1. Ablauf: Front Office stellt den Wechsel an (von Zimmer, nach Zimmer, Grund). Supervisor oder Duty Manager gibt frei. Erst die Freigabe ändert etwas.
2. Zielwahl zeigt nur Zimmer, die frei, geprüft, nicht gesperrt und ohne Anreise heute sind.
3. Bei Freigabe: Aufenthalt wandert ins Zielzimmer (damit zeigt der Gastcode des Zielzimmers den Aufenthalt und der alte Code nichts mehr). Altes Zimmer wird schmutzig mit Art Abreise. Zielzimmer wird belegt und erscheint als Bleiber.
4. Meldungen: Housekeeperinnen beider Zimmer, Supervisoren der Etagen, Front Office, Hausmann (Aufgabe „Gepäck von … nach …“). Nur Zimmernummern, keine Gastnamen.
5. Offene Wünsche und Notizen des Gastes wandern mit; Notizen zum alten Zimmer bleiben dort.

## Abnahme

- `tests/simulation/befunde.test.ts`: H7-Fall wird grün (`.fails` entfernen).
- Neue Tests je Teil: Start mit Vorgast verlangt Bestätigung; Einchecken bei Vorgast abgelehnt; Check-out zurücknehmen stellt den Stand wieder her; Bleiber-Frühabreise; Zimmerwechsel ohne Freigabe ändert nichts, mit Freigabe alle Punkte aus Teil 4.
- Rechte: Housekeeper, Concierge, Hausmann und Techniker bekommen bei allen neuen Wegen 403.
- `npm test` grün.

## Grenzen

- Alle Regeln hier sind **Annahmen** (Fragen 5 bis 8 im Bericht). Im Abschlussbericht je Teil kennzeichnen.
- Schema-Änderungen in beiden Prisma-Dateien; `db push` nur lokal. Neue Tabelle mit Freitext braucht eine Regel in der Nachtlöschung (`CLAUDE.md`).
- Eigener Branch von `design/glass`, z. B. `feature/f3-front-office`. `main` und Produktion nie anfassen, **nicht pushen ohne Rückfrage**. Nur lokale Test-Datenbank, nur erfundene Gastdaten.
- Abschlussbericht für Simon in einfacher Sprache, höchstens 25 Zeilen.
