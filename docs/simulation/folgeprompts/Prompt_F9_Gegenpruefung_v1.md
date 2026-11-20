# Prompt F9 — Funde der Gegenprüfung nach dem Merge (v1, 20.11.2026)

> **Start im Terminal:** im Ordner `Return-to-elite` `git switch fix/basis-simulation-v2`, `claude` starten (Modell mit `/model` wählen) und eingeben:
> `Lies docs/simulation/folgeprompts/Prompt_F9_Gegenpruefung_v1.md vollständig und arbeite ihn ab. Beginne mit Schritt 0.`

Du arbeitest im Repo StayClean (`Return-to-elite`). Simon hat keinen Coding-Hintergrund: Berichte in einfacher Sprache. Lies zuerst `CLAUDE.md`, `docs/simulation/Entscheidungen_Hotel_Simulation_v2_2026-11-16.md` (inkl. **Nachtrag 20.11., N1**) und im Artifact „StayClean Fix-Pakete“ (https://claude.ai/artifact/Dhi7etZ46AUwgNdBFjyZ8C) den Abschnitt „Gegenprüfung nach dem Merge“. Dort stehen alle Funde mit Schritten zum Nachstellen.

## Hintergrund

Nach dem Merge von S1–F8 in `fix/basis-simulation-v2` (29a63cf) haben vier Prüf-Agenten Code und App getestet (Sicherheit, Betriebslogik, Browser-Test Leitung, Browser-Test Gast/Teams + Testsuite). Die Funde „Hoch“ müssen vor einem Betrieb mit echten Gästen behoben sein.

## SCHRITT 0 — Ist-Abgleich (keine Codeänderung, Bericht max. 40 Zeilen)

1. `git status` sauber, Branch `fix/basis-simulation-v2` aktuell (`git fetch origin` mit expliziten Refspecs; neue Commits auf `design/glass`? melden).
2. Jede Datei:Zeile-Angabe unten gegen den Code prüfen; Abweichungen auflisten. Jeden Fund A1–A7 kurz nachstellen (Test oder Skript auf Wegwerf-DB) und sagen: bestätigt / nicht nachstellbar.
3. Widersprüche zu den Entscheidungen sofort melden. Geplante Schema-Änderungen nennen (nur additiv, beide Prisma-Dateien).
**STOPP:** Bericht an Simon, auf OK warten.

## Aufgaben — Teil A (Hoch, Pflicht)

**A1 Gastnamen nur für berechtigte Rollen.** `GET /api/arrivals` (`src/app/api/arrivals/route.ts`, nur `requireAuth`) → nur Front Office, Supervisor, DM. `GET /api/excursions` → Concierge, Front Office, Supervisor, DM; andere Rollen bekommen nichts (oder nur Zimmer + Zeit ohne Namen/Notiz, falls ein Bildschirm das braucht — prüfen, wer die Route aufruft). Weitere `GET`-Routen mit `guestName` suchen und gleich behandeln.

**A2 Gastcode nie in Mitarbeiter-Antworten.** `GET /api/rooms` (`src/app/api/rooms/route.ts`) und alle Antworten mit vollem Room-Objekt (`status`, `assign`, `ooo`, `bulk-assign` …) liefern `guestAccessCode`. Zentral lösen (Prisma `omit: { guestAccessCode: true }` als Standard in `src/lib/db.ts` o. ä.); nur die Gästezugang-Seite (Supervisor/DM) und die Gast-Auflösung lesen den Code ausdrücklich.

**A3 Alter Gast-Tab bleibt beendet (S1-Fehler).** `src/components/guest/useGuestStatusFeed.ts` setzt `ended` wieder auf `false`, sobald das Zimmer einen neuen Gast hat → der offene Tab des Vorgasts zeigt den neuen Gast. Lösung: Die Gastseite ist an *ihren* Aufenthalt gebunden (Stay-Id/Kennung aus der ersten Antwort, Server prüft, dass der aktive Aufenthalt noch derselbe ist). Einmal beendet → Abruf stoppen und Seite neu laden (damit der Name auch aus den Next-Seitendaten im DOM verschwindet). Neutral spätestens nach ~15 s bleibt.

**A4 Check-in im Front Office setzt den Aufenthalt auf „im Haus“.** `PATCH /api/arrivals/[id]` mit `CHECKED_IN` setzt heute nur `Arrival.status`; der passende `Stay` (Zimmer + Anreisetag) bleibt EXPECTED. Folgen laut Prüfung: Check-out-Rücknahme trotz eingechecktem neuen Gast (`src/app/api/rooms/[id]/checkout/route.ts` DELETE) → Gastbildschirm grüßt den Vorgast; Zimmerwechsel am Anreisetag 409 (`src/lib/rooms/roomChange.ts`); Gastbildschirm des neuen Gasts neutral bis zum nächsten Import. Lösung: Check-in setzt den Stay auf IN_HOUSE (nur wenn der Vorgast ausgecheckt ist, Regel „Vorgast noch da?“ aus F3); Rücknahme des Check-outs sperren, sobald der neue Gast eingecheckt ist. Der Import darf IN_HOUSE aus dem Check-in nicht zurücksetzen.

**A5 F1-Lücke beim Nachimport.** Ein gestern nicht fertiges Zimmer (DND/BLOCKED, IN_PROGRESS, PICKUP), das der erste Import heute als DIRTY markiert, wird von einem späteren Nachimport ohne dieses Zimmer auf INSPECTED gesetzt (`src/lib/dayplan/boardStatus.ts` `fromBefore` prüft nur den Zeitstempel, den der Hub heute selbst gesetzt hat; Marker in `src/lib/dayplan/merge.ts`). Lösung: Status/Zeitpunkt vor der ersten Hub-Änderung des Tages merken und dagegen prüfen. Test mit Zimmer 305.

**A6 Gast kann „Bitte nicht stören“ immer aufheben.** `src/lib/guestRateLimit.ts`: Grenze 5/Stunde gilt für alle Aktionen zusammen, auch `dnd-cancel` (und Green zurücknehmen) → 429, Zimmer bleibt ungereinigt. Aufheben/Zurücknehmen nie begrenzen; die übrigen Grenzen je Aktion sinnvoll trennen (Vorschlag in Schritt 0 nennen). Fehlermeldungen der Gast-API auf der Gastseite in der Gastsprache anzeigen (über `code`, nicht `e.message`), z. B. „Zu viele Anfragen …“.

**A7 Zuteilungsvorschlag nach Entscheidung N1.** Reihenfolge: (1) Obergrenze der Zimmeranzahl je Kraft (Zimmervorgabe bzw. feste Obergrenze aus den Einstellungen, heute „12 – wird nie überschritten“) ist **hart**; (2) danach eingeteilte Etagen, Stufe 1, Suiten, „keine Suiten“, Fairness. Was so nicht passt, kommt in den **Float** („Nicht zugeteilte Zimmer“), sichtbar in `/planung` und im Grundriss; der Duty Manager teilt sie von Hand zu (Rückfragen wie bisher). Hinweis ganz oben: „N Zimmer im Float: 214, 305 … — bitte von Hand zuteilen“. Prüffall aus dem Browser-Test: Etage 5 nur Lucia, Etage 1 nur Ingrid → Vorschlag hält das ein; Maria bekommt nie 13 bei Obergrenze 12. Den Hinweis-Zähler der Leiste („0 Hinweise“ bei 13–17 Hinweisen) korrigieren und Hinweise oben statt unten zeigen. `CLAUDE.md` (Abschnitt F4), Kommentar `src/lib/autoplan/cost.ts` und `tests/planConfirm.integration.test.ts` auf N1 anpassen.

## Aufgaben — Teil B (Mittel, wenn Zeit bleibt; sonst als offen melden)

- B1 Persönlicher Link `/g/s/…`: erst nach Check-in gültig (gleiche Regel wie `roomStayState`); Feed und DND an den eigenen Aufenthalt binden (`GuestRequest.stayId` setzen).
- B2 `workorder:update` ohne `photoPath` für Rollen ohne Foto-Recht (`planBroadcast`, Strip-Satz wie bei Gastnamen).
- B3 Nachimport: ausgecheckte Abreise bleibt „frei“ (`merge.ts`, `occupied = false` bei CHECKED_OUT); vorzeitige Abreise (Handeingabe) wird vom Import nicht überschrieben.
- B4 DM-Glocke: Kopien nicht doppelt (je Ereignis bündeln statt je Empfänger), „Dringend“ nur für wirklich Dringendes; Konfliktmeldung auch bei geänderter Ankunftszeit und Late Check-out aus dem Import.
- B5 Zimmerwechsel: Zielprüfung in der Transaktion wiederholen.
- B6 Native `window.confirm/prompt` durch App-Dialoge mit klaren Knöpfen ersetzen (Wäsche-Frage „Gewechselt / Nicht gewechselt“, Gast noch im Zimmer, Aufschieben, Ausflug löschen, Sperre).
- B7 Zahlen gleich zählen: Wäschewechsel nach „ja“ erledigt; Freigabe-Zahl in Menü, Grundriss und Meldung gleich; Tagesfortschritt vs. „Gereinigt“; kein Fehlalarm „Zahlen passen nicht“ nach Handeingaben des Front Office.
- B8 Housekeeper: Notizfeld in fremden Zimmern gar nicht anbieten; 403 immer sichtbar melden. Meldungs-Banner verdeckt keine Fenstertitel; Zähler Banner = Glocke.
- B9 FO Abreisen: Leiste „N als ausgecheckt melden“ bleibt sichtbar (sticky), Häkchen ≥ 44 px; Mehrfach-Check-out meldet, welches Zimmer scheiterte, und lädt neu.

Teil C (Niedrig) nur notieren, nicht umsetzen: CORS des Live-Kanals, verschachtelter Sperrgrund im Logbuch, englische Begründungstexte/Arten, „Zimmermädchen“, abgeschnittene Texte, kleine Kästchen.

## Testsuite aufräumen (Pflicht, klein)

- `.gitattributes` mit `*.mjs text eol=lf` (behebt `tests/ui/designTokens.test.ts` unter Windows).
- `tests/planConfirm.integration.test.ts` auf N1, `tests/redistribute.test.ts` auf Zimmer statt Credits (Plan-1b), `import2810`-Test mit eigenem Zeitlimit.
- Laufzeit der Zuteilung: Gesamtbudget so begrenzen, dass ein Vorschlag auf dem Laptop unter 3 s bleibt (heute 4,4–5,5 s: 3 × 2 s in `src/lib/autoplan/weights.ts`), ohne Qualitätsverlust im Zufallstest.

## Abnahme

- Für A1–A7 je ein Test, der vor dem Fix rot und danach grün ist (A3 und A4 als Integrationstest auf Wegwerf-DB).
- `npm test` vollständig grün (keine bekannten Ausreißer mehr), `npm run build` grün.
- Kurzer Browser-Nachweis (Playwright, iPad-Format, Wegwerf-DB): alter Gast-Tab bleibt nach neuem Check-in neutral; DND aufheben nach 6 Anfragen geht; Vorschlag mit Etage 5 nur Lucia.

## Grenzen

- Eigener Branch von `fix/basis-simulation-v2`, z. B. `feature/f9-gegenpruefung`. `main`, `design/glass` und Produktion nie anfassen, kein Force-Push, **nicht pushen ohne Rückfrage**.
- Nur lokale Test-Datenbank, nur erfundene Gastdaten. Migrationen nur additiv, Backup vorher.
- A1/A2/A4 ändern Rechte bzw. Gastzugang: vor dem Merge STOPP und Simon fragen.

## Abschluss

- `CLAUDE.md` ergänzen (höchstens 5 Zeilen).
- Abschlussbericht für Simon in einfacher Sprache, höchstens 20 Zeilen, mit Abnahme-Checkliste für das iPad; Ergebnis als neuer Abschnitt „F9“ ins Artifact „StayClean Fix-Pakete“ (URL oben, vorher lesen).
- Erst nach Simons OK: `git switch fix/basis-simulation-v2 && git merge --no-ff <Branch>`; dann `00_Reihenfolge_v1.2.md` (Zeile 10) auf „gemergt“ setzen.
