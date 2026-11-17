# Opera-Listen für die Simulation „5 Hoteltage“

Erzeugt mit `npx tsx scripts/simulation/opera/generate.ts` (prüfen ohne Schreiben: `--check`). **Alle Gäste sind erfunden** („Test NNN“).
Layout wie der Nachbau `tests/fixtures/opera/2026-10-28/`. Die App verlangt **fünf** Listen je Tag (Forecast, Departures, Arrivals, Traces, In House).
Je Tag: fünf PDFs, dazu je Liste die Rohdaten als JSON und `erwartung.json` (Soll-Zahlen für Import und Planung). `haus.json` = der ganze Bestand.

| | Tag 1 (Mo 16/11/26) | Tag 2 (Di 17/11/26) | Tag 3 (Mi 18/11/26) | Tag 4 (Do 19/11/26) | Tag 5 (Fr 20/11/26) |
|---|---|---|---|---|---|
| Drehbuch | Normal | Spitze | Engpass | Ruhig | Randfälle |
| Abreisen (davon Turns) | 40 (18) | 70 (15) | 38 (5) | 30 (2) | 20 (4) |
| Anreisen | 35 | 37 | 26 | 15 | 30 |
| Bleiber | 88 | 53 | 47 | 43 | 38 |
| zu reinigen (Abreisen + Bleiber) | 128 | 123 | 85 | 73 | 58 |
| belegt heute Nacht / Auslastung | 123 / 84.8 % | 90 / 62.1 % | 73 / 50.3 % | 58 / 40.0 % | 68 / 47.5 % |
| Wäschewechsel fällig (davon Tag-1-Gäste) | 30 (0) | 13 (0) | 4 (0) | 15 (12) | 4 (0) |
| VIP-Anreisen (davon Etage 5) | 5 (1) | 10 (6) | 4 (1) | 2 (0) | 4 (1) |
| Suiten-Abreisen ≥ 1,5 Credits (davon ≥ 1,75) | 9 (2) | 12 (1) | 28 (11) | 2 (0) | 0 (0) |
| Allergiker-Zimmer-Abreisen (218/219) | 0 | 0 | 2 | 0 | 0 |
| Late Check-out im Report / schon ausgecheckt | 3 / 0 | 3 / 3 | 4 / 2 | 2 / 0 | 2 / 1 |
| Traces: Zeilen / offen | 54 / 54 | 110 / 70 | 95 / 59 | 65 / 43 | 62 / 43 |
| … offen Hausmann / HK / FO / Technik | 21 / 20 / 8 / 5 | 30 / 28 / 7 / 5 | 30 / 20 / 6 / 3 | 24 / 11 / 5 / 3 | 18 / 16 / 5 / 4 |

## Was nicht in den Listen steht (passiert im Tagesverlauf von Hand)

- **Tag 2:** Front Office meldet 5 zusätzliche Check-outs (126, 127, 424, 429, 525) und 2 Late Check-outs (223, 532) — kein Nachimport.
- **Tag 3:** Die 5 vorzeitig Abgereisten fehlen in den Listen. Wäschewechsel der Tag-1-Gäste ist **noch nicht** fällig (erst Tag 4).
- **Tag 4:** Wäschewechsel der 12 Tag-1-Langbleiber fällig; Zimmer 132 wählt die Green Option.
- **Tag 5:** Zimmer 424 und 517 außer Betrieb (Forecast OOO = 2); Zimmerwechsel 315 → 219; fehlerhafte Dateien in `tag-5/randfaelle/`.
- Es gibt im Haus nur zwei Allergiker-Zimmer (218, 219); beide reisen an Tag 3 ab.
- Die Spalte „Lang“ (Gastsprache) steht nur in der In-House-Liste; die App liest sie bisher nicht (Regel B12 — wird in der Simulation geprüft).
