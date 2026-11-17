# Folgeprompts aus der Simulation v2 — Reihenfolge (v1.1, 16.11.2026)

Grundlage: `docs/simulation/Fehlerbericht_Simulation_v2.md`. Entscheidungen des Hotels: `docs/simulation/Entscheidungen_Hotel_Simulation_v2_2026-11-16.md` (gehen vor). Jeder Prompt ist für eine eigene, frische Claude-Code-Sitzung gedacht: Datei öffnen, ganzen Inhalt einfügen.

| Nr. | Prompt | Befunde | Warum an dieser Stelle | Größe |
|---|---|---|---|---|
| 1 | `Prompt_S1_Sicherheit_v1.1.md` | K2, H1 | Datenschutz. Ohne diesen Schritt darf die App keine echten Gastdaten sehen. | mittel |
| 2 | `Prompt_F1_Morgenstatus_v1.1.md` | K1, K3, M5 | Verhindert, dass ein ungereinigtes Zimmer als sauber gilt. Kleiner, gut prüfbarer Eingriff. | klein |
| 3 | `Prompt_F2_Sperren_v1.1.md` | H4, H5, H6, M4 | Gesperrte Zimmer mit Anreise sind das nächste Risiko für Gäste. | mittel |
| 4 | `Prompt_F3_FrontOffice_v1.1.md` | K4, H7, H8, H9, H10, M22 | Größtes Paket (Zimmerwechsel ist eine neue Funktion). Antworten des Hotels liegen vor. | groß |
| 5 | `Prompt_F4_Planung_v1.1.md` | H2, H3, H11, M6, M7, M8 | Planung läuft schon gut; hier geht es um Engpasstage. | mittel |
| 6 | `Prompt_F5_Meldungen_v1.1.md` | H14, M2, M9, M16 | Baut auf F2/F3 auf. Übergabe (H15) zurückgestellt. | mittel |
| 7 | `Prompt_F6_Bildschirme_v1.1.md` | H12, M1, M3, M11, M12, M13, M17, M19, M20, M23 | Viele kleine Verbesserungen für Housekeeper und Supervisor. | mittel |
| 8 | `Prompt_F7_Gast_Hausmann_v1.1.md` | H13, H16, M10, M14, M15, M18, M21, M24 | Gastbildschirm, Hausmann, Concierge. | mittel |

## Vor dem Start klären

- Fragen 1–14 und rechtliche Fragen 1–6 beantwortet (16.11.). Offen: Gepäck beim Zimmerwechsel, Info bei Sperre eines belegten Zimmers, „Nicht im Service“, Aufbewahrung des Zimmerverlaufs nach Check-out, schriftliche Bestätigung zur Mitarbeiter-Auswertung.
- Übergabe (H15) zurückgestellt. Vorlieben wiederkehrender Gäste: Backlog „G3 Wiederkehrer“.

## Pilot

Mindestens 1 bis 4 vor einem Pilotbetrieb mit echten Gästen. 5 und 6 empfohlen. 7 und 8 können während des Piloten folgen.

## Nach jedem Paket

1. `npm test` — in `tests/simulation/befunde.test.ts` das `.fails` der behobenen Befunde entfernen (der Test meldet sich von selbst).
2. Den betroffenen Simulationstag noch einmal spielen (Hinweis in `CLAUDE.md`, Abschnitt Simulation).
3. Im Fehlerbericht den Status des Befunds von NEU auf „behoben“ setzen.
