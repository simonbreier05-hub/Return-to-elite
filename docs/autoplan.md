# Intelligenter Zuteilungsvorschlag und Live-Umverteilung (M2b)

Grundlage: Interview vom 06.10.2026. **Das System schlägt vor, der Supervisor entscheidet immer.** Nichts erreicht die Housekeeper, bevor bestätigt wird.

## Wo

- Planungshub (`/supervisor/planning`) → „Intelligenter Zuteilungsvorschlag" → **Plan vorschlagen** → prüfen, einzelne Zimmer per Auswahl ändern → **Plan bestätigen** → **Jetzt bestätigen** (zwei Taps).
- Einstellungen (`/settings`) → „Housekeeper (Zuteilungsvorschlag)": Typ, Stufe, Stammetagen, Tagesziel, aktiv; Regeln und Gewichte.
- Umverteilungsvorschläge tagsüber als Karte oben im Live-Board und im Planungshub (Banner, Glocke per Socket.IO).
- Der ältere Planer des Planungshubs („Plan auf das Team anwenden") bleibt unverändert daneben bestehen.

## Regeln

| Art | Regel |
|---|---|
| **Hart** | Manuelle (heutige) Zuteilungen sind fest. Stufe 1 bekommt nie anspruchsvolle Zimmer — gibt es zu wenige Kräfte der Stufe 2/3, bleibt das Zimmer offen, mit Warnung. Begonnene Zimmer (`IN_PROGRESS`, `CLEAN`, `INSPECTED`) werden nie verschoben. |
| **Stark** | Fairness bei Credits (Ziel ± Toleranz) und bei Abreisen, Bleibern, Wäschewechseln. Höchstens 2 Etagen je Housekeeper (Ausnahme bei Personalmangel, mit Warnung). Anspruchsvolle Zimmer gleichmäßig auf Stufe 2/3. |
| **Schwach** | Stammetage und Etage von gestern; Zimmer nah beieinander (Flügel, Nummern); Interconnecting zum selben Housekeeper. |

**Anspruchsvoll** = mindestens eines von: VIP (Tagesplan), Suite (Zimmertyp `JUNIOR_SUITE`, `SUITE`, `PENTHOUSE`), Allergiker-Zimmer (`Room.isAntiAllergic`), viele offene Traces (≥ `autoplanManyTraces`, Standard 2).

**Credits:** Abreise/Turn = Wert des Zimmertyps (`getRoomTypeCredits`); **Bleiber normal = 0,5 × Zimmertyp** (`stayoverFactor`), **Bleiber mit Wäschewechsel = voller Zimmertyp-Wert** (`stayoverLaundryFactor`, 1,0) — dieselbe Rechnung wie im älteren Planungshub; eine Definition in `src/lib/rooms/stayoverCredit.ts` für Vorschlag und Listen.

**Ziele:** Vollzeit = `targetCreditsPerAttendant` (14) ± `autoplanTolerance` (1,5); Azubi/Teilzeit = 6–8 (`azubiCredits*`, `teilzeitCredits*`); je Person überschreibbar (`dailyTarget`). Credit-Abweichungen unter 0,25 lösen keine Warnung aus (ein Zimmer lässt sich nicht teilen).

**Route:** 1. Same-Day-Turn (nach Anreisezeit aus den Arrivals), 2. frühe Anreise, 3. VIP, 4. Abreisen vor Bleibern; innerhalb einer Stufe Etage → Nummer. Fehlt die Anreisezeit, sind Turns trotzdem vorn, nur ohne Zeitsortierung.

## Verfahren (deterministisch, kein Machine Learning)

1. Eingabe: Zimmer des Tages aus `DayRoomPlan` (Abreise, Turn, Bleiber; Anreise-Zimmer werden nicht gereinigt), anwesende Housekeeper, feste Vorbelegung.
2. Zwei Startlösungen — *Greedy* (anspruchsvolle zuerst, nach Etage/Flügel, je Zimmer der günstigste geeignete Housekeeper) und *Sweep* (zusammenhängende Blöcke nach Etage, Größe = Tagesziel) —, je mit lokaler Suche (Zimmer verschieben, tauschen), dann 10 feste Störungsrunden. Die günstigste Lösung gewinnt. Gleiche Eingabe → gleicher Vorschlag; Zeitlimit 2 s nur als Notbremse; bei 145 Zimmern und 10 Kräften unter 3 s.
3. Kostenfunktion (Gewichte in `weights.ts`, Setting `autoplanWeight.<name>`): Etage über 2 hinaus 100 · Credits-Abweichung (quadratisch, außerhalb des Bands) 10 · Ungleichheit Abreisen/Bleiber/Wäsche 5 · Ungleichheit anspruchsvoller Zimmer 8 · Interconnecting getrennt 20 · abseits Stammetage 1 · Flügel-/Nummernsprung 2 · offenes Zimmer 500.
4. Ausgabe je Zimmer mit Begründung („VIP: Stufe 3", „Stammetage 3", „Verbunden mit 105: beim selben Housekeeper") und Kennzahlen je Housekeeper (Credits, Abreisen, Bleiber, Wäschewechsel, Etagen, anspruchsvoll). Warnungen in einfacher Sprache; „Benötigt: X Housekeeper bei Ziel Y Credits".

## Live-Umverteilung

Auslöser: Nachimport/Tagesplan (neuer Turn, geänderte Art → offenes Zimmer), **„abwesend melden"** (ein Tap), **früher fertig** (Restzeit unter `earlyFinishMinutes` oder deutlich unter dem Schnitt), sowie eine Prüfung alle 10 Minuten (`server.js` → `/api/internal/redistribution-check`, nur mit `INTERNAL_TICKER_SECRET`).

- Nur **nicht begonnene** Zimmer, dieselben harten Regeln und Gewichte, möglichst wenige Verschiebungen (höchstens `redistributionMaxMoves`, Standard 4, außer beim Ausfall: alle Zimmer der abwesenden Kraft).
- Geschwindigkeit je Housekeeper: Minuten je Credit aus den heutigen Statuswechseln (`IN_PROGRESS` → `CLEAN`), gleitender Wert; ohne genug Messwerte `minutesPerCredit` (25). Nur IDs, keine Namen im Protokoll.
- Supervisor: **Bestätigen**, **Ablehnen**, **Ändern** (anderes Ziel je Zimmer). Verschoben wird mit der vorhandenen Funktion (`moveRoomBetweenAttendants`). Abgelehnte Vorschläge erscheinen nicht erneut, solange die Verschiebungen dieselben sind (Kennung = Hash der Verschiebungen).

## Protokoll und Lernen

`AuditLog`: `AUTOPLAN_PROPOSED`, `AUTOPLAN_CONFIRMED` (inkl. geänderte Zimmernummern), `REDISTRIBUTION_SUGGESTED/CONFIRMED/REJECTED`, `HK_ABSENCE_SET`, `HK_PROFILE_UPDATED` (nur *welche* Felder). Keine Gastnamen, keine Stufen/Typen. `AutoPlanProposal.deviations` speichert je Tag Vorschlag → bestätigter Plan (Zimmer, alt/neu, Zeit) — nur Auswertung vorbereitet, **kein automatisches Nachjustieren** der Gewichte.

## Datenschutz (Beschäftigtendaten)

Typ und Stufe (`User.hkType`, `hkLevel`, `homeFloors`, `dailyTarget`) sehen nur Supervisor und Duty Manager: nur hinter `requireRole(["supervisor"])`, nie in Housekeeper-Antworten (`/api/rooms`, `/api/auth/me` …), nie im Protokoll (Test `tests/autoplan/privacy.test.ts`). Abstimmung mit dem Hotel (Betriebsrat) vor dem Echtbetrieb.

## Offene Fragen an Simon

1. Zählt ein **Bleiber mit Wäschewechsel** mehr als 0,7? (bis dahin gleich 0,7, getrennt gezählt)
2. **Allergiker- und Interconnecting-Zimmer:** Der Vorschlag liest `Room.isAntiAllergic` und `Room.interconnectingGroup` aus dem Zimmerstamm. Der Aushang nennt teils andere Paare (208/209 statt 209/210; Allergiker 118, 119, 218 statt 218, 219). Bitte im Zimmerstamm prüfen.
3. **Suiten:** Es zählen alle Typen `JUNIOR_SUITE`, `SUITE`, `PENTHOUSE`. **Achtung:** Die Zimmertypen sind im Zimmerstamm noch `UNVERIFIED` (siehe `hotelDeRome.ts`) — solange sie nicht gepflegt sind, erkennt der Vorschlag keine Suiten.
4. **Viele Traces:** Standard ab 2 offenen Traces (`autoplanManyTraces`).
5. Typ/Stufe speichern ist Beschäftigtendatenschutz (siehe oben).
6. Wie lange dauert ein Zimmer je Credit? Start 25 Minuten, wird später aus den Zeitstempeln berechnet.
7. Neue Housekeeper haben vorerst Typ Vollzeit und **Stufe 2** — bitte Stufen pflegen (Azubis/Neue auf 1).
