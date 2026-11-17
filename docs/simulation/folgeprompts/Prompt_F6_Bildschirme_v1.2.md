# Prompt F6 — Bildschirme für Housekeeper und Supervisor (v1.2, 16.11.2026)

> **Start im Terminal:** im Ordner `Return-to-elite` `claude` starten (Modell mit `/model` wählen) und eingeben:
> `Lies docs/simulation/folgeprompts/Prompt_F6_Bildschirme_v1.2.md vollständig und arbeite ihn ab. Beginne mit Schritt 0.`

Du arbeitest im Repo StayClean (`Return-to-elite`). Lies zuerst `CLAUDE.md` (Abschnitte Arbeitslisten, Zimmer-Zuteilung), `docs/listen.md` und in `docs/simulation/Fehlerbericht_Simulation_v2.md` die Befunde **H12**, **M1**, **M3**, **M11**, **M12**, **M13**, **M17**, **M19**, **M20** und **M23**.

**Entscheidungen (16.11.2026):** Mängel melden dürfen Housekeeper, Supervisor, Techniker, DM und Gäste. Housekeeper dürfen ein Foto aufnehmen und hochladen. **Fotos sehen nur Techniker, Supervisor und DM** (B9 neu). Fotos werden gelöscht, sobald der Mangel behoben und das Zimmer wieder in Betrieb ist.

Viele kleine Punkte. Arbeite sie in der Reihenfolge unten ab, je Block ein Commit.

## SCHRITT 0 — Ist-Abgleich (keine Codeänderung, Bericht max. 40 Zeilen)

1. Basis prüfen: `git status` muss sauber sein. Der lokale Branch `fix/basis-simulation-v2` muss existieren — sonst STOPP und auf `docs/simulation/folgeprompts/START.md` verweisen. `git ls-remote origin`, `git fetch origin` mit expliziten Refspecs, dann `git log --oneline fix/basis-simulation-v2..design/glass | wc -l` (gibt es neue Commits auf `design/glass`? dann melden). Welche Fix-Pakete sind schon in `fix/basis-simulation-v2` gemergt (`git log --oneline --merges fix/basis-simulation-v2`, Abgleich mit `00_Reihenfolge_v1.2.md`)? Ist das vorige Paket laut Reihenfolge noch nicht gemergt: melden.
2. Jede Datei:Zeile-Angabe unten gegen den aktuellen Code prüfen; Abweichungen auflisten.
3. Lies `docs/simulation/Entscheidungen_Hotel_Simulation_v2_2026-11-16.md`. Die dortigen Entscheidungen gehen den Regeln im Fehlerbericht und in diesem Prompt vor. Widersprüche sofort melden.
4. Geplante Schema-Änderungen nennen (additiv, beide Prisma-Dateien).
**STOPP:** Bericht schicken, auf OK von Simon warten.

## Ausgangslage (geprüft)

- Start und Sollzeit liegen in den Listendaten (`src/lib/lists/dayRows.ts:148–149`), werden bei Housekeeper und Supervisor aber nicht gezeigt.
- Offline-Warteliste nimmt nur Statuswechsel (`src/app/attendant/view.tsx:189`).
- Mangel melden: Server erlaubt Housekeeper, Supervisor, Techniker (`src/app/api/rooms/[id]/defects/route.ts:16`); der Knopf existiert nur bei Housekeepern (`src/app/attendant/view.tsx`, `src/components/hk/HkParts.tsx`).
- Zimmersuche ohne Einschränkung auf eigene Zimmer (`src/app/api/rooms/route.ts:39–42`).
- Wäschewechsel wird beim Fertigmelden automatisch gebucht (`src/lib/rooms/applyStatusChange.ts:138–144`).
- Rush-Knopf des Supervisors existiert (`src/app/supervisor/view.tsx`, `src/components/supervisor/SupervisorRoomDetail.tsx`), wurde in der Simulation von keinem Supervisor gefunden.

## Block 1 — Housekeeper-Liste

1. **Marker (M1, Wunsch aller Housekeeper):** je Zimmer Sollzeit („~60 Min“), Suite, Allergiker, Wäschewechsel als Symbol **mit** Text. Bei „In Arbeit“: Startzeit und laufende Minuten.
2. **Restzeit:** Kopfzeile „noch N Zimmer, etwa X Std“; ruhiger Hinweis, wenn das über Schichtende liegt.
3. **Ausflug (M13):** Zeile zeigt „Gast außer Haus 14:00–18:00“; Meldung nennt die Uhrzeit.
4. **Schichtende (M12):** „Alles erledigt“ nur, wenn kein eigenes Zimmer offen oder abgelehnt ist; sonst Liste der offenen Zimmer. Bei Krankmeldung: „Du bist heute abgemeldet“.
5. **Klartext-Meldungen (M23):** Rush heißt „Sofort: Zimmer 208 zuerst“, nicht „Priorität geändert“. Zimmer dazu/weg mit Grund.
6. **Zwei Zimmer gleichzeitig (M19):** Beim Start eines zweiten Zimmers Rückfrage.
7. **Wäschewechsel (M19):** Beim Fertigmelden eines Zimmers mit fälligem Wechsel kurze Bestätigung „Wäsche gewechselt? ja / nein“; nur bei Ja wird der Wechsel gebucht.

## Block 2 — Offline (H12)

Notizen (und Mangelmeldungen ohne Foto) kommen in dieselbe Warteliste wie Statuswechsel. Was nicht zugestellt werden kann, wird sichtbar gemeldet, nie still verworfen. Test in `tests/offlineQueue.test.ts` ergänzen.

## Block 3 — Supervisor

1. **Zimmerfenster (M1):** Start, Minuten gegen Sollzeit, Kraft, Art.
2. **Mangel melden und Fotos (M3, B9 entschieden):** Knopf „Mangel melden“ mit Foto für Housekeeper (Kamera direkt aus der App), Supervisor, Techniker und DM. Fotos abrufbar nur für Techniker, Supervisor, DM — Server prüft das bei jedem Foto-Abruf (403 für Housekeeper, Hausmann, Front Office, Concierge; Housekeeper sieht nur die Vorschau vor dem Absenden). Supervisor und DM sehen die Fotos im Zimmerfenster; Kachel „Mängel“ öffnet die Liste. **Löschung:** Fotodateien und Verweise werden entfernt, sobald der Auftrag erledigt und das Zimmer wieder in Betrieb ist (Nachtlöschung als Sicherheitsnetz, `CLAUDE.md` ergänzen).
3. **Warteschlange (M11):** Freigabe-Liste nach Dringlichkeit: Rush, dann Anreisezeit, VIP zuerst, dann Wartezeit. „Anreise gefährdet“ in zwei Stufen: vor der Ankunft (Warnung) und überfällig (dringend).
4. **Rush-Knopf (M23):** sichtbar in der Zimmerzeile der Anreisen, nicht nur im Detailfenster.
5. **Rückfragen (M20):** Krankmeldung und Ablehnen fragen einmal nach. Nachrichten an eine krank gemeldete Kraft gehen stattdessen an den Supervisor der Etage, mit Hinweis.

## Block 4 — Datenschutz Suche (M17)

Housekeeper finden über die Suche fremde Zimmer nur mit Nummer, Etage und Status — ohne Gastkennung, VIP und Anreisezeit.

## Wenn Zeit bleibt

Bericht 3.4, Nr. 1, 6, 7, 10.

## Abnahme

- Neue Tests: Foto-Abruf als Housekeeper/Concierge/Front Office = 403, als Techniker/Supervisor/DM = 200; Foto nach „wieder in Betrieb“ gelöscht; Offline-Notiz wird nachgeholt; Suche als Housekeeper liefert für ein fremdes Zimmer keine Gastfelder; Fertigmelden ohne Wäsche-Bestätigung bucht keinen Wechsel; Warteschlangen-Sortierung.
- Tippflächen mindestens 44 px (mit `node scripts/simulation/ui.mjs <person> look --groessen` prüfbar).
- `npm test` grün.

## Grenzen

- B9 entschieden. **Annahmen:** B2, B11, P10. Im Abschlussbericht kennzeichnen.
- Rechteänderung (Foto-Zugriff): vor dem Merge STOPP und Simon fragen.
- Keine neue Zähl- oder Credit-Logik in Komponenten; alles über `loadRoomRows` (`CLAUDE.md`).
- Stufe und Typ einer Kraft nie in Housekeeper-Daten (`tests/autoplan/privacy.test.ts`).
- Eigener Branch von `fix/basis-simulation-v2`, z. B. `feature/f6-bildschirme`. `main`, `design/glass` und Produktion nie anfassen, kein Force-Push, **nicht pushen ohne Rückfrage**. Nur lokale Test-Datenbank, nur erfundene Gastdaten.
- Abschlussbericht für Simon in einfacher Sprache, höchstens 20 Zeilen.

## Abschluss

- Nach dem OK zu Schritt 0: `git switch -c <Branch aus „Grenzen“> fix/basis-simulation-v2`.
- `npm test` und `npm run build` grün. In `tests/simulation/befunde.test.ts` das `.fails` der behobenen Befunde entfernen.
- `CLAUDE.md` ergänzen (höchstens 5 Zeilen, was sich an Regeln/Abläufen geändert hat).
- Commit(s) auf dem Feature-Branch. **Nicht pushen ohne Rückfrage.**
- Abschlussbericht für Simon in einfacher Sprache (siehe „Grenzen“) mit Abnahme-Checkliste für das iPad.
- Erst nach Simons ausdrücklichem OK: `git switch fix/basis-simulation-v2 && git merge --no-ff <Branch>`. Danach `00_Reihenfolge_v1.2.md`: Paket als „gemergt“ markieren, und im Fehlerbericht den Status der Befunde auf „behoben“ setzen.
