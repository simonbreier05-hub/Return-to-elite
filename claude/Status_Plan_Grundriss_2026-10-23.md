# Status: Plan-Schritt bearbeiten/bestätigen/benachrichtigen + Grundriss als einzige Zuteilungsansicht — 2026-10-23

Basis: Branch `feat/plan-grundriss` von `fix/import-betriebstag` (PR #40, aktueller Preview-Stand). Nicht nach `main` gepusht.

## Ist-Stand vorher (Recherche)
- Plan-Schritt (Planungstool) zeigte nur Zähler („3 Zimmerlisten …“) und Warnungen — Entwürfe waren weder einsehbar noch bearbeitbar; „Plan prüfen und bestätigen“ sprang nur nach `/supervisor/planning`.
- Dort (`AutoPlanPanel`) lag die eigentliche Bestätigung (`/api/autoplan/confirm` → `confirmProposal`), daneben der alte Planer (`/api/assignments/plan|apply`), Roster-„Verschieben“, Board-Modal-Zuteilung, Supervisor-Listen-„Verschieben“, `/floor-plan` mit eigener Massen-Zuteilung und `PlanningFloorPlanPanel`.
- Meldungen: nur `notifyReassignment` (Einzelmoves). Beim Bestätigen des Plans wurde **niemand** informiert; `assignments:applied` ging nur als Socket-Signal an Ansichten.

## Alle Stellen, die ein Zimmer binden/sperren (Ursachen)
1. `eligible()` in `src/lib/autoplan/cost.ts`: Stufe 1 bekam nie anspruchsvolle Zimmer (VIP/Suite/Allergie/Traces) → bei zu wenig Stufe 2/3 blieben sie **offen** (`UNASSIGNED`).
2. `fixedTo` (heute zugeteilt oder begonnen): Auswahlfeld im Entwurf `disabled`, und `confirmProposal` warf „ist fest zugeteilt“ → Zimmer ließen sich nicht umbiegen. Nach jeder Bestätigung waren alle Zimmer „fest“.
3. `confirmProposal`: begonnene Zimmer → immer Fehler, keine Rückfrage.
4. `moveRoomBetweenAttendants`: lehnte Zimmer ohne bisherige Kraft ab („use assign instead“).
5. Kein Bearbeiten im Plan-Schritt, kein Weg zu „offene Zimmer zuteilen“.
- „4 Listen bei 3 nötigen Kräften“: Der Vorschlag verteilt gleichmäßig auf **alle** Anwesenden (Fairness- und Zielband-Terme); nichts erlaubte, eine Kraft aus dem Plan zu nehmen. Der Hinweis „bitte abwählen“ verwies auf Schritt 2.

## Änderungen
**Engine/Server**
- `eligible()` immer wahr; Stufe 1 + anspruchsvoll = Strafterm `levelMismatch` (300) + Warnung `LEVEL1_DEMANDING`. Für Systemvorschläge der Live-Umverteilung bleibt `suitable()` (schiebt nie von sich aus anspruchsvolle Zimmer auf Stufe 1). Ergebnis: nach dem Vorschlag bleibt kein Zimmer offen, solange mind. eine Kraft anwesend ist. Etagenlimit/Credit-Ziel waren schon nur Warnungen.
- `confirmProposal`: keine „fest“-Sperre mehr; offene Zimmer nur mit `acceptOpen` (409 `OPEN_ROOMS`); begonnene/fertige Zimmer nur mit `confirmStarted` (409 `STARTED_ROOMS`), Status bleibt, Audit `ROOM_MOVED_STARTED`; eine Transaktion; Betriebstag/Zeit/Nutzer am `AutoPlanProposal`; danach `notifyPlanConfirmed`.
- Neu `src/lib/rooms/notifyPlan.ts`: „Dein Plan für heute: N Zimmer, X Credits.“ an jedes Zimmermädchen mit neuer/geänderter Liste, Hausmann (offene Aufgaben), Supervisor + Duty Manager (Zusammenfassung); nicht an den Bestätigenden; `dedupeKey` gegen Doppelte; Notification + Socket `notification:new`. Spätere Grundriss-Änderungen: weiter `notifyReassignment` (nur Betroffene), keine Parallelstruktur.
- `/api/rooms/[id]/assign` und `/move`: begonnene Zimmer 409 `STARTED_ROOM` → mit `confirmStarted`; Zimmer ohne Kraft lassen sich per `move` zuteilen.
- `/api/rooms`: Housekeeper sehen fremde Zuteilungen nicht mehr (`assignedTo`/`assignedToId` nur für eigene Zimmer).
- Neu `GET /api/assignments/day` (zu reinigende Zimmer aus `DayRoomPlan` + anwesende Kräfte). `ApiError` trägt jetzt `code`/`data`.
**Oberfläche**
- Plan-Schritt: „X von Y zugeteilt“, Zähler „N offen“, Kraft-Zeilen mit Credits/Zielband, „Nicht einplanen / Wieder einplanen“ (neuer Vorschlag ohne diese Kraft → Supervisor entscheidet bei Personalüberhang), „Entwurf ansehen und bearbeiten“ bzw. „Offene Zimmer zuteilen“.
- `PlanEditorWindow` (Vollbild-Fenster mit ✕ Schließen/Esc): Tabs Zimmerlisten (= `PlanningFloorPlanPanel` im Entwurfsmodus, beide Zuteilungsmodi, Zimmer-Chips, Credits-Summe) · Supervisor-Listen · Hausmann-Liste.
- `PlanConfirmDialog`: Zusammenfassung (zugeteilt/offen, Credits je Kraft, Warnungen); „N Zimmer sind noch offen. Trotzdem bestätigen?“; Rückfrage bei begonnenen Zimmern; danach „Alle Betroffenen sind informiert“ + Link zur Zuteilung.
- `PlanningFloorPlanPanel`: Entwurfsmodus, Ansicht „Grundriss | Liste je Zimmermädchen“, Rückfrage-Dialog für begonnene Zimmer, „Offen“-Spalte, Zähler „X von Y Zimmern zugeteilt“.
## Entfernte/umgeleitete Oberflächen (nur UI; APIs bleiben)
- `/supervisor/planning` (alter Planer inkl. `AutoPlanPanel`): entfernt, Weiterleitung auf `/floor-plan` (`next.config.js`). Dabei entfallen als UI: „Plan auf das Team anwenden“, Personalbedarf/Rückstellen (`defer`) und die Schaltfläche „Mehr Kräfte anfragen“ (API `/api/notifications` POST bleibt).
- Roster (Supervisor-Board): „Verschieben zu …“ → Link „Zuteilung im Grundriss ändern“.
- Board-Zimmerfenster: Zuteilungs-Auswahl → Anzeige + Link zum Grundriss.
- Supervisor-Arbeitsliste: „→ Verschieben“ → Link zum Grundriss.
- `/floor-plan`: Massen-Zuteilung ersetzt durch `AssignmentFloorPlan` (nur Supervisor/Duty Manager, `PlanningFloorPlanPanel` + Live-Umverteilungskarten); andere Rollen sehen nur den Orientierungs-Grundriss ohne Zuteilungen.
- Behalten: Arbeitsliste im Housekeeper-Hub, Hausmann-Liste, `RedistributionCards` (Systemvorschläge, jetzt auf `/floor-plan`).

## Eine Wahrheit
Nach Bestätigung gilt `Room.assignedToId/assignedOn/routeOrder`; Board, Roster, Housekeeper-/Supervisor-/Hausmann-Listen und Grundriss lesen dort. Test vergleicht Board-API, Housekeeper-Liste und DB. Live-Updates über `assignments:applied`/`room:update` (Board und `AssignmentFloorPlan` laden nach).

## Tests
`npx vitest run`: 68 Dateien, 561 Tests grün. Neu: `tests/plan/planConfirm.integration.test.ts` (kein Zimmer offen auch nur mit Stufe 1; offene Zimmer nur mit Bestätigung; jede Kraft darf jedes Zimmer; Meldungen genau an Betroffene; keine Doppelten/Gastdaten; Umzuteilen nach Bestätigung; begonnene Zimmer; Housekeeper dürfen nicht zuteilen/sehen; alle Ansichten = derselbe Stand), Engine-Test „bei beliebigem Team bleibt nichts offen“, Plan-Schritt-Rendertest. Angepasst: 3 Tests, die die alte Sperre erwarteten. `tsc` sauber, `npm run build` erfolgreich.
Sichtprüfung (Chromium, Wegwerf-DB): `/floor-plan` bei 390 px und 820 px (iPad hoch), Grundriss- und Listenansicht, kein horizontales Scrollen am Seitenende; dabei Korrektur: Uhr im Kopf erst ab ≥ 1024 px mit Datum, im Bereich 768–1023 px ausgeblendet (sonst Überlauf). Der Plan-Schritt selbst (Schritt 4) konnte lokal nicht durchgeklickt werden (braucht importierte Listen) — nur per Rendertest abgedeckt.

## Migration
Keine Schema-Änderung in diesem Prompt.

## Deploy-Status
Siehe Abschlussmeldung im Chat.

## Offen / Fragen
1. Supervisor- und Hausmann-Liste im Entwurf: Supervisor-Listen sind nur einsehbar (Ändern über „Etagen ändern“ = Schritt 3), die Hausmann-Liste ist nur einsehbar (Aufgaben kommen aus den Traces). Soll hier mehr bearbeitbar sein?
2. „Mehr Kräfte anfragen“ und „Zimmer auf morgen zurückstellen“ gab es nur im alten Planer. Sollen sie im Grundriss wieder auftauchen?
3. Personalüberhang: bewusst „alle gleichmäßig + Nicht einplanen per Knopf“. Alternative: automatisch die nicht benötigte Kraft weglassen — wer soll das sein (Teilzeit/Azubi zuerst)?
4. Das Dev-Kopfzeilen-Menü („Rolle wechseln“) ist bei 820 px zu breit (nur mit Dev-Login sichtbar, schon vorher so).

## Nachtrag (Antworten auf die offenen Fragen)
1. Supervisor-/Hausmann-Liste im Entwurf: bleibt wie es ist.
2./3. Kräfte hinzu- und abwählen: im Plan-Schritt über „Nicht einplanen“/„Einplanen“ für **alle** Kräfte des Teams (neuer Vorschlag), und nachher im Grundriss (`/floor-plan`, Abschnitt „Wer arbeitet heute?“, ein Tap → `POST /api/housekeepers/[id]/absent`; Zimmer einer abgewählten Kraft zählen als offen, ein Umverteilungsvorschlag erscheint). „Mehr Kräfte anfragen“/„Zurückstellen“ entfallen bewusst.
4. Dev-Kopfzeile bleibt unverändert.
