# Prompt F6 — Bildschirme für Housekeeper und Supervisor

Du arbeitest im Repo StayClean (`Return-to-elite`). Lies zuerst `CLAUDE.md` (Abschnitte Arbeitslisten, Zimmer-Zuteilung), `docs/listen.md` und in `docs/simulation/Fehlerbericht_Simulation_v2.md` die Befunde **H12**, **M1**, **M3**, **M11**, **M12**, **M13**, **M17**, **M19**, **M20** und **M23**.

Viele kleine Punkte. Arbeite sie in der Reihenfolge unten ab, je Block ein Commit.

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
2. **Mangel melden und Fotos (M3, Annahme B9):** Knopf „Mangel melden“ mit Foto für Supervisor und Techniker. Supervisor und Duty Manager sehen Mangel-Fotos im Zimmerfenster; Kachel „Mängel“ öffnet die Liste.
3. **Warteschlange (M11):** Freigabe-Liste nach Dringlichkeit: Rush, dann Anreisezeit, VIP zuerst, dann Wartezeit. „Anreise gefährdet“ in zwei Stufen: vor der Ankunft (Warnung) und überfällig (dringend).
4. **Rush-Knopf (M23):** sichtbar in der Zimmerzeile der Anreisen, nicht nur im Detailfenster.
5. **Rückfragen (M20):** Krankmeldung und Ablehnen fragen einmal nach. Nachrichten an eine krank gemeldete Kraft gehen stattdessen an den Supervisor der Etage, mit Hinweis.

## Block 4 — Datenschutz Suche (M17)

Housekeeper finden über die Suche fremde Zimmer nur mit Nummer, Etage und Status — ohne Gastkennung, VIP und Anreisezeit.

## Wenn Zeit bleibt

Bericht 3.4, Nr. 1, 6, 7, 10.

## Abnahme

- Neue Tests: Offline-Notiz wird nachgeholt; Suche als Housekeeper liefert für ein fremdes Zimmer keine Gastfelder; Fertigmelden ohne Wäsche-Bestätigung bucht keinen Wechsel; Warteschlangen-Sortierung.
- Tippflächen mindestens 44 px (mit `node scripts/simulation/ui.mjs <person> look --groessen` prüfbar).
- `npm test` grün.

## Grenzen

- **Annahmen:** B2, B9, B11, P10. Im Abschlussbericht kennzeichnen.
- Keine neue Zähl- oder Credit-Logik in Komponenten; alles über `loadRoomRows` (`CLAUDE.md`).
- Stufe und Typ einer Kraft nie in Housekeeper-Daten (`tests/autoplan/privacy.test.ts`).
- Eigener Branch von `design/glass`, z. B. `feature/f6-bildschirme`. `main` und Produktion nie anfassen, **nicht pushen ohne Rückfrage**. Nur lokale Test-Datenbank, nur erfundene Gastdaten.
- Abschlussbericht für Simon in einfacher Sprache, höchstens 20 Zeilen.
