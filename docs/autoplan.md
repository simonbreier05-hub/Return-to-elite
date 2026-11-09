# Intelligenter Zuteilungsvorschlag und Live-Umverteilung (M2b)

Grundlage: Interview vom 06.10.2026. **Das System schlägt vor, der Supervisor entscheidet immer.** Nichts erreicht die Housekeeper, bevor bestätigt wird.

## Wo

- Planungshub (`/supervisor/planning`) → „Intelligenter Zuteilungsvorschlag" → **Plan vorschlagen** → prüfen, einzelne Zimmer per Auswahl ändern → **Plan bestätigen** → **Jetzt bestätigen** (zwei Taps).
- Einstellungen (`/settings`) → „Housekeeper (Zuteilungsvorschlag)": Typ, Stufe, Stammetagen, Tagesziel, aktiv; Regeln und Gewichte.
- Umverteilungsvorschläge tagsüber als Karte oben im Live-Board und im Grundriss-Seite `/floor-plan` (Banner, Glocke per Socket.IO).
- Der ältere Planer des Planungshubs („Plan auf das Team anwenden") bleibt unverändert daneben bestehen.

## Regeln

| Art | Regel |
|---|---|
| **Hart** | Manuelle (heutige) Zuteilungen sind fest. Stufe 1 bekommt nie anspruchsvolle Zimmer — gibt es zu wenige Kräfte der Stufe 2/3, bleibt das Zimmer offen, mit Warnung. Begonnene Zimmer (`IN_PROGRESS`, `CLEAN`, `INSPECTED`) werden nie verschoben. |
| **Stark** | Zimmerzahl im Band je Typ (Plan-1b: Vollzeit 10–13, Teilzeit 6–9, Azubi 6–8); ähnliche Mischung je Kraft aus Turn, Deep clean, Tidy, Linen change; Azubis vor allem Standard/Deluxe (`traineeSuite`). Credits nur als Gegenprobe. Höchstens 2 Etagen je Housekeeper (Ausnahme bei Personalmangel, mit Warnung). Anspruchsvolle Zimmer gleichmäßig auf Stufe 2/3. |
| **Schwach** | Stammetage und Etage von gestern; Zimmer nah beieinander (Flügel, Nummern); Interconnecting zum selben Housekeeper. |

**Anspruchsvoll** = mindestens eines von: VIP (Tagesplan), Suite (Zimmertyp `JUNIOR_SUITE`, `SUITE`, `PENTHOUSE`), Allergiker-Zimmer (`Room.isAntiAllergic`), viele offene Traces (≥ `autoplanManyTraces`, Standard 2).

**Credits (Plan-1b):** Credit = Wert der **Zimmerkategorie** (`computeRoomCredit`, `src/lib/rooms/roomCredit.ts`; Standard 1, Deluxe 1,25, Junior Suite 1,5, Suite/Penthouse 2, Hauswert per `roomTypeCredits`) — unabhängig von der Art. Eine Definition für Grundriss, Tagesplan, Listen und Vorschlag. `stayoverFactor`/`stayoverLaundryFactor` sind nur noch Zeitfaktoren der Arbeitsdaten (Tidy schneller als Turn/Linen change).

**Ziele:** Hauptziel ist die Zimmerzahl je Typ (`roomBand()`, Settings `rooms{Vz|Tz|Az}{Min|Max}`, Kostenteil `rooms`). Credit-Band als Gegenprobe (Gewicht `credits` 3): Vollzeit = `targetCreditsPerAttendant` (14) ± `autoplanTolerance` (1,5); Azubi/Teilzeit = 6–8 (`azubiCredits*`, `teilzeitCredits*`); je Person überschreibbar (`dailyTarget`). Credit-Abweichungen unter 0,25 lösen keine Warnung aus (ein Zimmer lässt sich nicht teilen).

**Route:** 1. Turn (Abreise + Anreise, auch Anreise in ein ungereinigtes Zimmer; nach Anreisezeit), 2. frühe Anreise, 3. VIP, 4. Bleiber (Linen change, Tidy), 5. **Deep clean** (Abreise ohne Anreise) zuletzt — auch die Live-Priorität zieht dafür `checkoutToday` ab; innerhalb einer Stufe Etage → Nummer. Fehlt die Anreisezeit, sind Turns trotzdem vorn, nur ohne Zeitsortierung.

## Verfahren (deterministisch, kein Machine Learning)

1. Eingabe: Zimmer des Tages aus `DayRoomPlan` (Abreise, Turn, Bleiber; Anreise-Zimmer werden nicht gereinigt), anwesende Housekeeper, feste Vorbelegung.
2. Zwei Startlösungen — *Greedy* (anspruchsvolle zuerst, nach Etage/Flügel, je Zimmer der günstigste geeignete Housekeeper) und *Sweep* (zusammenhängende Blöcke nach Etage, Größe = Tagesziel) —, je mit lokaler Suche (Zimmer verschieben, tauschen), dann 10 feste Störungsrunden. Die günstigste Lösung gewinnt. Gleiche Eingabe → gleicher Vorschlag; Zeitlimit 2 s nur als Notbremse; bei 145 Zimmern und 10 Kräften unter 3 s.
3. Kostenfunktion (Gewichte in `weights.ts`, Setting `autoplanWeight.<name>`): Etage über 2 hinaus 100 · Zimmerband (quadratisch) 20 · Credits-Abweichung (quadratisch, außerhalb des Bands) 3 · Ungleichheit Turn/Deep clean/Tidy/Linen change 5 · Junior Suite/Suite bei Azubi 40 · Ungleichheit anspruchsvoller Zimmer 8 · Interconnecting getrennt 20 · abseits Stammetage 1 · Flügel-/Nummernsprung 2 · offenes Zimmer 500.
4. Ausgabe je Zimmer mit Begründung („VIP: Stufe 3", „Stammetage 3", „Verbunden mit 105: beim selben Housekeeper") und Kennzahlen je Housekeeper (Credits, Abreisen, Bleiber, Wäschewechsel, Etagen, anspruchsvoll). Warnungen in einfacher Sprache; „Benötigt: X Housekeeper bei Y Zimmern je Vollzeitkraft" (Zimmer ÷ Mitte des Vollzeit-Bands).

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

## Keine Sperren, nichts bleibt offen

Der Zuteilungsvorschlag teilt **immer alle** zu reinigenden Zimmer den anwesenden Kräften zu. Regeln (Stufe 1 ↔ anspruchsvolle Zimmer, Etagenlimit, Credit-Ziel) sind Kosten und Warnungen, nie Filter. Offen bleibt ein Zimmer nur, wenn niemand anwesend ist oder der Supervisor es bewusst offen lässt. Bei Personalüberhang sind alle Anwesenden gleichmäßig eingeplant; mit „Nicht einplanen“ (Schritt „Plan“) entscheidet der Supervisor, wer nicht arbeitet — es folgt ein neuer Vorschlag ohne diese Kraft.
