# Folgeprompts aus der Simulation v2 — Reihenfolge (v1.2, 16.11.2026)

Erst `START.md` lesen. Grundlage: `docs/simulation/Fehlerbericht_Simulation_v2.md`. Entscheidungen: `docs/simulation/Entscheidungen_Hotel_Simulation_v2_2026-11-16.md` (gehen vor, der Nachtrag geht allem vor).

Alle Pakete starten vom Basis-Branch `fix/basis-simulation-v2` und werden nach Simons Abnahme dorthin zurückgemergt. Erst wenn alle nötigen Pakete drin sind, geht die Basis (nach Rückfrage) Richtung `design/glass` / Preview.

| Nr. | Prompt | Befunde | Warum an dieser Stelle | Größe | Status |
|---|---|---|---|---|---|
| 0 | `archiv/Prompt_F0_Basis_Branch_v1.md` | – | Legt `fix/basis-simulation-v2` an: Fehlerbericht, Entscheidungen, Prompts, Simulationstests und -skripte auf Basis von `design/glass` | klein | erledigt (17.11., Commits 07ffe4f, b659aee) |
| 1 | `Prompt_S1_Sicherheit_v1.2.md` | K2, H1 | Datenschutz + richtiger Gastname. Ohne diesen Schritt keine echten Gastdaten. | mittel | gemergt (17.11., ab62c98) |
| 2 | `Prompt_F1_Morgenstatus_v1.2.md` | K1, K3, M5 | Ungereinigtes Zimmer darf nie als sauber gelten. | klein | gemergt (20.11., 29a63cf) |
| 3 | `Prompt_F2_Sperren_v1.2.md` | H4, H5, H6, M4 | Gesperrte Zimmer mit Anreise; „Nicht im Service“ entfällt. | mittel | gemergt (20.11., 29a63cf) |
| 4 | `Prompt_F3_FrontOffice_v1.2.md` | K4, H7, H8, H9, H10, M22 | Zimmerwechsel, Check-out-Korrekturen. Braucht S1. | groß | gemergt (20.11., 29a63cf) |
| 5 | `Prompt_F4_Planung_v1.2.md` | H2, H3, H11, M6, M7, M8 | Level-1-Filter, Suiten gleichmäßig, Krankmeldung. | mittel | gemergt (20.11., 29a63cf) |
| 6 | `Prompt_F5_Meldungen_v1.2.md` | H14, M2, M9, M16 | Baut auf F2/F3 auf. Übergabe zurückgestellt. | mittel | gemergt (20.11., 29a63cf) |
| 7 | `Prompt_F6_Bildschirme_v1.2.md` | H12, M1, M3, M11, M12, M13, M17, M19, M20, M23 | Viele kleine Verbesserungen, Mängel-Fotos. | mittel | gemergt (20.11., 29a63cf) |
| 8 | `Prompt_F7_Gast_Hausmann_v1.2.md` | H13, H16, M10, M14, M15, M18, M21, M24 | Gastbildschirm, Hausmann, Concierge, Archiv beim Check-out. | mittel | gemergt (20.11., 29a63cf) |
| 9 | `Prompt_F8_Opera_Profilvorschlag_v1.md` | – (neu) | Vorschlag fürs Opera-Gastprofil nach Abreise, nur DM. Braucht F7. | klein | gemergt (20.11., 29a63cf) |
| 10 | `Prompt_F9_Gegenpruefung_v1.md` | Funde der Gegenprüfung (A1–A7 hoch) | Gastnamen/Gastcode nur für Berechtigte, alter Gast-Tab, Check-in setzt Aufenthalt, F1-Lücke, DND aufheben, Vorschlag nach N1 (Obergrenze zuerst, Rest in den Float). Vor echten Gästen nötig. | mittel | offen |

## Stand 20.11.2026

Alle Pakete S1–F8 sind zusammen mit UI-Feedback, Design-Rest und Nachtrag über `feature/nachtrag` in `fix/basis-simulation-v2` gemergt (Merge-Commit 29a63cf, OK Simon 20.11.2026). Details, Prüfberichte und Vorher/Nachher-Bilder: Artifact „StayClean Fix-Pakete“. Status je Befund: `docs/simulation/Fehlerbericht_Simulation_v2.md`, Spalte „Paket“.

## Offen

- Übergabe (H15) zurückgestellt.
- Annahmen, die noch in den Prompts stehen, sind dort als „Annahme“ markiert (z. B. Sperre endet nicht automatisch, Rücknahme Check-out nur am selben Tag, Schwelle „2×“ in F8).

## Pilot

Mindestens 1 bis 4 vor einem Pilotbetrieb mit echten Gästen. 5 und 6 empfohlen. 7 bis 9 können während des Piloten folgen.

## Nach jedem Paket

1. `npm test` — in `tests/simulation/befunde.test.ts` das `.fails` der behobenen Befunde entfernen.
2. Betroffenen Simulationstag erneut spielen (`CLAUDE.md`, Abschnitt Simulation).
3. Status in dieser Tabelle und im Fehlerbericht aktualisieren.
