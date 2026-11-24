# Entscheidungen zu den offenen Fragen aus der Simulation v2 (16.11.2026)

Quelle: Antworten von Simon auf Abschnitt 7 von `docs/simulation/Fehlerbericht_Simulation_v2.md`. Wo eine Antwort eine frühere Regel (P1–P14, B1–B12) ändert, steht die neue Fassung dabei. Diese Datei hat Vorrang vor den Regeltexten in Prompt Sim-2 v1.2 und vor den Folgeprompts v1.

## Fragen an das Hotel

| Nr. | Thema | Entscheidung | Ändert Regel | Paket |
|---|---|---|---|---|
| 1 | Level 1 | Von Hand zuteilen: Warnung reicht. **Der Zuteilungsvorschlag schlägt Level 1 nie** Suite, VIP, Allergiker oder viele Traces vor. | P6 neu: Vorschlag = harter Filter, Handzuteilung = Warnung | F4 |
| 2 | Suiten | Höchstens 2 Suiten je Kraft bestätigt, **Junior Suite zählt mit**. Reicht das Personal nicht, möglichst wenige Suiten je Kraft (gleichmäßig verteilen). | P4 präzisiert | F4 |
| 3 | Zimmer vom Vortag | Sichtbar kennzeichnen und mit verplanen. Vorschlag bestätigt: bleiben schmutzig, stehen oben im Plan, DM bekommt einen Hinweis. | – | F1 |
| 4 | Sperren | „Außer Betrieb“ heißt nur: nicht verkaufbar wegen Schaden o. Ä., **nicht** DND. Wieder in Betrieb nehmen dürfen **nur DM und Supervisor**. Sie werden benachrichtigt, sobald der Techniker/Handwerker „Mangel behoben“ setzt. | B8 präzisiert | F2 |
| 5 | Zimmerwechsel | **Front Office, Supervisor und DM** dürfen Zimmer wechseln (kein zweiter Freigabeschritt). Das alte Zimmer bleibt gekennzeichnet, damit der Wechsel nachvollziehbar ist. | B5 neu | F3 |
| 6 | Check-out zurücknehmen | Front Office, Supervisor, DM. | – | F3 |
| 7 | Vorzeitige Abreise | Front Office trägt sie manuell ein, ebenso Supervisor/DM. | P14 bestätigt | F3 |
| 8 | Late Check-out gegen Anreise | Supervisor/DM entscheiden. | – | F3 |
| 9 | Krankmeldung | Keine Rückfrage nötig. Der DM wird immer direkt benachrichtigt und passt den Plan von Hand an. | P11 präzisiert | F4, F5 |
| 10 | Übergabe | **Zurückgestellt**, Simon kommt später darauf zurück. | – | aus F5 entfernt |
| 11 | Gastsprachen | Gastbildschirm bekommt dasselbe Sprachangebot wie die übrige App, **automatisch in der Sprache des Endgeräts**. | B12 präzisiert | F7 |
| 12 | Präferenz-Etagen | Einstellungen bleiben beim **DM**. Supervisor nur lesen. | P5 präzisiert | F4 |
| 13 | Mängel | Melden dürfen Housekeeper, Supervisor, Techniker, DM und Gäste. Housekeeper dürfen ein Foto aufnehmen und hochladen. **Fotos sehen nur Techniker, Supervisor und DM.** | B9 neu | F6 |
| 14 | Hausmann | Alle Hausmann-Aufgaben sind täglich zu erledigen. Wird eine aufgeschoben, steht sie am nächsten Tag automatisch wieder auf der Liste. | B7 präzisiert | F7 |

## Rechtliche Fragen (Antworten von Simon, keine Rechtsberatung)

| Nr. | Thema | Antwort | Paket |
|---|---|---|---|
| 1 | Offener Live-Kanal | App lief nie mit echten Daten. Mit echten Daten nur noch mit Login. | S1 |
| 2 | Standort/Arbeitszeiten | Laut Simon im Hotel erlaubt und gestattet. | – |
| 3 | Gastcode | Jedes Zimmer hat einen festen QR-Code. Der Gastbereich ist an die importierten Opera-Listen gekoppelt (Gastname sichtbar, Abteilungen wissen, wer im Zimmer ist). Nach Check-out wird der Verlauf des Zimmers gespeichert und zurückgesetzt. Wunsch: Vorlieben wiederkehrender Gäste erkennen. | S1, F7, Backlog |
| 4 | Mängel-Fotos | Aufbewahren, bis der Mangel behoben ist. Sehen dürfen nur Supervisor, DM, Techniker. | F2, F6 |
| 5 | Notizen vom Vortag | Siehe 3: beim Check-out speichern und zurücksetzen. | F7 |
| 6 | Übergabetext | Lesen dürfen Supervisor und DM (Übergabe selbst zurückgestellt). | später |

## Kritische Anmerkungen (Claude)

1. **Betriebsrat (Recht 2):** „Im Hotel erlaubt“ sollte schriftlich vorliegen, idealerweise von HR bzw. Betriebsrat, falls es einen gibt (Leistungs- und Verhaltenskontrolle, § 87 Abs. 1 Nr. 6 BetrVG). Offene Rechtsfrage, kein Rechtsrat.
2. **Fester QR-Code (Recht 3):** Ein fest angebrachter Code bleibt nach dem Check-out gültig für jeden, der ihn fotografiert hat. Schutz in S1: Anfragen nur annehmen, solange für das Zimmer ein Aufenthalt „im Haus“ besteht; nach Check-out/Zimmerwechsel ist das Zimmer bis zum nächsten Check-in gesperrt. Restrisiko: Besucher im Zimmer. Außerdem zeigt der Gastbildschirm den Gastnamen jedem, der im Zimmer scannt.
3. **Vorlieben wiederkehrender Gäste (Recht 3):** Das ist ein Gästeprofil über mehrere Aufenthalte und widerspricht der aktuellen Regel „Gastdaten nach 30 Tagen löschen“. Braucht eigene Rechtsgrundlage/Einwilligung und Löschkonzept. Opera 5 führt bereits Gastprofile mit Präferenzen; besser diese über den Opera-Import übernehmen statt ein eigenes CRM zu bauen. **Nicht Teil der Fix-Pakete**, eigener Backlog-Punkt „G3 Wiederkehrer“.
4. **„Verlauf speichern“ nach Check-out (Recht 3/5):** Wie lange? Vorschlag: bestehende 30-Tage-Frist der Nachtlöschung. Bitte bestätigen.
5. **Level 1 bei Personalmangel (Frage 1):** Wenn außer Level 1 niemand frei ist, bleiben solche Zimmer im Vorschlag **unzugeteilt** mit Hinweis; der Supervisor entscheidet von Hand. Das passt zu „System schlägt vor, Supervisor entscheidet“.
6. **„Nicht im Service“ (Out of Service):** Nicht beantwortet. Annahme in F2: bleibt als eigener Status nur für den Betriebstag (verkaufbar, aber heute nicht vergeben). Wenn das Hotel ihn nicht nutzt, später entfernen.
7. **Gepäck beim Zimmerwechsel** und **wer bei Sperre eines belegten Zimmers informiert wird**: nicht beantwortet, Annahmen in F3/F2 bleiben gekennzeichnet.

## Nachtrag 20.11.2026 (Simon, nach der Gegenprüfung)

| Nr. | Thema | Entscheidung | Ändert | Paket |
|---|---|---|---|---|
| N1 | Zuteilungsvorschlag: Reihenfolge der Regeln | **Zuerst die Obergrenze der Zimmeranzahl je Kraft** (Zimmervorgabe/feste Obergrenze aus den Einstellungen, z. B. 12) — sie wird im Vorschlag nie überschritten. **Danach** die übrigen Regeln (eingeteilte Etagen, Stufe 1, Suiten, „keine Suiten“, Fairness). Zimmer, die so nicht passen, kommen in den **Float** („nicht zugeteilte Zimmer“); der Duty Manager teilt sie später von Hand zu. Oben steht immer ein Hinweis mit Anzahl und Zimmernummern im Float. | ersetzt den Teil „kein Zimmer bleibt offen“ der Entscheidung vom 20.11. (Commit 512123c); „Zimmeranzahl überwiegt die Regeln“ bleibt als Grundsatz | F9 |
| N2 | Was ist die harte Obergrenze? | **Die persönliche Zimmervorgabe** (Zimmer-Ziel je Typ bzw. persönliches Tagesziel), **höchstens** die feste Obergrenze aus den Einstellungen (12). Was darüber hinausgeht, kommt in den Float. | präzisiert N1 | F9 |
| N3 | Etagen im Zuteilungsvorschlag | **Housekeeper werden im Planungstool nicht mehr Etagen zugeteilt** — die Etagenzuweisung dort gilt nur noch für Supervisoren und Hausmänner. Wichtig ist, dass in den Einstellungen für jede Kraft die **präferierten Etagen** gepflegt werden; der Vorschlag richtet sich danach (Präferenz, keine Sperre). | ersetzt H1 „heutige Etagen“ für Housekeeper; N1 „eingeteilte Etagen“ = präferierte Etagen | F9 |
| N4 | Teil B (Mittel) | Umsetzen, wenn Zeit bleibt; additive Schema-Ergänzung `GuestRequest.stayId` (B1) freigegeben, Backup vorher. | – | F9 |
