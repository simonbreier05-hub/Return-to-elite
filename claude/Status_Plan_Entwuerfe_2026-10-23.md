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

## Nachtrag (Antworten)
1. Zuständigkeit je Etage ist richtig (Zimmer ergeben sich aus den Etagen) — unverändert.
2. Hausmann-Meldung + Live-Einsicht umgesetzt:
   - Beim Bestätigen werden Hausmann-Zuteilungen in derselben Transaktion gespeichert; jeder Hausmann bekommt „Dein Plan für heute: N Aufgaben (M dir zugeteilt)“. Spätere Änderung über `PUT /api/planung/houseman` meldet nur die Betroffenen.
   - Erledigt/Wieder geöffnet (`PATCH /api/traces/[id]`): Supervisor der Etage werden gemeldet (nur Zimmer + Etage), der Duty Manager sieht alle Meldungen.
   - Duty Manager: neues Fenster „Live-Listen“ im DM-Board (Tabs Zimmermädchen / Supervisor / Hausmann; Fortschritt, wer was hat, was erledigt ist und von wem; Socket-Live). Nicht abgedeckte Etagen (kein Supervisor) werden markiert.
   - Supervisor sieht nur zugeteilte Etagen: Zimmermädchen-Liste (war schon so) und jetzt auch die Hausmann-Liste (ohne Etage: leer). Hausmann: eigene + nicht zugeteilte Aufgaben.
   - Tests: 3 neue Integrationstests (Meldungen, Erledigt-Sichtbarkeit, Live-Einsicht/Rechte); keine neue Migration (Spalte `Trace.assignedToId` aus dem vorigen Schritt).

## Nachtrag 2 (Antworten: Meldungen für alle + Übersicht)
- **Jeder bei Updates seiner Liste benachrichtigt:** neuer Baustein `notifyListUpdate` — nach einem Nachimport (nicht beim ersten Import des Tages) und bei manueller Änderung der Reinigungsart bekommt jede Person genau eine Meldung: Zimmermädchen („Deine Liste hat sich geändert — Zimmer 101: Bleiber → Turn; neuer Hinweis in 103“), Hausmann („N neue Aufgaben (Zimmer …)“), Supervisor der Etage (Zähler), Duty Manager (Zusammenfassung). Die alte rollenweite Sammelmeldung (`DAY_PLAN_CHANGED` an alle Housekeeper) ist ersetzt. Zusätzlich bestehend: Zimmer verschoben, Plan bestätigt, Hausmann-Zuteilung, Aufgabe erledigt; neu: geänderte Etagen melden den Supervisor (`assignFloors`).
- **Übersichtlicher „welche Zimmer zu reinigen / welcher Service“:** neue Ansicht „Zimmer und Service heute“ (eigene Seite `/supervisor/service` mit Knopf im Supervisor-Board — von der Grundriss-Seite wieder entfernt —, Duty-Manager-Live-Listen, Plan-Fenster): große Zahl „N Zimmer heute zu reinigen“, Kacheln als Filter (Turn, Abreise, Bleiber + Wäsche, Bleiber, Anreise = keine Reinigung, Besonderheiten), darunter je Etage eine ruhige Liste: Zimmer · Service-Marke · VIP/Anreisezeit/Allergiker/DND · Sonderleistungen (Twin, Zusatzbett, Hinweise) · zugeteilte Kraft · Credits. Supervisor sehen nur ihre Etagen, Duty Manager alle; keine Gastnamen. Sichtprüfung 390 px/iPad (Kacheln auf iPad 3×2/6×1, kein Überlauf).
- Tests: 581 grün (neu `tests/plan/serviceAndUpdates.integration.test.ts`, angepasste Merge-/assignFloors-Tests).
