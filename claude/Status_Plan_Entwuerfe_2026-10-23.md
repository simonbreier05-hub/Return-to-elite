# Status: Entwürfe im Plan-Schritt anklicken, ansehen, bearbeiten (Prompt 2b) — 2026-10-23

Branch `feat/plan-grundriss` (PR #41, gestapelt auf #40). Nicht nach `main` gepusht.

## Ist-Stand (Prüfung Prompt 2)
Schon vorhanden aus Prompt 2: Entwurfs-Fenster (`PlanEditorWindow`), Grundriss im Entwurfsmodus, Bestätigungsdialog, Meldungen beim Bestätigen, keine Sperren, Auto-Planung ohne Regel-Filter, „Nicht einplanen/Einplanen“, `/floor-plan` als einzige Zuteilungsansicht.
Fehlte: Karten/Zeilen/„offen“ waren nicht anklickbar (nur ein Knopf darunter), Supervisor- und Hausmann-Tab nur lesend, kein „Zimmer aus offenen hinzufügen“, keine Summe gegen Zielband je Zimmermädchen, keine Rückfrage/Rückgängig bei „Nicht einplanen“.

## Ursache „34 von 57 zugeteilt, 23 offen“ (obwohl alle unter Credit-Ziel)
Keine Regel (Etagenlimit/Credit-Obergrenze/Sperr-Flag) — die Engine ließ die Zimmer außen vor: Zimmer, die **heute schon einer Kraft zugeteilt** waren (`assignedOn = heute`, z. B. aus einem früheren Lauf), die aber **nicht im heutigen Team** ist, galten als „fest“ und wurden in `proposePlan` ignoriert (`splitFixed` → `external`). Die Oberfläche rechnet aber über **alle** Zimmer des Tages (`buildResult(input, …)`) und zählte diese als „offen“; beim Bestätigen hätte `confirmProposal` sie sogar ausgetragen. Folge: die vier Kräfte bekamen nur den Rest (~8 Credits statt 12,5–15,5). Test `tests/plan/planConfirm.integration.test.ts` (schlug vor dem Fix fehl).
Fix: `morningInput` (`src/lib/autoplan/load.ts`) gibt nicht begonnene Zimmer einer nicht eingeplanten Kraft frei (werden neu verteilt); begonnene bleiben bei ihr und sind nicht im Entwurf.

## Änderungen
- Karten (Zimmerlisten/Supervisor/Hausmann), Kraft-Zeile (→ Liste je Zimmermädchen) und „N offen ›“ (→ Grundriss mit markierten offenen Zimmern) öffnen das Vollbild-Sheet (Knopf „✕ Zurück zum Plan“, Esc).
- Zimmerlisten: je Zimmermädchen eine Liste mit Zimmer/Etage/Typ/Credits, Summe gegen Zielband (rot nur als Hinweis), Zwei-Tap (Zimmer → Ziel), Entfernen („Offen“), „+ Zimmer aus den offenen hinzufügen“; zusätzlich Grundriss mit beiden Modi (Zimmer → Zimmermädchen / Zimmermädchen → Zimmer).
- Supervisor-Tab editierbar: je Etage ein Supervisor wählbar (Zimmeranzahl/-nummern der Etage sichtbar); gespeichert erst nach erfolgreichem Bestätigen (`saveFloors`).
- Hausmann-Tab editierbar: Hausmann-Aufgaben des Tages, je Aufgabe Hausmann oder „Alle“ wählbar; **neue Spalte** `Trace.assignedToId` (additiv, beide Schemas); Hausmann sieht eigene + nicht zugeteilte Aufgaben; `PUT /api/planung/houseman` (nur Supervisor/Duty Manager) beim Bestätigen.
- „Nicht einplanen“: Rückfrage, wenn die Kraft schon Zimmer hat („werden neu verteilt“), Leiste „… ist nicht eingeplant – Rückgängig“; „Einplanen“ holt sie zurück (gleicher Vorschlag wie vorher).
- Keine Meldungen im Entwurf (erst bei Bestätigung, wie in Prompt 2).

## Tests
`npx vitest run`: 69 Dateien, 572 Tests grün (neu u. a. `tests/plan/draftEdit.test.ts`: verschieben/entfernen/hinzufügen, jedes Zimmer jeder Kraft, abwählen/zurückholen, nie offen; Integrationstests für die Ursache und für Hausmann-Zuteilung inkl. Rechte; Rendertest für anklickbare Karten/Zeilen). `tsc` sauber, Build erfolgreich.
Sichtprüfung 390 px/iPad: Sheet nicht lokal erreichbar (braucht importierte Listen) — Layout nutzt dieselben Bausteine wie `/floor-plan` (dort geprüft); bitte in der Preview ansehen.

## Migration
Additiv: `Trace.assignedToId String?` (beide Schema-Dateien). Kein lokales Dev-DB-Backup möglich (es gibt keine Dev-Datei); Railway-Start ergänzt nur die Spalte in `postgres-preview`.

## Offen / Fragen
1. Supervisor-Zuteilung gilt je **Etage** (so speichert StayClean sie); „Zimmer eines Supervisors“ einzeln gibt es nicht. Reicht das?
2. Hausmann-Zuteilung sendet beim Bestätigen noch keine Meldung an den Hausmann (nur die allgemeine Plan-Meldung). Soll er „N Aufgaben für dich“ bekommen?
