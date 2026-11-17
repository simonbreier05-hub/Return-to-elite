# Rollen der Simulation (lies nur deinen Abschnitt)

Fenster je Tag: 06:30 · 07:00 · 07:30 · 08:00 · 09:00 · 10:00 · 11:00 · 12:00 · 13:00 · 14:00 · 15:00 · 16:30.
Konkrete Zimmer/Personen je Tag stehen im Drehbuch `tests/simulation/drehbuch/tag-N.md` (dein Abschnitt).

## leitung — Duty Manager (Person `dm`, iPad). Protokoll `dm.md`

Diana Maier, Duty Manager. Einstieg `open /`, Tagesplanung unter `/planung`.
- **06:30** Die fünf Opera-Listen des Tages per Drag-and-Drop einlesen (`drop tests/simulation/opera/tag-N/*.pdf`, alle fünf auf einmal), Befunde lesen, übernehmen. Zahlen der App (Abreisen, Anreisen, Bleiber, Turns, Wäschewechsel, Traces) mit `erwartung.json` vergleichen und beide Werte ins Protokoll schreiben.
- **07:00** Mannschaft wählen (laut Drehbuch), Etagen den Supervisoren zuteilen, Vorschlag erstellen. Vorschlag ansehen: Zimmer und Credits je Kraft, Warnungen (Suiten, Level 1, Etagen, Einschränkungen) notieren.
- **07:30** Zusammen mit den Supervisoren: Plan prüfen, **bestätigen vor 08:00**, Uhrzeit notieren. Danach prüfen: sind die Handzuteilungen der Supervisoren erhalten?
- **Tagsüber** (je Fenster kurz): Haus-Überblick, Live-Listen, Meldungen (`inbox`). Was sieht der DM, was fehlt ihm? Auf Rückfragen der Supervisoren im Chat reagieren.
- **16:30** Tagesabschluss: offene Zimmer, Übergabe, was bleibt liegen.
- Tag 5 zusätzlich die fehlerhaften Uploads laut Drehbuch.

## supervisor — zwei Supervisoren (Personen `sup1` Sofia Marchetti, `sup2` Lukas Hoffmann, iPad). Protokoll `supervisor.md`

Etagen laut Drehbuch (sup1 unten, sup2 oben). Einstieg `open /`, Zuteilen im Grundriss/Tagesplan.
- **07:00** Vorschlag des DM ansehen (nur eigene Etagen?). Rechte-Test P6: als Supervisor das **Level** einer Housekeeperin ändern wollen → muss scheitern.
- **07:30** Zusammen 3 **Handzuteilungen** machen (Zimmer einer anderen Kraft geben; welche, notieren). Nach der Bestätigung prüfen, ob sie noch stimmen.
- **09:00** Krankmeldung laut Drehbuch eintragen. Erwartung P11: nichts wird automatisch verteilt, kein Vorschlag drängt sich auf; die Zimmer der Kranken von Hand verteilen. Wie viele Schritte?
- **Laufend** (jedes Fenster ab 09:00): fertige Zimmer **einzeln abnehmen** (B4). Sichtbar: „In Arbeit“ seit wann, Minuten vs. Sollzeit (B2)? Pro Tag mindestens 2 Ablehnungen: einmal **ohne** Grund versuchen (muss scheitern), einmal mit Grund → landet es bei derselben Housekeeperin? „Alle freigeben“ suchen (darf es nicht geben).
- **10:00** Rush für eine Anreise setzen (P10) — einer von euch; Zimmer springt bei der HK nach oben?
- **13:00** Mangel selbst melden (B9), Fotos von Gast-Mängeln ansehen.
- **14:00** Zimmerwechsel laut Drehbuch freigeben (B5).
- **15:00** Nachricht an die Abteilung Housekeeping schicken, Lesebestätigungen prüfen (B10).
- **16:30** Schichtende: was ist offen, Übergabe schreiben.

## hk — Housekeeper (Personen laut Drehbuch, je Agent 2–3 Kräfte, Handy). Protokoll `hk-gruppe-X.md`

Einstieg `open /` (führt zu „Meine Zimmer“). Jede Kraft arbeitet **ihre eigene** Liste ab.
- **08:00** Liste ansehen: Anzahl Zimmer, Reihenfolge (P7), Farben/Symbole (B1), Wäschewechsel-Symbol (P8), Gastanzeige (B12: „Anrede Titel Nachname“, Sprache, keine Altersangaben), Hinweise/Traces. Kam eine Meldung „Plan steht“? Erstes Zimmer starten.
- **Jedes Fenster 09:00–15:00:** je Kraft das laufende Zimmer fertig melden und das nächste **in der Reihenfolge der App** starten — etwa 2 Zimmer je Kraft und Fenster (Suiten zählen doppelt). Vor jedem Fenster `inbox` lesen: Rush, ausgecheckt, Ablehnung, DND-Karte, neue/entfernte Zimmer. Abgelehnte Zimmer zuerst nacharbeiten.
- Abreise-Zimmer, in denen der Gast noch nicht ausgecheckt ist: geht „Starten“ trotzdem? Was zeigt die App?
- **Rechte-Tests** (einmal am Tag, verteilt): Zimmer einer Kollegin zuteilen/verschieben (P12), Rush setzen (P10), Zimmer selbst freigeben/abnehmen (B4), Zimmerwechsel freigeben (B5), Mängel-Foto eines Gast-Mangels ansehen (B9), fremde Zimmer/Gastnamen sehen.
- **12:00** eine Kraft macht **Pause** (Pausen-Funktion suchen). DND-Zimmer laut Drehbuch: kam der Hinweis „Karte ans Zimmer hängen“ (B6)?
- **14:00** eine Kraft laut Drehbuch: **WLAN aus**, Zimmer fertig melden, nächstes starten, WLAN an — was geht verloren, was wird nachgeholt, gibt es einen Hinweis?
- **15:00** Nachricht der Supervisoren lesen (B10), antworten.
- **16:30** Schichtende: letzte Zimmer fertig melden; was nicht geschafft ist, bleibt offen. Gibt es „Meine Zeiten“/Tagesübersicht?
- Krank laut Drehbuch: diese Kraft arbeitet ab der Krankmeldung nicht mehr.

## empfang — Front Office (`fo` Felix Ott) und Concierge (`concierge` Claire Dubois), iPad. Protokoll `empfang.md`

- **FO 08:00** Überblick: Was sieht das Front Office (Zimmerstatus live: in Arbeit → geprüft → freigegeben, B4)? Anreisen mit Uhrzeit.
- **FO 10:00 / 11:00** Check-outs laut Drehbuch eintragen („Gast ausgecheckt“, B3), Late Check-outs eintragen. Rush für eine Anreise setzen (P10).
- **FO Rechte-Tests:** Zimmer zuteilen/umverteilen (P12), Zimmer freigeben/abnehmen (B4), Zimmerwechsel freigeben (B5), Mängel-Fotos ansehen (B9).
- **FO 14:00** Zimmerwechsel laut Drehbuch anstoßen (wie geht das? wer muss freigeben?).
- **Concierge 13:00** einen Ausflug eintragen (B11). **Rechte-Tests:** Mängel-Fotos ansehen (B9), Zimmerstatus ändern, Rush setzen, Check-out eintragen. Welche Gastdaten sieht der Concierge?
- Beide: Nachricht an eine andere Abteilung/Person schicken (B10), Lesebestätigung prüfen.

## technik — Hausmann (`hausmann` Hans Bauer) und Techniker (`technik` Erik Weber), Handy. Protokoll `technik.md`

- **Hausmann 08:00** Liste ansehen: Aufgaben aus den Traces (Twin, Zusatzbett, Babybett), Sortierung nach Anreisezeit, sonst Zimmernummer (B7). Wiederkehrende Aufgabe laut Drehbuch anlegen bzw. prüfen, ob sie heute automatisch erschienen ist. Je Fenster 4–6 Aufgaben erledigen.
- **Techniker** je Fenster: Aufträge ansehen. **13:00** Gast-Mangel mit Foto: Foto sichtbar (B9)? Zimmer „außer Betrieb“ setzen (B8). **14:00/15:00** „Erledigt“ — geht es ohne Bestätigung? ohne Notiz? (B8). Danach: Zimmer wieder in Betrieb — wer macht das?
- **Rechte-Tests:** Hausmann: Mängel-Fotos sehen, Zimmerstatus ändern, zuteilen. Techniker: Zimmer freigeben, Reinigungsstatus ändern, zuteilen (P12), Gastnamen sehen.
- Selbst einen Mangel melden (Techniker, B9).

## gast — Gast-Agent (Personen `gast-<Zimmer>` laut Drehbuch, Handy, verschiedene Sprachen). Protokoll `gast.md`

Du spielst 4–6 Gäste. `open-guest --sprache <…>` = QR-Code im Zimmer scannen.
- Was sieht der Gast (Begrüßung „Anrede Titel Nachname“, Sprache passend zum Handy, keine Daten anderer Gäste/Zimmer, keine Mitarbeiternamen)?
- Laut Drehbuch: „Reinigung ab 13 Uhr“ wünschen (P9) · „Bitte jetzt reinigen“ (Service Now) · „Bitte nicht stören“ (B6) · Green Option (P8, Tag 4) · **Mangel mit Foto** melden (`upload tests/simulation/assets/mangel.png`, B9) · Status der eigenen Wünsche später wieder ansehen.
- Jede Aktion in einer anderen Sprache probieren (en, fr, es, zh, ar …): Ist alles übersetzt? Arabisch: läuft der Text von rechts nach links?
- Grenzen: fremde Zimmernummer in die Adresse tippen, zweimal schnell hintereinander senden, sehr langer Text, Foto > 10 MB (falls vorhanden).
