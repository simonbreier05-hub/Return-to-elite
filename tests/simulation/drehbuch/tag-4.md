# Drehbuch Tag 4 — Do 2026-11-19 (Ruhig)

Soll laut Listen: 30 Abreisen (davon 2 Turns), 15 Anreisen, 43 Bleiber, 15 Wäschewechsel, 43 offene Traces. Alle Soll-Zahlen: `tests/simulation/opera/tag-4/erwartung.json`.
Mannschaft: 8 Housekeeper (`maria`, `petra`, `fatima`, `aylin`, `lucia`, `grace`, `elena`, `joanna`), Supervisor `sup1` (Etagen 1–2) und `sup2` (Etagen 3–5), Hausmann `hausmann`.

## leitung
- **06:30** Fünf Listen aus `tests/simulation/opera/tag-4/` einlesen (alle `*.pdf` im Ordner, nicht `randfaelle`).
- **07:00** Mannschaft: genau die 8 oben genannten Housekeeper, beide Supervisoren, der Hausmann. Etagen: sup1 = 1+2, sup2 = 3+4+5. Vorschlag erstellen.
- **07:30** Plan bestätigen (vor 08:00), nachdem die Supervisoren ihre 3 Handzuteilungen gemacht haben (im Entwurf oder direkt danach — notieren, was die App zulässt).

## supervisor
- **07:30** 3 Handzuteilungen (frei wählbar, notieren).
- **09:00** Krankmeldung: `elena` (Elena Popescu) fällt aus — sup2 trägt es ein und verteilt ihre offenen Zimmer von Hand (P11).
- **11:00** `sup1` setzt Rush für Zimmer 524 (P10).
- **13:00** Mangel selbst melden in Zimmer 112; Gast-Mangel in 320 ansehen (Foto sichtbar? B9).
- **14:00** Zimmerwechsel freigeben: Gast aus 417 in ein freies, sauberes Zimmer eurer Wahl (B5).
- **15:00** Nachricht an alle Housekeeper („Bitte Wäschewagen bis 16:15 zurück in den Office-Raum“), Lesebestätigung prüfen (B10).

## hk-gruppe-1
Deine Kräfte heute: `maria`, `petra`, `fatima`. Protokoll `hk-gruppe-1.md`.
- **14:00** `petra`: WLAN-Abbruch (siehe Rollenbeschreibung).
- DND-Zimmer heute: 122 (Gast hängt um 08:00 „Bitte nicht stören“ an). Wer es in der Liste hat: ab 12:00 auf den Hinweis „Karte ans Zimmer hängen“ achten (B6). „Ab 13 Uhr“-Zimmer: 226 (P9). Service Now: 301 (P7). Rush: 205 um 10:00, 524 um 11:00 (P10).
- Rechte-Tests dieser Gruppe heute: Foto eines Gast-Mangels ansehen (B9) + fremde Zimmer/Gastnamen sehen.

## hk-gruppe-2
Deine Kräfte heute: `aylin`, `lucia`, `grace`. Protokoll `hk-gruppe-2.md`.
- **12:00** `aylin` macht 30 Minuten Pause (Pausen-Funktion benutzen), um 13:00 weiter.
- DND-Zimmer heute: 122 (Gast hängt um 08:00 „Bitte nicht stören“ an). Wer es in der Liste hat: ab 12:00 auf den Hinweis „Karte ans Zimmer hängen“ achten (B6). „Ab 13 Uhr“-Zimmer: 226 (P9). Service Now: 301 (P7). Rush: 205 um 10:00, 524 um 11:00 (P10).
- Rechte-Tests dieser Gruppe heute: Zimmer einer Kollegin zuteilen (P12) + Rush setzen (P10).

## hk-gruppe-3
Deine Kräfte heute: `elena`, `joanna`. Protokoll `hk-gruppe-3.md`.
- **09:00** `elena` meldet sich nach dem ersten Zimmer krank (telefonisch beim Supervisor) und arbeitet danach nicht mehr. Um 10:00 einmal nachsehen: Was zeigt ihr Handy noch an?
- DND-Zimmer heute: 122 (Gast hängt um 08:00 „Bitte nicht stören“ an). Wer es in der Liste hat: ab 12:00 auf den Hinweis „Karte ans Zimmer hängen“ achten (B6). „Ab 13 Uhr“-Zimmer: 226 (P9). Service Now: 301 (P7). Rush: 205 um 10:00, 524 um 11:00 (P10).
- Rechte-Tests dieser Gruppe heute: eigenes Zimmer selbst abnehmen/freigeben (B4) + Zimmerwechsel freigeben (B5).

## empfang
- **10:00** FO: „Gast ausgecheckt“ für: 111, 114, 123, 124, 131, 136, 201, 208, 210, 211, 221, 224, 236, 237. Rush für Anreise-Zimmer 205 (P10).
- **10:00** FO: Late Check-out von Hand eintragen: 532 (bis 14:00). Im Report stehen schon: 205, 524 — sind die markiert?
- **11:00** FO: „Gast ausgecheckt“ für: 311, 322, 324, 334, 401, 416, 418, 435, 437, 514, 515, 518, 523. 
- **13:00** Concierge: Ausflug für Zimmer 226 eintragen (Abfahrt 14:00, Rückkehr 18:00) (B11).
- **14:00** FO: Zimmerwechsel anstoßen: 417 → freies Zimmer (B5).
- **14:00/15:00** FO: die Late-Check-out-Zimmer auschecken.

## technik
- **08:00** Hausmann: wiederkehrende Aufgabe Zimmer 304 „Blumen wechseln“ (alle 2 Tage ab Tag 1) — heute **nicht fällig**: steht sie fälschlich in der Liste? (B7)
- **13:00** Techniker: Gast-Mangel in Zimmer 320 (mit Foto) → Zimmer außer Betrieb setzen (B8, B9).
- **15:00** Techniker: Auftrag 320 erledigen — ohne Notiz versuchen, dann mit Notiz (B8). Zimmer wieder in Betrieb?
- **14:00** Techniker meldet selbst einen Mangel in Zimmer 123 (Abreise-Zimmer) (B9).

## gast
- `gast-122` (ar-SA): DND
- `gast-226` (de-DE): ab 13 Uhr
- `gast-301` (en-US): Service Now
- `gast-320` (fr-FR): Mangel mit Foto
- `gast-132` (es-ES): Green Option
- `gast-102` (zh-CN): Anreise-Gast
- **08:00** 122: „Bitte nicht stören“. 226: „Reinigung ab 13 Uhr“ (P9). 132: **Green Option** wählen (P8) — verschwindet der Wäschewechsel heute?
- **10:00** 301: „Bitte jetzt reinigen“ (Service Now, P7).
- **13:00** 320: Mangel mit Foto melden („Dusche tropft“ in der Sprache des Gastes) (B9). 122: DND wieder aufheben.
- **15:00** Alle: Status der eigenen Wünsche ansehen. 102: Anreise-Gast scannt den Code (ist er schon „sein“ Zimmer? was sieht er vor dem Check-in?). Grenzen laut Rollenbeschreibung testen.
