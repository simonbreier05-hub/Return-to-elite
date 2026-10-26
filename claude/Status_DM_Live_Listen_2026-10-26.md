# Status: Duty-Manager Live-Listen (Prompt 5) — 2026-10-26

## Ist-Stand (vorher)
- Erster Tab im DM-Board = `LiveListsPanel` (Reiter Übersicht, Zimmermädchen, Supervisor, Hausmann).
- Zimmerzeilen (`RoomRowView`) zeigten Nummer, Status, Art, Wäsche, VIP, DND, Gast, Traces — aber nicht anklickbar, ohne Zimmertyp, Mängel, Gästewunsch, Trace-Anzahl.
- `RoomDetailModal` war reine Ansicht (Slot `actions` nur für Housekeeper).
- Supervisor-Reiter: nur Fortschrittsbalken, nicht ausklappbar. Kein Weg, Traces zu ändern/anzulegen oder Notiztexte zu ändern. Zimmer-Logbuch (AuditLog mit `roomId`) wurde nirgends angezeigt.
- Schema: keine Änderung nötig (keine Migration, kein Backup nötig).

## Änderungen
- **Zeile**: Typ, Art, Wäsche, VIP, DND, Mangel (n), Reinigungs-/Gästewunsch, Traces (n) + voller Text (bricht um), Status — alles Symbol **und** Wort; Legende (`RowLegend`); ganze Zeile ≥ 44 px antippbar.
- **Modal**: dasselbe `RoomDetailModal` + neuer Slot `editor` → `RoomEditPanel`: Status (nur gültige Übergänge), Bitte-nicht-stören, Zuteilung (mit „Trotzdem ändern?" bei begonnenen Zimmern), Traces hinzufügen/ändern/erledigen, Notiz ändern, Zimmer-Logbuch. Alles per Zwei-Tap.
- **Server**: `GET /api/rooms/[id]/detail`, `POST /api/rooms/[id]/traces`, `PATCH /api/rooms/[id]/traces/[traceId]`, `PATCH …/notes/[noteId]` erweitert um `body`. Logbuch und Live-Meldung ohne Texte.
- **Supervisor-Reiter** (DM): ausklappbar, eingeklappt Fortschritt + Zimmerzahl, Zustand bleibt (sessionStorage) auch bei Datenaktualisierung und Reiterwechsel.
- **Live**: Listen und Modal laden bei `trace:update`, `note:new/update`, `room:update` im Hintergrund nach, ohne Neuladen.
- **Rollen**: nur Supervisor/DM ändern; Housekeeper: Zeilen nicht antippbar, keine Mängel/Wünsche/Typ in ihren Daten, Gast nur Kurzname, keine Altersangaben.
- Fund beim Browser-Test: Fenster in transformierten Karten erschien weit unten → `createPortal` an `body`.

## Tests
- Neu: `tests/dmLive/roomEdit.integration.test.ts` (Rollen, Detail ohne Alter/Vornamen, Trace add/edit/done, Logbuch ohne Text, Live-Meldung, Notiz, Statusübergänge), `tests/dmLive/rows.test.ts` (Zeile, Legende, Verdrahtung live/Aufklappen/Zwei-Tap).
- Gesamt: 76 Dateien / 641 Tests grün, `tsc` sauber, Build ok.
- Browser (Playwright, Produktions-Build): Desktop 1280, iPad 820, Handy 390 — Zeile antippen, Modal, Trace anlegen (2 Taps), Trace erscheint live in der Liste, kein Neuladen, kein horizontaler Überlauf, 0 JS-Fehler, Supervisor-Karte bleibt offen nach Reiterwechsel.

## Deploy
- Siehe PR; Preview-Quelle auf `feat/dm-live-listen` (keine Schemaänderung). Production unberührt.

## Offene Fragen
1. Soll ein Supervisor im Modal auch Zimmer fremder Etagen ändern dürfen? (Jetzt: ja, wie bisher bei Zuteilung.)
2. Soll „Bitte nicht stören" auch das Gast-DND (Gast-Bildschirm) aufheben können? (Jetzt nur die Mitarbeiter-Sperre.)
3. Soll die Supervisor-Karte auch die Zimmer ohne Reinigung (Anreise) zeigen? (Jetzt nur Service-Zimmer.)
4. Zimmertyp zeigt „Typ noch nicht erfasst", solange er nicht gepflegt ist — soll er aus den Opera-Listen kommen?
