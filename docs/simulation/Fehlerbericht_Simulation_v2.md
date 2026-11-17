# Fehlerbericht Simulation „5 Hoteltage“ (v2)

Stand: 16.11.2026 · Branch `test/simulation-v2` (nur lokal) · App-Stand `design/glass` @ `602a58b` · lokale Test-Datenbank (SQLite), nur erfundene Gäste.

Rohdaten: `tests/simulation/runs/2026-11-14/` (Protokolle je Tag und Rolle, Messungen, Rollen-Feedback in `wissen/`). Testfälle: `tests/simulation/befunde.test.ts`. Folgeprompts: `docs/simulation/folgeprompts/`.

**Wichtig:** Alle Soll-Regeln (P1–P14, B1–B12) sind **Annahmen von Simon**, vom Hotel noch nicht bestätigt. Wo ein Befund an einer Regel hängt, steht „Annahme“ dabei.

---

## 1. Zusammenfassung

Gespielt wurden ein Einrichtungstag und fünf Hoteltage (Mo 16.11. bis Fr 20.11.2026) mit allen Rollen: Duty Manager, zwei Supervisoren, neun Housekeeper, Hausmann, Techniker, Front Office, Concierge und Gäste. Die Rollen haben die App nur über die Oberfläche bedient, ohne Code zu lesen.

**Was trägt**

- Der Morgen ist stark. An allen fünf Tagen stimmten die Importzahlen mit dem Soll überein, und der Plan war jeden Tag vor 08:00 bestätigt (07:30 bis 07:32).
- Handzuteilungen bleiben beim Bestätigen erhalten.
- Wäschewechsel und Green Option (Gast verzichtet auf Wäschewechsel) rechnen an allen Tagen richtig.
- Die Rechtegrenzen greifen: Housekeeper, Concierge, Hausmann und Front Office kommen an nichts, was ihnen nicht zusteht.
- Im Server-Protokoll, in Meldungen und im Logbuch stand an keinem Tag ein Gastname.

**Was nicht trägt**

Ab 08:00 fehlen der App die Ausnahmen des Hotelalltags: Sperren, Zimmerwechsel, falsche Check-outs, Frühabreisen, Engpass. Vier Befunde sind kritisch, weil sie zu einem falsch verkauften Zimmer oder zu offenen Gastdaten führen.

**Befunde nach Schwere**

| Schwere | Anzahl | Bedeutung |
|---|---|---|
| kritisch | 4 | falsche Daten mit Folgen für Gäste oder Datenschutz |
| hoch | 16 | Arbeit blockiert oder Regel deutlich verletzt |
| mittel | 24 | Fehler, der sich umgehen lässt |
| niedrig | 13 | umständlich |

**Pilotreife: nein, noch nicht.** Für einen Pilotbetrieb mit echten Gästen müssen mindestens die Pakete S1, F1, F2 und F3 erledigt sein (siehe Abschnitt 8). Ein Probebetrieb nur für die Morgenplanung, ohne Gastbildschirm und ohne Freigabe an das Front Office, wäre nach S1 und F1 vertretbar.

---

## 2. Grenzen dieser Simulation

Diese Punkte schränken ein, wie weit die Ergebnisse tragen:

- **Durchsatz zu hoch.** Die Rollen-Agenten durften Fleißarbeit abkürzen. Tag 2 und Tag 5 enden deshalb fast vollständig fertig; das sagt nichts über echte Arbeitszeiten.
- **Gelernte Arbeitszeiten verzerrt.** Die App lernt Minuten je Zimmer aus dem Tag. Diese Werte stammen hier aus der Simulation und sind unbrauchbar.
- **Uhr springt in Blöcken.** Zeitgesteuerte Meldungen (DND-Hinweis, „Anreise gefährdet“) kamen deshalb teils verspätet. Wo das eine Rolle spielt, steht es beim Befund.
- **Lücken:** Tag 4 ohne 15:00-Block. Tag 3: Schichtende der Housekeeper nicht geprüft (Server zu früh neu gestartet). Tag 5: Protokoll-Lücke bei Housekeepern (08:04 bis 13:05) und Duty Manager (07:30 bis 16:30).
- **Nur SQLite.** Die Produktions-Variante mit Postgres wurde nicht getestet.
- **Kein Abgleich mit v1.** Die Datei `Simulation_Hoteltag_Befunde_v1` liegt nicht im Repo. Deshalb stehen alle Befunde auf „NEU“; „bestätigt aus v1“ oder „behoben“ lässt sich nicht vergeben.
- **Zurückgezogene Befunde** (Bedienfehler der Simulation, kein App-Fehler): „Zuteilung im Zimmer-Dialog speichert nicht“, „Auf Unrein setzen wirkt nicht“, „Trace ohne Speichern“ (Zwei-Tipp-Knöpfe wurden zu langsam getippt) sowie „304 begonnen 10:01 statt 09:01“ (Zeitzonen-Lesefehler).

**Nebenbefund: bestehende Tests.** Der Gesamtlauf `npm test` am 16.11.2026 zeigt 5 rote Tests in 4 Dateien, die mit der Simulation nichts zu tun haben und auch ohne die Dateien dieses Berichts rot sind. Ursachen nicht untersucht:

- `tests/guestServer.test.ts`: „Link vor dem Anreisetag ungültig“ liefert trotzdem Zugang. Bitte zusammen mit Paket S1 prüfen, das könnte ein echter Fehler sein.
- `tests/guestDataPurge.integration.test.ts`: 3 Fälle der Nachtlöschung.
- `tests/betrieb/betrieb.integration.test.ts`: Green Option (Antwort 201 statt 200).
- `tests/ui/designTokens.test.ts`: Datei lässt sich nicht laden (Syntaxfehler beim Import).

Zwei weitere (`tests/autoplan/engine.test.ts`, `tests/import2810.integration.test.ts`) liefen nur im Gesamtlauf in ein Zeitlimit und sind einzeln grün.

---

## 3. Befunde

Spalten: **Tage** = an welchen Simulationstagen beobachtet. **Ursache** = Fundstelle im Code; „nicht gelesen“ heißt, die Stelle wurde nicht geprüft. **Test** = Fall in `tests/simulation/befunde.test.ts`. Status überall NEU (siehe Abschnitt 2).

### 3.1 Kritisch

| ID | Befund | Tage | Ursache | Paket | Test |
|---|---|---|---|---|---|
| K1 | **Ungereinigte Zimmer gelten am nächsten Morgen als „geprüft“.** Tag 3: 126 und 127. Tag 4: alle 26 am Vortag nicht gereinigten Abreise-Zimmer. Kein Hinweis für Supervisor oder Duty Manager; das Zimmer wirkt verkaufbar. | 3, 4 | `src/lib/dayplan/boardStatus.ts:24–26`: Ein Zimmer, dessen Status von gestern stammt, gilt als „heute unberührt“ und wird auf „geprüft“ gesetzt, wenn es nicht im heutigen Plan steht. `src/lib/dayplan/merge.ts:214` nimmt nur heutige Abreisen, Turns und Bleiber als schmutzig. | F1 | ja |
| K2 | **Der Live-Kanal ist ohne Anmeldung mitlesbar.** Über ihn laufen Gastnamen (1 bis 3 Nachrichten je Tag), die Gastcodes der Zimmer (Tag 1: 106 Codes), Mitarbeiternamen mit aktuellem Zimmer und Notiztexte. | 1–5 | `server.js:29–39`: Verbindung ohne Prüfung. `src/lib/realtime.ts:33–36`: jede Nachricht geht an alle. Gastname: `src/app/api/arrivals/route.ts:66`, `arrivals/[id]/route.ts:45`. Gastcode: ganzer Zimmer-Datensatz in `src/lib/rooms/applyStatusChange.ts:188`. Standort: `applyStatusChange.ts:152`. Notiz: `src/lib/rooms/addRoomNote.ts:35`. | S1 | ja |
| K3 | **Nachträglich zugeteilte Zimmer fehlen in allen Zahlen.** Nach der Korrektur von K1 von Hand (26 Zimmer) zeigten Tageszahlen und Supervisor-Liste 70 statt 96 Zimmer. Bei den Housekeepern standen sie als nackte Nummer mit 0 Credits. | 3, 4 | `src/lib/dayplan/dayNumbers.ts:49–51`: ohne Art im Tagesplan zählt ein Zimmer nie als „zu reinigen“. `src/lib/lists/dayRows.ts:129–130`: ohne Plan keine Art und 0 Credits. | F1 | ja |
| K4 | **Zimmer wird freigegeben und zum Einchecken angeboten, obwohl der Vorgast noch drin ist.** Tag 2: 523 gereinigt, freigegeben und „bereit für VIP“ trotz Late Check-out bis 15:00; 532 „Einchecken“ aktiv trotz Vorgast bis 14:00. | 2, 3 | Late Check-out wird nur gespeichert, nie gegen die Anreise geprüft (`src/app/api/rooms/[id]/late-checkout/route.ts:29`). Freigabe prüft den Vorgast nicht (`applyStatusChange.ts:160–182`). Front Office darf einchecken, sobald „geprüft“ (`src/lib/ui/frontOfficeHub.ts:53`). | F3 | – |

### 3.2 Hoch

| ID | Befund | Tage | Ursache | Paket | Test |
|---|---|---|---|---|---|
| H1 | **Gastcode:** Wer den Code eines Zimmers hat, kann für dieses Zimmer Wünsche und Mängel senden, von jedem Gerät. Zusammen mit K2 sind alle Codes abgreifbar. Außerdem entstehen Codes erst, wenn ein Supervisor die Code-Seite öffnet; an Tag 1 hatten Gäste um 08:00 keinen Code. | 1–5 | `src/lib/guestServer.ts:17–22` (Code allein genügt). `src/app/api/rooms/guest-access/route.ts:27` (Code erst beim Öffnen der Seite). | S1 | – |
| H2 | **Level 1 bekommt bei Personalmangel Suiten, VIP- und Allergiker-Zimmer** (Tag 3: Präsidentensuite an Level 1, während die Level-3-Kraft nur zwei große Suiten hat). Die Einschränkung „keine Suiten“ wird übergangen (Joanna). Annahme P4, P5, P6. | 1–3 | `src/lib/autoplan/cost.ts:76–81`: jede Kraft darf jedes Zimmer bekommen, die Regeln sind nur Strafpunkte (`weights.ts:19–20`, `29`). `CLAUDE.md` nennt die Level-1-Regel dagegen einen „Filter“; Code und Doku widersprechen sich. | F4 | – |
| H3 | **Beim Umverteilen von Hand sieht der Supervisor die Stufe nicht** und bekommt keine Warnung (Tag 3: fünf Junior Suiten an eine Level-1-Kraft). Annahme P6. | 2–4 | Die Zuteil-Wege prüfen weder Stufe noch Einschränkung: `src/app/api/rooms/bulk-assign/route.ts`, `rooms/[id]/assign/route.ts`, `src/lib/rooms/moveRoomBetweenAttendants.ts`. | F4 | – |
| H4 | **Sperren enden nie von selbst.** 322 („außer Betrieb“ seit Tag 3) und 320 blieben nach Ablauf der eingetragenen Frist gesperrt. 426 („nicht im Service“) blieb zwei Tage gesperrt, ein Bleiber wurde nicht gereinigt. | 3–5 | Das Enddatum `oooUntil` wird nur angezeigt, nirgends ausgewertet (`src/lib/escalations.ts` kennt es nicht). Der Morgenstatus lässt gesperrte Zimmer bewusst stehen (`boardStatus.ts:16`). „Nicht im Service“ hat gar kein Ende. | F2 | ja |
| H5 | **Der Techniker kann ein belegtes Zimmer ohne Rückfrage sperren.** Kein Grund-Feld, keine Meldung an Front Office oder Gast. Annahme B8. | 1–3, 5 | `applyStatusChange.ts:108–119`: verlangt nur ein Enddatum, prüft keine Belegung, meldet niemandem. | F2 | – |
| H6 | **Gesperrte Zimmer sind unsichtbar.** 424, 517 und 334 standen weder auf Startseite, Board, Grundriss noch beim Front Office, nur über die Zimmersuche. Für 322 gab es eine Anreise um 18:25 ohne jede Warnung; der Zuteilungsvorschlag ignoriert das. | 3–5 | Keine Liste und kein Zähler für Sperren; „Anreise gefährdet“ prüft nur „nicht geprüft“, erst 45 Minuten vor Ankunft (`escalations.ts:80–102`). | F2 | – |
| H7 | **Ein Check-out lässt sich nicht zurücknehmen.** 518 wurde zweimal versehentlich ausgecheckt; die Housekeeperin bekam „ausgecheckt“, eine Korrektur gab es nicht. | 4, 5 | `src/app/api/rooms/[id]/checkout/route.ts:19–42`: nur Eintragen, kein Zurücknehmen. | F3 | ja |
| H8 | **Vorzeitige Abreise ist nicht eintragbar.** Reist ein Bleiber früher ab, kann das Front Office ihn nicht auschecken, und der Supervisor kann die Art nicht ändern. Das Zimmer bleibt „Bleiber“. Annahme B3. | 2 | `checkout/route.ts:25`: abgelehnt, wenn heute keine Abreise im Plan steht. | F3 | – |
| H9 | **Zimmerwechsel gibt es nicht** (Annahme B5). 315→219 wurde in der App nie vollzogen: Der Gastcode zeigt weiter 315, 219 steht in keiner Liste, keine Aufgabe für den Hausmann. Behelf war eine Notiz. | 1–3, 5 | Keine Funktion vorhanden. `/api/rooms/[id]/move` verschiebt ein Zimmer zwischen Housekeepern, nicht den Gast (`move/route.ts:7–11`). | F3 | – |
| H10 | **Reinigung lässt sich starten, obwohl der Gast noch im Zimmer ist** (Abreise nicht ausgecheckt, Late Check-out, Hinweis „nicht reinigen“). Keine Warnung. | 1–3, 5 | `applyStatusChange.ts:76–95`: geprüft wird nur „Bitte nicht stören“. | F3 | – |
| H11 | **Krankmeldung geht still verloren.** Speichert der Duty Manager mittags das Team neu, ist die kranke Kraft wieder „anwesend“. Folge an Tag 1: Vorschlag „Fatima kann Zimmer übernehmen“. Annahme P11. | 1 | `src/lib/planung/teamData.ts:92–94`: eine heute krank gemeldete Kraft in der Auswahl wird auf „anwesend“ zurückgesetzt. | F4 | ja |
| H12 | **Offline: Notiz geht ohne Hinweis verloren.** Der Status wird nach dem Funkloch nachgeholt, die Notiz nicht. | 2, 5 | `src/app/attendant/view.tsx:189`: nur Statuswechsel kommen in die Warteliste. | F6 | – |
| H13 | **Altlasten vom Vortag wirken beim neuen Gast.** Notiz „Zimmerwechsel freigegeben“ hing an Tag 2 beim neuen Gast in 518. Alte Gastwünsche „jetzt reinigen“ setzten Zimmer Tage später noch ganz nach oben (328, 136). Sechs alte Wünsche wurden nie geschlossen. | 2, 4 | `dayRows.ts:103` (Notizen ohne Bezug zum Aufenthalt), `dayRows.ts:106` und `120` (Gastwünsche ohne Datum). Geschlossen wird ein Wunsch nur von Hand (`src/app/api/guest-requests/[id]/route.ts:42`). | F7 | – |
| H14 | **Der Duty Manager erfährt Wichtiges nicht.** Krankmeldung, Sperre, Personalmangel und VIP-Verzug erzeugen keine gezielte Meldung. | 2–5 | Krankmeldung ohne Meldung (`src/lib/autoplan/service.ts:267–280`), Sperre ohne Meldung (`applyStatusChange.ts`). | F5 | – |
| H15 | **Die Übergabe taugt nicht für die Spätschicht.** Automatischer englischer Text, kein Freitext, ohne Krankmeldung, Zimmerwechsel und Sperrgründe; „nothing outstanding“ trotz vier Sperren. Kein Menüpunkt für den Duty Manager. Morgens steht ohne Kennzeichen der Stand von gestern. | 0, 2, 5 | Text fest auf Englisch: `src/lib/handover/generate.ts:48–62`, `70–78`. Fakten ohne Krankmeldung/Wechsel: `src/lib/handover/collectFacts.ts`. Menü: `src/lib/nav.ts:50–56`. | F5 | – |
| H16 | **Hausmann: Aufgaben vom Vortag fehlen.** An Tag 3 fehlten 7 von 30 (Babybetten, Zusatzbetten für Gäste, die schon im Haus sind). Annahme B7. | 2, 3 | `src/lib/lists/housemanList.ts:42`: nur Einträge mit heutigem Datum. | F7 | – |

### 3.3 Mittel

| ID | Befund | Tage | Ursache | Paket |
|---|---|---|---|---|
| M1 | Housekeeper und Supervisor sehen bei „In Arbeit“ weder Startzeit noch Minuten gegen Sollzeit (Annahme B2). Nur der Duty Manager sieht es in den Live-Listen. | 1, 3, 5 | Die Daten sind da (`dayRows.ts:148–149`), die Anzeige im Zimmerfenster fehlt. | F6 |
| M2 | Die Glocke zeigt höchstens 50 Meldungen, ohne Datum, Filter oder Bündelung. Routine (bis 128 Check-out-Meldungen am Tag) verdrängt Wichtiges. | 1–5 | `src/app/api/notifications/route.ts:28`. Test vorhanden. | F5 |
| M3 | Supervisor und Techniker können keinen Mangel melden; der Supervisor sieht Mangel-Fotos nicht (Annahme B9). | 1–5 | Der Server erlaubt es (`src/app/api/rooms/[id]/defects/route.ts:16`), den Knopf gibt es nur bei Housekeepern (`src/app/attendant/view.tsx`, `src/components/hk/HkParts.tsx`). Fotos sind gespeichert, werden beim Supervisor nicht angezeigt. | F6 |
| M4 | Techniker kann „Erledigt“ ohne Notiz setzen; das Zimmer bleibt danach gesperrt, niemand fragt „wieder in Betrieb?“ (Annahme B8). | 1–3, 5 | `src/app/api/workorders/[id]/route.ts:19` (nur Status), `71–102` (kein Zimmerstatus). | F2 |
| M5 | Zahlen widersprechen sich: 57/57 gegen 139/141 gegen 140/142; „Offene Defekte 0“ gegen „Mängel 7“; „offen 0“ zählt nur Unzugeteiltes; Etage 3 mit 29/31 gegen 19/19. | 2, 5 | Mehrere Zählwege (`dayNumbers.ts`, `src/lib/dayplan/glance.ts:36–40`, Übergabe); nicht vollständig gelesen. | F1 |
| M6 | Der Plan warnt gleichzeitig „wird nicht vor Schichtende fertig“ (sechs Kräfte) und „mehr Kräfte als nötig“. | 4, 5 | Bedarf aus dem Zimmerziel (`src/lib/autoplan/result.ts:139–146`), Zeit aus gelernten Minuten (`result.ts:97–101`, `src/lib/autoplan/speed.ts`). Die gelernten Werte sind hier verzerrt, der Widerspruch bleibt echt. | F4 |
| M7 | Warnungen im Bestätigungsdialog ungebündelt (38 Zeilen an Tag 3); die Hinweisliste im Entwurf zeigt Suiten- und Stufen-Warnungen nicht; „Personal reicht nicht“ fehlt dort; roher Text „planungTool.typeEXTERN“. | 1–5 | Eine Warnung je Zimmer (`result.ts:119–133`); Anzeige nicht gelesen. | F4 |
| M8 | Entwurf und Handzuteilungen gehen verloren, wenn man `/planung` verlässt. Kein Importverlauf. Eine übernommene Vortagsliste verliert das Kennzeichen „veraltet“. | 5 | `src/lib/import/readiness.ts:24`: nach „Trotzdem verwenden“ gilt die Liste wie frisch. Rest nicht gelesen. | F4 |
| M9 | Englische Texte in der deutschen App: Meldungen („released“, „backlog“, „new guest request“), Übergabe, Fehlermeldungen. | 1–5 | Z. B. `applyStatusChange.ts:175`, `escalations.ts:148`, `src/lib/guestActions.ts:76`, `112`. | F5 |
| M10 | Der Gast sieht bei seinem Reinigungswunsch dauerhaft „Eingegangen“, auch nach der Reinigung. | 1, 3, 5 | `src/lib/guestStatusFeed.ts:63–69` liest den Status des Wunschs; beim Fertigmelden wird er nicht fortgeschrieben (`applyStatusChange.ts:138–144`). | F7 |
| M11 | „Anreise gefährdet“ kam meist erst nach der Ankunftszeit und nur einmal je Anreise; die Freigabe-Warteschlange ist nach Zimmernummer sortiert, nicht nach Ankunft oder VIP. | 2, 3 | Eine Meldung je Anreise (`escalations.ts:99`). Die Verspätung ist teils Folge der springenden Uhr. Sortierung nicht gelesen. | F6 |
| M12 | Housekeeper sehen „Alles erledigt, danke!“ trotz offenem oder abgelehntem Zimmer; kein Schichtende; „Meine Zeiten: zu wenig Daten“. Krank gemeldete Kraft sieht dasselbe. | 5 | nicht gelesen | F6 |
| M13 | Ein Ausflug hilft der Reinigung nicht: Housekeeper bekommen nur einen Glockeneintrag ohne Uhrzeit, in der Liste steht nichts (Annahme B11). | 3, 5 | `src/lib/rooms/notifyRoomChange.ts:18`; die Listenzeile kennt keinen Ausflug (`dayRows.ts`). | F6 |
| M14 | Der Gastbildschirm kann nur Deutsch und Englisch; die Gastsprache (fr, es, zh) wird nie angewendet (Annahme B12). | 1, 5 | `src/lib/guestI18n/translations.ts:12`, `GuestLocaleContext.tsx:30`. Test vorhanden. | F7 |
| M15 | Hausmann: wiederkehrende Aufgabe 304 steht doppelt (heute plus Rest vom Vortag), Reste ohne Datum; keine Einmal-Aufgabe; Twin-Rückbau vor dem Check-out erledigbar. | 2, 4, 5 | Offene Aufgaben ohne Tagesbezug (`src/app/api/roomtasks/route.ts:19`), neue Aufgabe je Fälligkeit (`src/lib/houseman/recurring.ts:21–28`). | F7 |
| M16 | Lesebestätigung nur als Zahl („5 von 13“) ohne Namen; Chat ohne Datum; Abteilungsnachricht ohne Pop-up bei den meisten (Annahme B10). | 2, 3, 5 | nicht gelesen | F5 |
| M17 | Die Zimmersuche zeigt einer Housekeeperin ein fremdes Zimmer mit Gastkennung, VIP und Anreisezeit. | 5 | `src/app/api/rooms/route.ts:39–42`: bei einer Suche entfällt die Einschränkung auf eigene Zimmer. | F6 |
| M18 | Gast kann eine Nachricht mit etwa 6000 Zeichen senden. | 5 | **Nicht bestätigt:** Laut Code sind Gast-Notizen auf 2000 Zeichen begrenzt. Im Folgeprompt nachstellen. | F7 |
| M19 | Zwei Zimmer gleichzeitig „In Arbeit“ möglich. Wäschewechsel wird beim Fertigmelden automatisch gebucht, ohne Bestätigung der Kraft. | 2, 4 | `applyStatusChange.ts:138–144`. | F6 |
| M20 | Krankmeldung und Ablehnen mit einem Tipp, ohne Rückfrage. Eine Notiz des Front Office ging an eine krank gemeldete Kraft. | 1–3 | nicht gelesen | F6 |
| M21 | Technik-Hinweise aus Opera erscheinen nicht beim Techniker. Der Opera-Hinweis „cleaning after 13:00“ wird nicht als „Reinigung ab 13 Uhr“ gewertet (Annahme P9). | 1, 2 | nicht gelesen | F7 |
| M22 | Front Office: Check-outs nur einzeln (bis 62 am Tag), die Liste springt unter dem Finger, die Rückfrage verfällt nach 1 bis 2 Sekunden. Front Office kann „Bitte nicht stören“ nicht aufheben. | 2–5 | nicht gelesen | F3 |
| M23 | Rush heißt bei der Housekeeperin nur „Priorität geändert“. Den Rush-Knopf des Supervisors fand keiner der Supervisor-Agenten (Annahme P10). | 1–5 | Der Knopf existiert (`src/app/supervisor/view.tsx`, `src/components/supervisor/SupervisorRoomDetail.tsx`); er ist nicht auffindbar. | F6 |
| M24 | Concierge: Ausflug nicht änderbar oder löschbar; Housekeeping nicht direkt erreichbar. | 1–5 | `src/app/api/excursions/route.ts` (nur Anlegen); nicht im Detail gelesen. | F7 |

### 3.4 Niedrig (umständlich)

Alle ohne Code-Prüfung; Paket in Klammern.

1. Sprachabfrage erscheint auf jeder Seite neu (F6).
2. Etagenfeld speichert erst beim Wegtippen (F4).
3. Credit-Stufen und Minuten sind in den Einstellungen nicht sichtbar; Ziele nur als Spanne (F4, Annahme P1/P2).
4. Team-Vorauswahl übernimmt den Vortag, auch Kräfte, die nicht im Dienst sind; ein Tipp auf den Namen schaltet eine Kraft ohne Rückfrage ab (F4).
5. Freigabe-Rückstau-Alarm ab 06:31, alle 30 Minuten, englisch, mit veralteter Zahl (F5).
6. Handverteilen braucht 4 bis 5 Tipps je Zimmer; „Reihenfolge ändern“ nur innerhalb einer Etage (F6).
7. Prüfdialog ohne Checkliste, gleich für Suite und Standardzimmer (F6).
8. Import-Fehlermeldung 48-mal wortgleich statt einmal „Spalte fehlt“; Spaltenname „room“ auf Englisch (F4).
9. Check-out-Meldungen einzeln statt gebündelt (F5).
10. Pause ohne Dauer und ohne Ende-Anzeige (F6).
11. Supervisoren sehen den Entwurf des Duty Managers nicht (F4).
12. Die „Zuteilen an“-Leiste wird von der Fußleiste verdeckt (F4).
13. Gast: Green Option nicht zurücknehmbar; bei „Bitte nicht stören“ kein Hinweis „heute nicht gereinigt“ (F7).

---

## 4. Regeln je Tag

✔ erfüllt · ◐ teilweise · ✖ verletzt · – nicht geprüft. Alle Regeln sind Annahmen.

| Regel | Tag 1 | Tag 2 | Tag 3 | Tag 4 | Tag 5 | Bemerkung |
|---|---|---|---|---|---|---|
| P1 Credits und Minuten | ◐ | ◐ | ◐ | ◐ | ◐ | Werte rechnen, sind aber nicht sichtbar; Zeit kommt aus gelernten Minuten (M6) |
| P2 Ziel 11 / 7 Zimmer | ✖ | ✖ | ✖ | ✔ | ✔ | Tag 1–3 Engpass im Drehbuch (8 Kräfte für 128 Zimmer), dort nicht fair prüfbar |
| P3 faire Mischung | ◐ | ◐ | ◐ | ✔ | ✔ | |
| P4 höchstens 2 Suiten | ✖ | ✖ | ✖ | ◐ | ✔ | bis 13 Suiten je Kraft; Tag 4 im Plan ✔, nach Handverteilung 6 |
| P5 Etagen, Einschränkungen | ✖ | ✖ | ✖ | ◐ | ◐ | bis 5 Etagen an Tag 3; „keine Suiten“ übergangen |
| P6 Level 1 | ◐ | ◐ | ✖ | ✔ | ✔ | H2, H3 |
| P7 Reihenfolge der Liste | ✔ | ◐ | ◐ | ◐ | – | Altwünsche oben (H13); „ab 13“ erst nach Neuladen |
| P8 Wäschewechsel, Green Option | ✔ | ✔ | ✔ | ✔ | ✔ | |
| P9 Reinigung ab 13 Uhr | ◐ | ◐ | ✔ | – | ✔ | Gastwunsch geht, Opera-Hinweis nicht (M21) |
| P10 Rush | ◐ | ◐ | ◐ | ◐ | ◐ | Front Office geht; Supervisor-Knopf nicht auffindbar (M23) |
| P11 Krankmeldung | ◐ | ✔ | ✔ | ✔ | ✔ | Tag 1: H11 |
| P12 Umverteilen nur Supervisor/DM | ✔ | – | – | – | ✔ | |
| P13 gleiche Kraft bei Bleibern | – | ◐ | ◐ | ◐ | ◐ | Treffer 63 %, 59 %, 72 %, 71 % |
| P14 kein automatischer Nachimport | – | ◐ | – | – | ✔ | Tag 2: Frühabreise nicht eintragbar (H8) |
| B1 Farben und Symbole | ✔ | – | – | – | – | |
| B2 Startzeit, Minuten gegen Soll | ◐ | – | ✖ | – | ✖ | M1 |
| B3 Check-out, Late Check-out | ◐ | ✖ | ◐ | ✖ | ✖ | H7, H8, K4 |
| B4 einzeln abnehmen | ✔ | ◐ | ◐ | ✔ | ✔ | Tag 2: K4 |
| B5 Zimmerwechsel-Freigabe | ✖ | ✖ | ✖ | – | ✖ | H9 |
| B6 DND ab 12:00 | ✔ | ✔ | ✔ | ◐ | ◐ | Tag 4/5 verspätet wegen Uhrsprung (Simulation) |
| B7 Hausmann | ◐ | ◐ | ✖ | ◐ | ◐ | H16, M15 |
| B8 Techniker | ✖ | ✖ | ✖ | – | ✖ | H5, M4 |
| B9 Mängel melden, Fotos | ✖ | ✖ | ✖ | ◐ | ✖ | M3 |
| B10 Nachrichten, Lesebestätigung | ◐ | ◐ | ◐ | – | ◐ | M16 |
| B11 Ausflüge | ✔ | ✔ | ◐ | ✔ | ◐ | M13 |
| B12 Gastanzeige, Gastsprache | ✖ | – | – | – | ✖ | M14 |

---

## 5. Verteilung der Arbeit über die Woche

Zugeteilte Credits am Tagesende (nach allen Handverteilungen) und fertig gemeldete Credits. „–“ = nicht im Dienst oder krank.

| Kraft | Typ | Tag 1 | Tag 2 | Tag 3 | Tag 4 | Tag 5 | Summe zugeteilt | Summe fertig |
|---|---|---|---|---|---|---|---|---|
| Maria Silva | Vollzeit L3 | 27,5 | 26,75 | 28,5 | 11 | 9 | 102,75 | 67,75 |
| Petra Novak | Vollzeit L1 | 19 | 19,75 | 23 | 17,75 | 7 | 86,5 | 58 |
| Lucia Ferrari | Vollzeit L1 | 19,75 | 17 | 29 | 16 | 2 | 83,75 | 51 |
| Joanna Kowalska | Vollzeit L2, keine Suiten | 15 | 17,5 | 25 | 15,25 | 8 | 80,75 | 57,5 |
| Aylin Kaya | Vollzeit L2 | 23,75 | 25,75 | – | 17 | 8 | 74,5 | 52 |
| Grace Okafor | Extern L2 | 21 | 1,5 | – | 20 | 10 | 52,5 | 27 |
| Elena Popescu | Teilzeit L2 | 18 | 18,5 | – | 1 | 6 | 43,5 | 37,5 |
| Fatima Benali | Azubi L2 | 1,5 | 17 | – | 11,5 | 9 | 39 | 35,5 |
| Sena Demir | Vollzeit L1 | 6 | – | 2 | – | – | 8 | 3 |

Auffällig:

- An den Engpasstagen 1 bis 3 trägt jede Vollzeitkraft 19 bis 29 Credits, also etwa das Doppelte des Ziels.
- Tag 3: Die beiden Level-1-Kräfte Petra und Lucia liegen mit 23 und 29 Credits gleichauf mit Level 3, Lucia mit 9 Suiten.
- Joanna hat „keine Suiten“ eingetragen und bekam an vier Tagen 1 bis 4 Suiten.
- Die Azubi Fatima bekam an Tag 2 fünf VIP- und zwei Allergiker-Zimmer.
- Die „fertig“-Spalte ist wegen der abgekürzten Fleißarbeit nicht belastbar (Abschnitt 2).

---

## 6. Sicht je Rolle

Aus dem Wochen-Feedback der Rollen (`tests/simulation/runs/2026-11-14/wissen/`).

| Rolle | Würde damit arbeiten? | Größter Ärger | Wichtigster Wunsch | Größte Sorge |
|---|---|---|---|---|
| Duty Manager | Ja, mit Vorbehalt: morgens stark, ab 08:00 fast blind | Meldungen ohne Rangfolge; Übergabe englisch und lückenhaft; Zahlen widersprechen sich | Meldung „Fortschritt hinter Plan“ und „Personal reicht nicht“ mit Ton; Kachel „gesperrte Zimmer“ | versehentlicher Check-out ohne Rückgängig; Vortagsliste wird unbemerkt Grundlage |
| Supervisor | Ja für den Alltag (Note 3); Ausnahmen nur mit Krücken | Zimmerwechsel, Sperren und Engpass nicht abgebildet; kein Foto, keine Sollzeit | Zimmerwechsel mit Freigabe; Engpass-Hochrechnung; Mangel melden mit Foto | nie gereinigtes Zimmer „geprüft“; Gast im freigegebenen Zimmer |
| Housekeeper | Ja an normalen Tagen (8–14 Zimmer); nein an Engpasstagen (23–25) | App sagt nie „das schaffst du nicht“; Änderungen ohne Klartext | Restzeit-Zeile; Marker für Suite, Allergiker, Wäsche mit Sollzeit | Zimmer mit Gast betreten; Level 1 allein in der Suite |
| Front Office | Ungern, solange Check-outs einzeln laufen | Check-out nicht rückgängig; „freigegeben“ bei belegtem Zimmer; Zimmerwechsel nur als Notiz | Mehrfach-Check-out mit Rückgängig; Warnung Late Check-out gegen Anreise | VIP in belegtes oder gesperrtes Zimmer einchecken |
| Concierge | Ja (Note 3): Ausflug in fünf Feldern | Ausflug nicht änderbar; Housekeeping nicht erreichbar | Ausflug bearbeiten; Hinweis ans Housekeeping | falscher Ausflug bleibt stehen |
| Hausmann | Ja (Note 3): Liste nach Uhrzeit, ein Tipp | Aufgaben vom Vortag fehlten; 304 doppelt | Einmal-Aufgabe mit Datum; „Gast noch im Zimmer“ | belegtes Zimmer betreten; fehlende Aufgaben |
| Techniker | Ja (Note 3): Mangel mit Foto kommt sofort | Zimmer bleiben gesperrt; „Erledigt“ ohne Notiz; kein eigener Mangel | Pflichtnotiz; Frage „wieder in Betrieb?“; Sperrgrund | vergessene Sperre; Gast im defekten Zimmer |
| Gast | Ja (Note 3): Wünsche in 2 bis 4 Tipps | nur Deutsch/Englisch; Status bleibt „Eingegangen“ | Gastsprache; Status mit Uhrzeit und „Behoben“ | fremder Code schreibt in fremdes Zimmer |

Was alle Rollen loben: der schnelle Import, Zwei-Tipp-Start und -Fertig mit Rückgängig, Direktknopf „Prüfen & freigeben“, Mehrfachzuteilung, Anreise-Liste mit Uhrzeit und VIP, Rush in zwei bis drei Tipps.

---

## 7. Offene Fragen

### An das Hotel (jede Antwort ändert eine Annahme)

1. **Level 1:** Reicht bei Suite, VIP und Allergiker eine Warnung, oder soll die App das bei Level 1 sperren? Was gilt bei Personalmangel?
2. **Suiten:** Stimmt „höchstens 2 Suiten je Kraft“? Zählt die Junior Suite mit?
3. **Liegen gebliebene Zimmer:** Was soll am Morgen mit Abreise-Zimmern von gestern passieren, die nicht gereinigt wurden? Vorschlag: bleiben schmutzig, stehen zuoberst im Plan, Duty Manager bekommt einen Hinweis.
4. **Sperren:** Soll „außer Betrieb“ nach Ablauf der Frist von selbst enden oder nur erinnern? Wer darf wieder in Betrieb nehmen? Wer muss informiert werden, wenn ein belegtes Zimmer gesperrt wird?
5. **Zimmerwechsel:** Wer stößt ihn an (Front Office?), wer gibt frei (Supervisor/Duty Manager?), was passiert mit dem alten Zimmer (Abreise-Reinigung?) und mit Gepäck (Hausmann?)
6. **Check-out zurücknehmen:** Wer darf das, und wie lange?
7. **Vorzeitige Abreise:** Trägt das Front Office sie in der App ein, oder kommt sie nur über eine neue Opera-Liste?
8. **Late Check-out gegen Anreise:** Wer entscheidet bei einem Konflikt, und wer soll die Warnung bekommen?
9. **Krankmeldung:** Wer muss sie sofort erfahren (Duty Manager, beide Supervisoren)? Soll die App eine Rückfrage stellen?
10. **Übergabe:** Welche Punkte braucht die Spätschicht zwingend? Freitext erwünscht?
11. **Gastsprachen:** Welche Sprachen braucht der Gastbildschirm?
12. **Präferenz-Etagen:** Darf der Supervisor sie ändern oder nur der Duty Manager? (An Tag 0 durfte es der Supervisor.)
13. **Mängel:** Dürfen Supervisor und Techniker selbst melden? Wer darf Fotos sehen?
14. **Hausmann:** Sollen Aufgaben für Gäste, die schon im Haus sind, jeden Tag wieder erscheinen, bis sie erledigt sind?

### Rechtliche Fragen (keine Rechtsberatung, bitte mit Fachleuten klären)

1. **Offener Live-Kanal (K2):** Gastnamen und Mitarbeiterdaten ohne Anmeldung abrufbar. Vor jedem Betrieb mit echten Daten schließen. Zu klären: Meldepflicht, falls die App schon einmal mit echten Daten außerhalb des lokalen Rechners lief.
2. **Standort und Arbeitszeiten der Mitarbeiter:** Die App zeigt, wer gerade in welchem Zimmer ist, und lernt Minuten je Kraft. Das ist Leistungs- und Verhaltenskontrolle; in Deutschland ist dafür in der Regel der Betriebsrat einzubinden.
3. **Gastcode im Zimmer:** Reicht ein Code ohne weitere Prüfung, wenn darüber Wünsche und Fotos gesendet werden? Was gilt nach einem Zimmerwechsel oder für den Vorgast?
4. **Fotos von Mängeln aus bewohnten Zimmern:** Wer darf sie sehen, wie lange werden sie aufbewahrt?
5. **Notizen vom Vortag beim neuen Gast (H13):** Freitext kann Angaben zum Vorgast enthalten. Löschfrist und Bezug zum Aufenthalt klären.
6. **Übergabetext:** Enthält Zimmernummern und bei gefährdeten Anreisen den Gastnamen. Wer darf ihn lesen?

### Technische Fragen an Simon

1. Wo liegt `Simulation_Hoteltag_Befunde_v1`? Mit der Datei lässt sich der Status „bestätigt aus v1“ / „behoben“ nachtragen.
2. Soll die Simulation einmal gegen die Postgres-Variante laufen, bevor der Pilot startet?
3. Der Branch `test/simulation-v2` liegt nur lokal. Soll er gepusht werden?

---

## 8. Fix-Pakete

Reihenfolge und Begründung stehen in `docs/simulation/folgeprompts/00_Reihenfolge.md`. Jedes Paket hat einen fertigen Prompt.

| Paket | Inhalt | Befunde | Vor Pilot nötig? |
|---|---|---|---|
| **S1** Sicherheit Live-Kanal und Gastcode | Live-Kanal nur für Angemeldete, keine Gastnamen und Codes mehr an alle, Codes vorab erzeugen | K2, H1 | ja |
| **F1** Morgenstatus und Zahlen | liegen gebliebene Zimmer bleiben schmutzig und werden gemeldet; Zimmer ohne Planeintrag zählen mit; eine Zahlenbasis | K1, K3, M5 | ja |
| **F2** Sperren | Ende der Sperre, Grund, „wieder in Betrieb“, Rückfrage bei belegtem Zimmer, Kachel, Warnung bei Anreise | H4, H5, H6, M4 | ja |
| **F3** Front-Office-Korrekturen | Schutz „Gast noch im Zimmer“, Check-out zurücknehmen, Frühabreise, Zimmerwechsel, Mehrfach-Check-out | K4, H7, H8, H9, H10, M22 | ja |
| **F4** Planung | Level 1 und Suiten bei Engpass, Stufe beim Umverteilen, Krankmeldung bleibt, Warnungen bündeln, Entwurf sichern | H2, H3, H11, M6, M7, M8 | empfohlen |
| **F5** Meldungen und Übergabe | Meldungen an den Duty Manager, Glocke, deutsche Texte, Übergabe mit Freitext | H14, H15, M2, M9, M16 | empfohlen |
| **F6** Bildschirme Housekeeper und Supervisor | Startzeit/Sollzeit, Marker, Schichtende, Offline-Notiz, Mangel melden, Fotos, Ausflug | H12, M1, M3, M11, M12, M13, M17, M19, M20, M23 | später |
| **F7** Gast, Hausmann, Concierge | Altlasten schließen, Gastsprache, Gaststatus, Aufgaben vom Vortag, Ausflug ändern | H13, H16, M10, M14, M15, M18, M21, M24 | später |

Die 13 niedrigen Befunde sind den Paketen zugeordnet (Abschnitt 3.4) und stehen in den Prompts als „wenn Zeit bleibt“.
