# Lernen aus der Planung und Arbeitsdaten (H3, 01.11.2026)

## Schritt 5 – Lernen aus Planungsänderungen

- **Erfassen:** Beim Bestätigen des Zuteilungsvorschlags (`confirmProposal`) wird jede Abweichung als `PlanDeviation` gespeichert: Zimmer verschoben (`ROOM_MOVED`, vorher/nachher = Housekeeper-ID) oder zurückgestellt (`ROOM_DEFERRED`). Beim Speichern der Etagenzuweisung (`saveFloorTeam`) wird jeder Etagen-Vorschlag gespeichert, der nicht übernommen wurde (`FLOOR_CHANGED`). Erfasst werden keine Namen, keine Gastdaten und keine Trace-Texte.
- **Muster** (`src/lib/learning/patterns.ts`): Dieselbe Korrektur an mindestens `learnMinDays` (3) der letzten `learnWindow` (5) Planungstage wird zum Muster:
  - **Etage:** Person P kommt auf Etage F.
  - **Zimmer → Person:** Zimmer R geht an Person P.
  - **Zimmer → Mindeststufe:** Wurde ein Zimmer immer zu einer höheren Stufe verschoben, geht es an mindestens diese Stufe.
  - **Zurückgestellt:** Zimmer R wird zurückgestellt (nur Hinweis).
- **Plausibilität:** Ein Tag mit mehr als `learnStaffDropShare` (30 %) weniger Housekeepern als der Median der letzten 5 bestätigten Pläne bekommt das Gewicht 0 und zählt nicht.
- **Auslaufen:** Ein Muster, das `learnExpireDays` (10) Planungstage lang nicht mehr beobachtet wurde, läuft aus. Ein gelöschtes Muster lernt nur aus Beobachtungen nach dem Löschen neu.
- **Anwendung (nur Vorschlag):**
  - Gelernte Etagen erscheinen in Schritt 3 als Vorschlag mit dem Grund „gelernt: an N von M Planungstagen so geändert".
  - Zimmer-Muster wirken im Zuteilungsvorschlag als weiches Gewicht `learned` (10).
  - Harte Regeln gewinnen: Ein Muster, das ein anspruchsvolles Zimmer an Stufe 1 geben würde, wird nicht angewendet und nur als Hinweis gezeigt.
- **Kontrolle:** Einstellungen › „Gelernte Regeln" mit Gesamtschalter, Ein/Aus je Muster und Löschen (`/api/learning`). Ändern und Löschen darf nur der Duty Manager (so entschieden 01.11.2026).
- **Noch nicht erfasst:** Reihenfolge-Änderungen (Laufplan per Ziehen), die Begründung per Einzeltap (das Feld `reason` gibt es, die Oberfläche fehlt noch) und Muster der Art „Etage bekommt immer einen Housekeeper mehr".

## Schritt 6 – Arbeitsdaten

- **Messung** (`src/lib/workdata/stats.ts`): von „Gestartet" bis „Fertig" durch dieselbe Person am selben Tag. Nicht gezählt werden:
  - Werte unter 3 Minuten oder über 3 Stunden
  - Zimmer, die über Nacht offen waren
  - Zimmer, die zwischendurch blockiert oder auf DND waren
  - Zimmer, die erneut auf DIRTY/PICKUP gesetzt wurden

  Eine Pausen-Funktion gibt es im System noch nicht.
- **Auswertung:** Mittelwert und Median je Reinigungsart (Turn, Abreise, Bleiber, Bleiber mit Wäschewechsel, Suite), Zimmer pro Tag, Arbeitszeit pro Tag und Tempo-Trend (letzte 7 gegenüber den 7 Arbeitstagen davor). Ab `workdataMinSamples` (5) Messwerten wird der eigene Median genutzt, sonst der anonyme Hauswert, sonst der Standard aus Credits.
- **Planung:** Ist der Schalter `workdata.usePlanning` an:
  - Der Zuteilungsvorschlag berechnet je Person eine geschätzte Dauer.
  - Ein schwaches Gewicht `overtime` greift, wenn diese Dauer über `shiftMinutes` (450) liegt.
  - Die Warnung `OVER_SHIFT` erscheint.
  - Schritt 3 und das Bestätigen-Fenster zeigen „≈ h:mm".

  Zimmerzahl und Credits bleiben vorrangig.
- **Datenschutz:**
  - Die Team-Ansicht `/supervisor/workdata` ist nur für Supervisor und Duty Manager und zeigt immer nur eine Person (keine Bestenliste, kein Vergleich).
  - Housekeeper sehen nur ihre eigenen Werte („Meine Zeiten", `/api/workdata/me`).
  - Pro Person wird nichts gespeichert. Alles wird aus dem Statusprotokoll der letzten `workdataRetentionDays` (90) Tage berechnet.
- **Entscheidung 01.11.2026:** Messdaten sind standardmäßig an — aktuell nur fiktive Arbeitskräfte, es geht ums Testen der Funktion.
- **Offen (Rechtsfrage, kein Rechtsrat):** Mitbestimmung des Betriebsrats (§ 87 Abs. 1 Nr. 6 BetrVG: technische Einrichtungen zur Leistungs- und Verhaltenskontrolle) und Rechtsgrundlage der Zeitauswertung (§ 26 BDSG / Art. 6 DSGVO). Bitte vor dem echten Einsatz klären.
