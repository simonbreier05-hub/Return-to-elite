# Arbeitslisten (Prompt 3)

Drei Listen aus derselben Quelle (`src/lib/lists/dayRows.ts`: `DayRoomPlan` + `Stay` + `Trace`), je eine API und eine Oberfläche.

| Liste | API (nur Rollen) | Oberfläche | Inhalt |
|---|---|---|---|
| Zimmermädchen | `GET /api/lists/housekeeper` (room_attendant) | oben im Housekeeper-Hub (`HousekeeperList`) | eigene Zimmer in Laufplan-Reihenfolge (`Room.routeOrder`, per Drag änderbar), Kopf „x von y" + Credits |
| Supervisor | `GET /api/lists/supervisor` (supervisor; Duty Manager alle Etagen) | im Live-Board (`SupervisorList`) | zugeteilte Etagen, je Housekeeper Fortschritt, Credits, Gruppen (in Arbeit / offen / DND / Anreise ausstehend / erledigt), Traces aller Abteilungen, „durch Nachimport geändert", Stand der Daten, Verschieben/Zuteilen über die bestehenden Routen |
| Hausmann | `GET /api/lists/houseman`, `PATCH /api/traces/[id]` (houseman, supervisor) | Hausmann-Screen (`HousemanList`) | Traces der Abteilung Hausmann des Tages, Zeiten aus dem Text, Etagenfilter, Abhaken per Tap (Zeitstempel + Nutzer im Logbuch) |

## Regeln

- **Gastname**: immer `shortGuestName()` → „Anrede Titel Nachname" (Herr Dr. Krüger, Mr. Smith), ohne Anrede nur der Nachname. Nie Vornamen, nie Alter. Der volle Opera-Name wird nie gespeichert (`Stay.guestName` ist schon die Kurzform); von Hand erfasste Einträge werden in den Listen gekürzt. `/api/rooms` kürzt für Housekeeper ebenfalls.
- **Housekeeper** sehen nur eigene Zimmer und nur Traces der Abteilung Housekeeping.
- **Supervisor** sehen nur ihre Etagen (`floorsFor`): `?floors=` wird für Supervisor ignoriert, ohne zugeteilte Etage ist die Liste leer (mit Hinweis). Verschieben über `POST /api/rooms/[id]/move` ist unverändert (prüft keine Etage).
- **Live**: Socket.IO `room:update`, `assignments:applied`, `dayplan:updated` (geänderte Zimmer werden 3,5 s hervorgehoben), `trace:update`, `roomtask:update`.
- **Verschieben über Etagen** ist erlaubt. Jede Änderung der Zuteilung meldet (`notifyReassignment`): dem neuen und dem bisherigen Zimmermädchen (Zimmer, Etage) und den Supervisoren der Zimmer-Etage bzw. der Etagen des neuen Zimmermädchens (mit Namen, außer dem Verursacher).
- **Nachimport-Hinweis**: aus dem Audit `DAY_PLAN_MERGED` (`changedRooms`, `first`); beim ersten Import des Tages wird nichts als „geändert" markiert.
- **Erledigte Traces** bleiben erledigt (`Trace.status`/`doneAt`, Schlüssel `dedupeKey`); Abhaken zieht die verknüpfte Aufgabe (`RoomTask`) mit und umgekehrt.
- Credits: Typ-Wert × Faktor wie im Zuteilungsvorschlag (`creditFactor`: Bleiber normal 0,5, mit Wäschewechsel voll); reine Anreisen zählen nicht.

## Tests

`tests/lists/*` (Rollen, Namensanzeige, Etagen-Zugriff, Gruppen, Abhaken, Logbuch), `tests/dayplanMerge.integration.test.ts` (Hausmann-Liste nach Nachimport). Mobile-Screenshots (390 px, erfundene Daten) in `docs/design/listen/`.

## H2 (01.11.2026): Kennzeichnung und Detailfenster

- **Hauptlabel je Zeile** (Farbe + Icon + Text): Turn (Messing, höchste Dringlichkeit), Abreise, Bleiber, Anreise. **Zusatzmarker:** VIP, DND, Wäschewechsel fällig, Mangel offen, Gastwunsch, Hinweis.
- **Reihenfolge** (nur Anzeige, die Route ändert sich nicht): „Turns & VIP zuerst" (Standard), „Route", „Nach Art" (gruppiert). Die Wahl gilt für die Sitzung. Die Legende ist einklappbar.
- **Zimmernummer antippen** öffnet das gemeinsame Detailfenster (`RoomDetailModal`): Status, Zuteilung, Mängel, Gastwünsche, Notizen. Notizen, die der Supervisor schon in der Planung einträgt, erscheinen in der Liste des Housekeepers als „📝 Hinweis".
