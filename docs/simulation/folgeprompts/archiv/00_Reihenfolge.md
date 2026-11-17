# Folgeprompts aus der Simulation v2 — Reihenfolge

Grundlage: `docs/simulation/Fehlerbericht_Simulation_v2.md`. Jeder Prompt ist für eine eigene, frische Claude-Code-Sitzung gedacht: Datei öffnen, ganzen Inhalt einfügen.

| Nr. | Prompt | Befunde | Warum an dieser Stelle | Größe |
|---|---|---|---|---|
| 1 | `Prompt_S1_Sicherheit_v1.md` | K2, H1 | Datenschutz. Ohne diesen Schritt darf die App keine echten Gastdaten sehen. | mittel |
| 2 | `Prompt_F1_Morgenstatus_v1.md` | K1, K3, M5 | Verhindert, dass ein ungereinigtes Zimmer als sauber gilt. Kleiner, gut prüfbarer Eingriff. | klein |
| 3 | `Prompt_F2_Sperren_v1.md` | H4, H5, H6, M4 | Gesperrte Zimmer mit Anreise sind das nächste Risiko für Gäste. | mittel |
| 4 | `Prompt_F3_FrontOffice_v1.md` | K4, H7, H8, H9, H10, M22 | Größtes Paket (Zimmerwechsel ist eine neue Funktion). Braucht Antworten des Hotels. | groß |
| 5 | `Prompt_F4_Planung_v1.md` | H2, H3, H11, M6, M7, M8 | Planung läuft schon gut; hier geht es um Engpasstage. | mittel |
| 6 | `Prompt_F5_Meldungen_Uebergabe_v1.md` | H14, H15, M2, M9, M16 | Baut auf F2/F3 auf (Sperren und Wechsel sollen gemeldet und übergeben werden). | mittel |
| 7 | `Prompt_F6_Bildschirme_v1.md` | H12, M1, M3, M11, M12, M13, M17, M19, M20, M23 | Viele kleine Verbesserungen für Housekeeper und Supervisor. | mittel |
| 8 | `Prompt_F7_Gast_Hausmann_v1.md` | H13, H16, M10, M14, M15, M18, M21, M24 | Gastbildschirm, Hausmann, Concierge. | mittel |

## Vor dem Start klären

- **Vor F3 und F4:** die Fragen 1 bis 9 aus Abschnitt 7 des Fehlerberichts mit dem Hotel besprechen. Ohne Antwort bauen die Prompts nach Simons Annahme und markieren das.
- **Vor S1:** Lief die App schon einmal mit echten Gastdaten außerhalb des eigenen Rechners? Wenn ja, zuerst die rechtliche Frage 1 klären.

## Pilot

Mindestens 1 bis 4 vor einem Pilotbetrieb mit echten Gästen. 5 und 6 empfohlen. 7 und 8 können während des Piloten folgen.

## Nach jedem Paket

1. `npm test` — in `tests/simulation/befunde.test.ts` das `.fails` der behobenen Befunde entfernen (der Test meldet sich von selbst).
2. Den betroffenen Simulationstag noch einmal spielen (Hinweis in `CLAUDE.md`, Abschnitt Simulation).
3. Im Fehlerbericht den Status des Befunds von NEU auf „behoben“ setzen.
