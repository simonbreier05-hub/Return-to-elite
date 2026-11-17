# Prompt F3 — Front-Office-Korrekturen und Zimmerwechsel (v1.1, 16.11.2026)

Du arbeitest im Repo StayClean (`Return-to-elite`). Lies zuerst `CLAUDE.md` und in `docs/simulation/Fehlerbericht_Simulation_v2.md` die Befunde **K4**, **H7**, **H8**, **H9**, **H10** und **M22**.

Dieses Paket ist groß. Arbeite in vier Teilen mit je einem Commit und melde nach jedem Teil kurz den Stand. Wenn der Kontext knapp wird: nach Teil 2 abschließen und Teil 3–4 als eigenen Prompt vorschlagen.

## Entscheidungen (16.11.2026)

- **Zimmerwechsel:** Front Office, Supervisor und Duty Manager führen ihn direkt aus, **ohne zweite Freigabe**. Das alte Zimmer bleibt sichtbar gekennzeichnet („Zimmerwechsel → 418“), bis es gereinigt und freigegeben ist. Regel B5 ist damit geändert.
- **Check-out zurücknehmen:** Front Office, Supervisor, Duty Manager.
- **Vorzeitige Abreise:** Front Office trägt sie von Hand ein, ebenso Supervisor/DM. Kein Nachimport (P14).
- **Late Check-out gegen Anreise:** Supervisor/DM entscheiden; sie bekommen die Warnung.

## SCHRITT 0 — Ist-Abgleich (keine Codeänderung, Bericht max. 40 Zeilen)

1. Remote-Stand prüfen: `git ls-remote origin`, `git fetch` mit expliziten Refspecs, `git log --oneline A..B | wc -l`. Ist `design/glass` noch die richtige Basis? Welche früheren Fix-Pakete (siehe `00_Reihenfolge.md`) sind schon gemergt?
2. Jede Datei:Zeile-Angabe unten gegen den aktuellen Code prüfen; Abweichungen auflisten.
3. Lies `docs/simulation/Entscheidungen_Hotel_Simulation_v2_2026-11-16.md`. Die dortigen Entscheidungen gehen den Regeln im Fehlerbericht und in diesem Prompt vor. Widersprüche sofort melden.
4. Geplante Schema-Änderungen nennen (additiv, beide Prisma-Dateien).
**STOPP:** Bericht schicken, auf OK von Simon warten.

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
4. Beim Setzen eines Late Check-outs und beim Setzen von Rush: Wenn die Anreise früher kommt als der Vorgast geht, dringende Meldung an Supervisor der Etage und DM (sie entscheiden, entschieden Frage 8); Front Office sieht das Kennzeichen „Konflikt“ in Anreise-Liste und Warteschlange.

## Teil 2 — Check-out zurücknehmen und Mehrfach-Check-out (H7, M22)

1. `DELETE /api/rooms/[id]/checkout` für Front Office, Supervisor und Duty Manager (entschieden): Aufenthalt zurück auf „im Haus“, Zimmer belegt, Logbuch `GUEST_CHECKOUT_REVERTED`, Korrekturmeldung an die Housekeeperin und die Supervisoren der Etage. **Annahme:** nur am selben Betriebstag.
2. Front-Office-Liste: Mehrfachauswahl „ausgecheckt“ mit einer Rückfrage, die die Zimmernummern nennt. Die Liste darf während der Auswahl nicht springen.
3. Front Office darf ein „Bitte nicht stören“ des Gastes aufheben (mit Logbuch). **Annahme, bitte kennzeichnen.**

## Teil 3 — Vorzeitige Abreise (H8)

1. Front Office, Supervisor und Duty Manager können bei einem Bleiber „reist heute ab“ eintragen (entschieden): Art wechselt auf Abreise (`overrideCleaningType` in `src/lib/dayplan/merge.ts:299` nutzen), danach normaler Check-out.
2. Meldung an Housekeeperin und Supervisor wie bei jeder Änderung der Liste. Der nächste Import überschreibt die Handeingabe nicht (Regel P14).

## Teil 4 — Zimmerwechsel (H9, B5 neu)

1. Ablauf: Front Office, Supervisor oder Duty Manager führt den Wechsel in einem Schritt aus (von Zimmer, nach Zimmer, Grund ohne Gastdaten), mit einer Rückfrage, die beide Zimmernummern nennt. Logbuch mit Person und Uhrzeit.
2. Zielwahl zeigt nur Zimmer, die frei, geprüft, nicht gesperrt und ohne Anreise heute sind.
3. Beim Ausführen: Aufenthalt wandert ins Zielzimmer (damit zeigt der Gastcode des Zielzimmers den Aufenthalt und der alte Code nichts mehr). Altes Zimmer wird schmutzig mit Art Abreise und trägt sichtbar „Zimmerwechsel → <Ziel>“ in allen Listen und im Grundriss, bis es freigegeben ist; das Zielzimmer zeigt „von <alt>“ für den Tag. Zielzimmer wird belegt und erscheint als Bleiber.
4. Meldungen: Housekeeperinnen beider Zimmer, Supervisoren der Etagen, DM, Front Office, Hausmann (Aufgabe „Gepäck von … nach …“ — **Annahme**, nicht beantwortet). Nur Zimmernummern, keine Gastnamen.
5. Offene Wünsche und Notizen des Gastes wandern mit; Notizen zum alten Zimmer bleiben dort.

## Abnahme

- `tests/simulation/befunde.test.ts`: H7-Fall wird grün (`.fails` entfernen).
- Neue Tests je Teil: Start mit Vorgast verlangt Bestätigung; Einchecken bei Vorgast abgelehnt; Check-out zurücknehmen stellt den Stand wieder her; Bleiber-Frühabreise; Zimmerwechsel durch FO/Supervisor/DM erfüllt alle Punkte aus Teil 4, altes Zimmer gekennzeichnet bis Freigabe.
- Rechte: Housekeeper, Concierge, Hausmann und Techniker bekommen bei allen neuen Wegen 403.
- `npm test` grün.

## Grenzen

- Fragen 5–8 sind entschieden (siehe oben). **Weiter Annahmen:** Rücknahme nur am selben Betriebstag; Hausmann-Aufgabe Gepäck; FO darf DND aufheben. Im Abschlussbericht kennzeichnen.
- Rechteänderungen und Migration: vor dem Merge STOPP und Simon fragen.
- Schema-Änderungen in beiden Prisma-Dateien; `db push` nur lokal. Neue Tabelle mit Freitext braucht eine Regel in der Nachtlöschung (`CLAUDE.md`).
- Eigener Branch von `design/glass`, z. B. `feature/f3-front-office`. `main` und Produktion nie anfassen, **nicht pushen ohne Rückfrage**. Nur lokale Test-Datenbank, nur erfundene Gastdaten.
- Abschlussbericht für Simon in einfacher Sprache, höchstens 25 Zeilen.
