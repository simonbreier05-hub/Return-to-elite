# Status: Fünfte Planungsliste (Tagesbelegung) + Einreichungs-Fix — 2026-10-20

## Ist-Stand vorher
- Vier Listen (`IMPORT_TYPES`): Forecast, Departures, Arrivals, Traces. Gespeichert als `ImportBatch` (Status PREVIEW → APPLIED), Zeilen als `ImportRow`.
- Es gab nur **ein** Gate, nur im Browser: `listsReady()` in `src/lib/planung/model.ts` prüfte allein `DEPARTURES`.
- Ein Tagesbelegungs-Import existierte nicht (nur abgeleitet aus Departures-Zeitraum / `Room.occupancy`).

## Ursache
- `listsReady` = `!!applied.DEPARTURES` → Weiter/Planung freigegeben, sobald Departures da sind (je nach Reihenfolge schon bei 2 von 4).
- Server hat nichts geprüft: `/api/dayplan/merge` und `/api/autoplan/propose` verlangten nur Departures.

## Geändert
- Neuer Listentyp `INHOUSE` ("In House / Tagesbelegung"): `domain.ts`, `import/types.ts`, `import/schema.ts` (strikte Whitelist), `import/parsers.ts` (`parseInHouse`), `import/readFile.ts`, `import/detect.ts`, `import/store.ts` (`ROW_KIND`, `dataStatus` über alle Typen).
- Gate: neu `src/lib/import/readiness.ts` (`missingLists`/`listsComplete`); `listsReady` nutzt es → alle fünf nötig. Server: `missingAppliedLists()` in `store.ts`, 409 in `api/dayplan/merge` und `api/autoplan/propose`.
- UI: fünfter Slot im Planungstool (`PlanungClient.tsx`), Texte (`translations.ts` de/en), Fortschrittsring generisch, Import-Seite zeigt Typ in Listen/Status.
- `scripts/morning-demo.ts` an den neuen Typ angepasst; Doku `docs/opera-import.md`, `CLAUDE.md`.
- **Migration: nein** (`type`/`kind` sind Strings). Keine DB angefasst, kein `db push`.
- Branch: `feat/fuenf-listen-tagesbelegung` (von `main`; es gibt keinen separaten Preview-/Dev-Branch im Repo).

## Tests
- `npx vitest run`: 65 Dateien, 528 Tests grün (neu: `tests/importInhouse.test.ts`, angepasst: `tests/planung/model.test.ts`).
- `npx tsc --noEmit` sauber, `npm run build` erfolgreich.
- Mobil (390 px): nicht visuell geprüft (nur Slot-Liste/Ring erweitert, bestehende Render-Tests grün).

## Preview-Deploy
- Nicht ausgelöst/geprüft (kein Zugriff aus dieser Sitzung). Branch wird gepusht; Preview wie bisher aus dem Branch aktualisieren. Nicht nach `main`.

## Offen / unsicher
1. **In-House-Layout ist angenommen** (Spalten wie Departures). Bitte einen echten Opera-„In House"-Export (anonymisiert) bereitstellen.
2. ~~Kein Beispiel-PDF~~ erledigt: `buildInHousePdf`, `/api/import/sample?file=inhouse`, Fixture `inhouse_nachbau.pdf`, Button auf der Import-Seite.
3. In-House-Daten werden gespeichert und geprüft, aber noch nicht in `mergeDay` als Abgleich (Bleiber-Plausibilität) genutzt.
4. Kein Integrationstest für die 409-Antworten der Routen (Gate-Logik selbst ist unit-getestet).
5. Soll das Gate auch das Geschäftsdatum prüfen (alle fünf für denselben Tag)? Aktuell zählt jeder übernommene Stand.

## Nachtrag
- Live-Uhr mit Datum (Berlin) im AppShell-Banner: `src/components/LiveClock.tsx`.
