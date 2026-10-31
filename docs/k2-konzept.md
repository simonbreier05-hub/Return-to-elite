# K2 – Automatische Übersetzung von Inhalten · Konzept (Stufe 1, zur Freigabe)

**1. Anbieter** (Preise/Sprachen Stand Okt. 2026, vor Vertrag auf den Anbieterseiten bestätigen)
| | Google Cloud Translation (NMT) | DeepL API Pro | Claude Haiku 5.5 (KI-Modell) |
|---|---|---|---|
| vi / it / tr / fa / hi | alle | laut DeepL-Doku alle, fa/hi ohne Glossar | alle |
| Glossar | ja, je Sprache | ja (nicht fa/hi) | über Anweisung + unser Marker-Schutz |
| Preis | 20 $/1 Mio. Zeichen (0,5 Mio. frei) | ca. 20–25 €/1 Mio. + Grundgebühr (unklar) | 0,10 $/0,50 $ je 1 Mio. Tokens Ein/Aus |
| Latenz | ~0,2–0,5 s | ~0,3–0,7 s | ~1–2 s |
| Datenschutz | AVV (Google Cloud DPA), EU-Standort wählbar (prüfen), kein Training | EU-Firma (Köln), AVV, Pro-Daten nicht gespeichert | AVV, kein Training; EU-Verarbeitung nur über Partner-Cloud (Vertex AI „eu“ / Bedrock Frankfurt), direkte API nur US/global |

*Beispielrechnung 40 Mitarbeitende:* ~70 000 Zeichen neue Texte/Tag (Chat, Notizen, Nachrichten, Mängel), im Schnitt 4 Lesesprachen
→ ~8,5 Mio. Zeichen/Monat. Google ≈ 170 $/Monat · DeepL ≈ 180–220 €/Monat · Haiku ≈ 5–15 $/Monat (inkl. Anweisungen).

**Empfehlung:** Google Cloud Translation (EU-Standort, Glossar für alle fünf Sprachen, deterministisch – erfindet nichts dazu)
als Start. Claude Haiku 5.5 über eine EU-Region als zweite Umsetzung derselben Schnittstelle anlegen und mit erfundenen
Hotel-Testtexten vergleichen. Haiku ist deutlich günstiger und kommt mit Fachjargon und Kurztexten besser zurecht, braucht aber Schutzregeln
(nur übersetzen, nichts ergänzen). Gekapselt ist das in `TranslationProvider` (aus K1, `TRANSLATION_PROVIDER=google|claude`, Schlüssel nur als Umgebungsvariable).

**2. Datenmodell (nur Zusätze)**
- `originalLanguage String?` an `RoomNote`, `Defect`, `RoomTask`, `Trace`, `GuestRequest` (`ChatMessage` hat sie schon), gesetzt wie im Chat (`languageFor`).
- `ContentTranslation { contentType, contentId, targetLang, text, provider, sourceHash, createdAt }`, eindeutig je Inhalt + Sprache.
  Übersetzt wird nur, wenn Inhalt + Sprache fehlen oder sich der `sourceHash` geändert hat.
- `TranslationFlag { translationId, userId, createdAt, status }` („Übersetzung unklar“) und `TranslationUsage { month, chars }`.

**3. Inhaltsarten (je einzeln schaltbar, Setting `translation.enabled.<art>`)**
- An: Chat · Zimmer-/Aufgaben-Nachrichten und Notizen (`RoomNote`, auch Techniker/Hausmann) · Mängel-Texte · Aufgaben-Notizen (`RoomTask`) · Abteilungs-Alerts (Personal-Anfrage).
- Pausengründe sind schon Codes (über K1 übersetzt, kein Anbieter nötig).
- Techniker-„Erledigt-Hinweise“ gibt es nur als Nachricht (kein eigenes Feld).
- Aus, technisch vorbereitet: Traces und Gastwünsche. Wenn sie eingeschaltet werden, geht nur der Freitext raus. Vorher ersetzt das System die heutigen Gastnamen und Anreden (aus `Stay`) durch Platzhalter.

**4. Anzeige**
- Jeder liest in seiner Sprache. Unter dem Text steht „Übersetzt aus <Sprache>“; ein Tipp darauf zeigt das Original.
- Das Original wird immer gespeichert und erscheint sofort.
- Die Übersetzung läuft im Hintergrund. Fertig gemeldet wird sie nur als „Übersetzung bereit“ mit IDs, über die bestehenden berechtigten Räume. Den Text holt der Client dann über eine Abfrage, die die Rechte prüft. Nie Text über `broadcast()`.

**5. Qualität:** Knopf „Übersetzung unklar“ → Meldung an Supervisor/Duty Manager. Dort kann man einen Glossarbegriff ergänzen (Setting, löscht den Zwischenspeicher dieses Begriffs).
Das K1-Glossar wird immer mitgegeben. Bei sehr kurzen oder mehrdeutigen Texten (≤ 3 Wörter) erscheint der Hinweis „Original prüfen“.

**6. Robustheit/Kosten**
- 5 s Zeitlimit, 1 Wiederholung. Bei Fehler bleibt das Original stehen, mit kleinem Hinweis.
- Zwischenspeicher, Rate-Limit je Nutzer, Monatslimit (Setting) mit Warnung bei 80 % an den Duty Manager. Bei 100 % wird nur noch das Original gezeigt.

**7. Datenschutz** (kein Rechtsrat)
- AVV mit dem Anbieter, EU-Verarbeitung, kein Training mit Daten, keine Gastnamen (Platzhalter).
- Kein Inhalt in Server-Logs.
- Übersetzungen werden mit dem Original gelöscht: Chat-Aufbewahrung, Zurückziehen, Nachtlöschung, neue Regel in `purgeGuestDataNow` plus Scan-Test.

**8. Risiken & Testplan**
- Risiken: Fehlübersetzung bei Sicherheitsthemen (Mangel/Gast) – deshalb Original immer per Tipp sichtbar; Kosten bei Spam; Gastnamen im Freitext; Anbieterausfall.
- Tests:
  - Cache: einmal je Inhalt und Sprache.
  - Neu-Übersetzung bei geändertem Original.
  - Ausfall und Zeitlimit: Original wird gezeigt.
  - Glossar und Platzhalter bleiben erhalten.
  - Gast-Schalter aus: der Anbieter wird nie aufgerufen (Spy prüft auf 0 Aufrufe).
  - Löschkaskade.
  - Rechte: nur wer den Inhalt sehen darf, bekommt die Übersetzung.
  - Monatslimit und Warnung bei 80 %.
  - Kein Inhalt in Logs.

**Offene Rechtsfragen:**
1. Reicht der Standard-AVV des Anbieters, oder braucht es einen eigenen Vertrag (inkl. Drittlandklauseln bei US-Mutterkonzern)?
2. Müssen Mitarbeitende informiert werden oder zustimmen, bzw. muss der Betriebsrat mitbestimmen (Chat-Inhalte gehen an einen Dritten)?
3. Ist die automatische Namensmaskierung bei Gast-Freitext ausreichend, um Gastwünsche später einzuschalten?
4. Muss im Verzeichnis der Verarbeitungstätigkeiten und in der Datenschutzinformation für Mitarbeitende ein neuer Empfänger stehen?
