# Prompt F0 — Basis-Branch für die Fix-Pakete anlegen (v1, 16.11.2026)

> **Start im Terminal:** im Ordner `Documents\Return-to-elite` `claude` starten und eingeben:
> `Lies docs/simulation/_neu_v1.2/Prompt_F0_Basis_Branch_v1.md vollständig und arbeite ihn ab. Beginne mit Schritt 0.`

Du arbeitest im Repo StayClean (`Return-to-elite`). Simon hat keinen Coding-Hintergrund: Berichte in einfacher Sprache. **Dieses Paket ändert keinen App-Code**, nur Git-Branches und Dokumente.

## Ziel

Ein lokaler Branch **`fix/basis-simulation-v2`** = `design/glass` + Simulations-Dokumente, -Tests und -Skripte aus `test/simulation-v2` + die neuen Prompts v1.2. Alle Fix-Pakete (S1, F1–F8) starten später von dort.

## Vorgeschichte (wichtig)

Claude Chat hat am 16.11. versucht, das über eine Linux-VM zu erledigen; das brach mitten drin ab. Mögliche Reste im Arbeitsordner (Branch `test/simulation-v2`):
- gestagte Umbenennungen `docs/simulation/folgeprompts/*_v1.md` → `docs/simulation/folgeprompts/archiv/`,
- gestagtes Entfernen von `tests/simulation/runs/` aus dem Index (`git rm --cached`) und geänderte `tests/simulation/runs/.gitignore`,
- unversionierte Dateien: `docs/simulation/Entscheidungen_Hotel_Simulation_v2_2026-11-16.md`, `docs/simulation/folgeprompts/archiv/*_v1.1.md`, `docs/simulation/_neu_v1.2/` (die neuen Prompts),
- `docs/simulation/StayClean_Simulation_v2_Berichte.zip` wurde bewusst gelöscht (war nie versioniert).
Die VM-Git kannte die Windows-Zeilenenden nicht; dadurch sahen dort fast alle Dateien „geändert“ aus. Das darf hier nicht zu Änderungen führen.

## SCHRITT 0 — Bestandsaufnahme (keine Änderung, Bericht max. 30 Zeilen)

1. `git branch --show-current`, `git status --short | head -50`, `git status --short | wc -l`.
2. Sind Dateien nur wegen Zeilenenden „geändert“? Prüfen mit `git diff --ignore-cr-at-eol --stat | tail -3` und `git config --show-origin core.autocrlf`. Echte Inhaltsänderungen an App-Dateien (außerhalb `docs/simulation/`, `tests/simulation/`) → auflisten und STOPP.
3. `git stash list`, existieren `design/glass`, `test/simulation-v2`, `fix/basis-simulation-v2`?
4. Inhalt von `docs/simulation/_neu_v1.2/` auflisten.
**STOPP:** Bericht an Simon, auf OK warten.

## Umsetzung (nach OK)

1. **Index aufräumen:** `git reset -q` (nur Index, Arbeitsdateien bleiben). Falls Dateien nur wegen Zeilenenden geändert erscheinen: nichts committen, nur melden.
2. **Unversionierte Dateien sichern:** `docs/simulation/Entscheidungen_*.md`, `docs/simulation/_neu_v1.2/`, `docs/simulation/folgeprompts/archiv/*_v1.1.md` in einen Ordner außerhalb des Repos kopieren (z. B. `..\stayclean-sim-sicherung\`). Die von der VM verschobenen `*_v1.md` zurück an ihren alten Ort (oder `git checkout -- docs/simulation/folgeprompts`), `tests/simulation/runs/.gitignore` mit `git checkout --` zurücksetzen. Danach muss `git status` auf `test/simulation-v2` sauber sein (bis auf unversionierte Dateien von Simon wie `AGENTS.md`, `docs/pr-zimmerliste-v2.1.md` — die nicht anfassen).
3. **Basis-Branch:** `git switch -c fix/basis-simulation-v2 design/glass`
4. **Dateien aus der Simulation holen:** `git checkout test/simulation-v2 -- docs/simulation tests/simulation scripts/simulation CLAUDE.md`
   Prüfen: `git diff --cached --stat design/glass -- . ':!docs' ':!tests' ':!scripts' ':!CLAUDE.md'` muss leer sein (kein App-Code).
5. **Rohprotokolle nicht übernehmen (22 MB):** `git rm -r --cached -q tests/simulation/runs`, dann `tests/simulation/runs/.gitignore` mit Inhalt
   ```
   # Rohprotokolle der Simulation bleiben lokal (Branch test/simulation-v2)
   *
   !.gitignore
   ```
   und `git add -f tests/simulation/runs/.gitignore`.
6. **Prompts einsortieren:**
   - `docs/simulation/folgeprompts/archiv/` anlegen; alle `*_v1.md`, `00_Reihenfolge.md` dorthin (`git mv`), ebenso die gesicherten `*_v1.1.md`.
   - Aus der Sicherung: alle Dateien aus `_neu_v1.2/` außer diesem Prompt nach `docs/simulation/folgeprompts/` (das sind `START.md`, `00_Reihenfolge_v1.2.md`, `Prompt_*_v1.2.md`, `Prompt_F8_Opera_Profilvorschlag_v1.md`); `Entscheidungen_*.md` nach `docs/simulation/`; diesen Prompt nach `docs/simulation/folgeprompts/archiv/Prompt_F0_Basis_Branch_v1.md`.
   - Ordner `docs/simulation/_neu_v1.2/` danach entfernen.
7. **CLAUDE.md** (Abschnitt Simulation, höchstens 4 Zeilen): Fix-Pakete starten von `fix/basis-simulation-v2`; Einstieg `docs/simulation/folgeprompts/START.md`; Rohprotokolle nur auf `test/simulation-v2`.
8. `npm test -- tests/simulation` einmal laufen lassen (rote `.fails`-Fälle sind erwartet, der Lauf selbst muss durchgehen).
9. **Commit** auf `fix/basis-simulation-v2`: „Basis für Fix-Pakete aus Simulation v2: Fehlerbericht, Entscheidungen, Prompts v1.2, Simulationstests und -skripte“.

## Grenzen

- Kein App-Code, keine Migration, keine Datenbank.
- `main`, `design/glass`, `test/simulation-v2` nicht verändern (nur lesen). Kein Force-Push. **Nicht pushen ohne Rückfrage.**
- Nichts löschen außer dem leeren Ordner `_neu_v1.2/` nach dem Einsortieren.

## Abschluss

Bericht für Simon, höchstens 12 Zeilen: Branch angelegt (Commit-ID), Dateien in `docs/simulation/folgeprompts/`, `git status` sauber, nächster Schritt: `Prompt_S1_Sicherheit_v1.2.md` in einer neuen Sitzung.
