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

## Nachtrag (Antworten auf die offenen Fragen)
1. Supervisor darf Zimmer fremder Etagen ändern — bleibt so (keine Änderung).
2. Gast-DND beenden: Knopf „Gast-„Bitte nicht stören“ beenden“ im Modal (Zwei-Tap, setzt die Gästeanfrage auf erledigt, Logbuch).
3. Supervisor-Karte listet auch Anreise-Zimmer (nicht in den Zählern); Abreise-Zimmer „Vorgemerkt: vor nächster Anreise prüfen“, Anreise-Zimmer „Anreise heute: nochmal prüfen“.
4. Zimmerart aus Opera: Parser lesen den Code, Zuordnung Code → Zimmerart in den Einstellungen; gilt für Zimmer ohne Art, nichts wird geraten. Spaltenlage nur am Demo-Export geprüft.

## Offene Fragen
1. Echte Opera-Codes für die Zimmerarten: nach dem ersten Import erscheinen sie in den Einstellungen — bitte einmal zuordnen und prüfen, ob die Codes stimmen.
2. „Vorgemerkt" ist heute nur eine Markierung aus der Art des Zimmers. Soll es eine echte Merkliste werden (Zimmer bleibt vorgemerkt, bis die nächste Anreise geprüft ist)? Dafür bräuchte es Daten künftiger Anreisen und eine kleine Schema-Ergänzung.
