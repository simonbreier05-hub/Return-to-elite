# START — Fix-Pakete aus der Simulation v2 im Terminal abarbeiten

## Was hier liegt

| Datei | Zweck |
|---|---|
| `../Fehlerbericht_Simulation_v2.md` | Alle Befunde mit Ursache (Datei:Zeile) |
| `../Entscheidungen_Hotel_Simulation_v2_2026-11-16.md` | Antworten des Hotels — gehen allen Regeln vor |
| `00_Reihenfolge_v1.2.md` | Reihenfolge, Status je Paket |
| `Prompt_*_v1.2.md`, `Prompt_F8_*_v1.md` | Ein Prompt = ein Paket = ein Branch = ein Merge |
| `archiv/` | Ältere Prompt-Versionen (nicht mehr verwenden) |

Die Simulationstests (`tests/simulation/befunde.test.ts`), Drehbücher, Opera-Testlisten und Skripte (`scripts/simulation/`) liegen ebenfalls auf diesem Branch. Die Rohprotokolle der 5 Tage (`tests/simulation/runs/`, ca. 22 MB) liegen nur auf dem lokalen Branch `test/simulation-v2`.

## Grundlage (einmalig, Prompt F0)

Lokaler Branch **`fix/basis-simulation-v2`** = `design/glass` (@ `602a58b`) + Simulations-Dokumente, -Tests und -Skripte. Kein App-Code geändert. Nicht gepusht. Angelegt mit `archiv/Prompt_F0_Basis_Branch_v1.md`.

Prüfen: `git log --oneline -3 fix/basis-simulation-v2`

## So startest du ein Paket

1. Terminal im Ordner `Documents\Return-to-elite` öffnen.
2. `git switch fix/basis-simulation-v2`
3. `claude` starten, mit `/model` das Modell wählen.
4. Eingeben (Beispiel S1):
   `Lies docs/simulation/folgeprompts/Prompt_S1_Sicherheit_v1.2.md vollständig und arbeite ihn ab. Beginne mit Schritt 0.`
5. Claude Code stoppt nach Schritt 0 und wartet auf dein OK. Weitere Stopps bei Migration und Rechteänderungen.
6. Am Ende: Abschlussbericht lesen, auf dem iPad prüfen, dann „OK, mergen“ — erst dann wird in `fix/basis-simulation-v2` gemergt.
7. Für das nächste Paket eine **neue** Claude-Sitzung starten (`/clear` oder neues Terminal).

## Regeln für alle Pakete

- Nie `main`, `design/glass` oder Produktion anfassen. Kein Force-Push. Nicht pushen ohne Rückfrage.
- Nur lokale Test-Datenbank, nur erfundene Gastdaten. Migrationen nur additiv, Backup vorher.
- Preview: Erst wenn mehrere Pakete gemergt sind, entscheidet Simon, wann `fix/basis-simulation-v2` gepusht und auf Preview gebracht wird.
