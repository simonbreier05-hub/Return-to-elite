# Prompt F8 — Vorschlag fürs Opera-Gastprofil nach Abreise (v1, 16.11.2026)

> **Start im Terminal:** im Ordner `Return-to-elite` `claude` starten (Modell mit `/model` wählen) und eingeben:
> `Lies docs/simulation/folgeprompts/Prompt_F8_Opera_Profilvorschlag_v1.md vollständig und arbeite ihn ab. Beginne mit Schritt 0.`

Du arbeitest im Repo StayClean (`Return-to-elite`) als Senior-Entwickler (Next.js, Prisma, PostgreSQL, Socket.IO, Tailwind). Simon hat keinen Coding-Hintergrund: Berichte in einfacher Sprache, Fachbegriffe in einem Halbsatz erklären. Lies zuerst `CLAUDE.md` (Abschnitte Guest access, DSGVO retention) und `docs/simulation/Entscheidungen_Hotel_Simulation_v2_2026-11-16.md` (Nachtrag).

## Entscheidungen (16.11.2026)

- StayClean baut **kein eigenes Gästeprofil**.
- Nach der Abreise erzeugt StayClean **einmal je Aufenthalt** einen Vorschlag, was im **Opera-Gastprofil** ergänzt werden könnte.
- **Nur der Duty Manager** sieht den Vorschlag und pflegt ihn **von Hand** in Opera 5 ein. StayClean schreibt nie selbst in Opera.

## Ziel

Der DM hat auf seinem Bildschirm eine Kachel „Opera-Profil-Vorschläge“. Je abgereistem Aufenthalt steht dort eine kurze Liste von Beobachtungen, die er abhakt („in Opera übernommen“) oder verwirft.

## SCHRITT 0 — Ist-Abgleich (keine Codeänderung, Bericht max. 40 Zeilen)

1. Basis prüfen: `git status` muss sauber sein. Der lokale Branch `fix/basis-simulation-v2` muss existieren — sonst STOPP und auf `docs/simulation/folgeprompts/START.md` verweisen. `git ls-remote origin`, `git fetch origin` mit expliziten Refspecs, dann `git log --oneline fix/basis-simulation-v2..design/glass | wc -l`. **Voraussetzung:** F7 (Archiv des Zimmerverlaufs beim Check-out) ist in `fix/basis-simulation-v2` gemergt. Wenn nicht: STOPP.
2. Welche strukturierten Daten hat ein abgereister Aufenthalt (Gastwünsche nach Typ, Opera-Traces, DND, Green Option, Reinigungszeit „ab …“, Babybett/Extrabett)? Tabelle: Quelle → Datei:Zeile.
3. Wo läuft der Check-out (FO-Eintrag, Import, Zimmerwechsel) — eine Stelle, an die der Vorschlag gehängt werden kann?
4. Geplante Schema-Änderung (additiv, beide Prisma-Dateien) und Einbindung in die Nachtlöschung.
**STOPP:** Bericht schicken, auf OK von Simon warten.

## Aufgaben

1. **Vorschlag erzeugen:** Beim Check-out eines Aufenthalts (einmal, nicht bei Zurücknahme/Wiederholung) eine Funktion `buildProfileSuggestion(stayId)`. Nur **regelbasiert** aus strukturierten Daten, keine KI-Auswertung von Freitext:
   - wiederholte Wünsche gleichen Typs (z. B. 2× „Extra Kissen“) → „Wunsch: Extra Kissen“,
   - Reinigung „ab HH:MM“ an mindestens 2 Tagen → „Bevorzugte Reinigungszeit ab HH:MM“,
   - Green Option an mindestens 2 Tagen → „Verzichtet auf täglichen Wäschewechsel“,
   - Babybett / Extrabett / Twin-Aufbau → als Hinweis,
   - Opera-Traces, die im Profil wiederkehrend sein könnten (nur Typ, nicht Text).
   Gibt es nichts Brauchbares: **kein** Vorschlag.
2. **Keine Gesundheitsdaten (Annahme, Art. 9 DSGVO):** Allergien, Diätwünsche mit Gesundheitsbezug, Mängel, Beschwerden und Freitext werden **nie** in den Vorschlag übernommen. Liste der ausgeschlossenen Typen als Konstante mit Test.
3. **Speicherung:** neue Tabelle (z. B. `ProfileSuggestion`: Aufenthalt, Anrede/Titel/Nachname aus dem Import, Punkte als JSON, Status offen/übernommen/verworfen, erledigt von, erledigt am). Löschung: sobald alle Punkte erledigt sind, spätestens nach 30 Tagen über die Nachtlöschung.
4. **DM-Kachel:** Kachel „Opera-Profil-Vorschläge (N)“ auf dem DM-Startbildschirm. Je Vorschlag: „Herr Dr. Test 014 · Abreise 20.11. · Zimmer 305“, Punkte mit Häkchen „in Opera übernommen“ / „verwerfen“, Knopf „alle erledigt“. Logbuch ohne Gastnamen (nur ID).
5. **Rechte:** Lesen und Ändern nur Rolle Duty Manager (Server prüft, 403 für alle anderen inkl. Supervisor). Kein Live-Kanal-Ereignis mit Gastnamen; der Kachelzähler lädt über die geschützte API.
6. **Texte** deutsch und englisch über die bestehende Übersetzung.

## Abnahme

- Tests: Check-out mit 2× gleichem Wunsch erzeugt genau einen Vorschlag; Aufenthalt ohne Muster erzeugt keinen; Allergie-Trace und Freitext erscheinen nie; Supervisor/FO/HK bekommen 403; erledigter Vorschlag wird gelöscht; Vorschlag älter als 30 Tage wird von der Nachtlöschung entfernt; Check-out zurücknehmen (F3) und erneut auschecken erzeugt keinen zweiten Vorschlag.
- Kein Gastname in Logs und Logbuch (bestehender Scan-Test grün).

## Grenzen

- **Annahmen:** welche Muster zählen (Schwelle „2×“), Ausschluss von Gesundheitsdaten. Im Abschlussbericht kennzeichnen.
- **Offene Rechtsfrage (kein Rechtsrat):** Dürfen Beobachtungen aus dem Aufenthalt ins Opera-Profil? Das regelt die Datenschutzerklärung des Hotels für Opera, nicht StayClean. Im Abschlussbericht nennen.
- Kein Schreiben nach Opera, kein Opera-Adapter in diesem Paket.
- Migration nur additiv, Backup vorher; neue Tabelle mit Gastdaten: vor dem Merge STOPP und Simon fragen.
- Eigener Branch von `fix/basis-simulation-v2`, z. B. `feature/f8-opera-profil`. `main`, `design/glass` und Produktion nie anfassen, kein Force-Push, **nicht pushen ohne Rückfrage**. Nur lokale Test-Datenbank, nur erfundene Gastdaten.
- Abschlussbericht für Simon in einfacher Sprache, höchstens 20 Zeilen.

## Abschluss

- Nach dem OK zu Schritt 0: `git switch -c feature/f8-opera-profil fix/basis-simulation-v2`.
- `npm test` und `npm run build` grün.
- `CLAUDE.md` ergänzen (höchstens 5 Zeilen).
- Commit(s) auf dem Feature-Branch. **Nicht pushen ohne Rückfrage.**
- Abschlussbericht mit Abnahme-Checkliste für das iPad.
- Erst nach Simons ausdrücklichem OK: `git switch fix/basis-simulation-v2 && git merge --no-ff feature/f8-opera-profil`, dann in `00_Reihenfolge_v1.2.md` als „gemergt“ markieren.
