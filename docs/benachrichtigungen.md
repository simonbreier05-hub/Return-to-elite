# Meldungs-Zentrum (Paket O1)

Basis: `design/glass` @ `f72d413` (kein P-Fix-Branch auf `origin` gefunden).

## Wie es funktioniert

- **Quelle**: Server legt `Notification` an und sendet `notification:new` (Broadcast); Chat sendet `chat:message` in Chat-Räume.
- **Client** (`src/components/notify/`, Regeln rein in `src/lib/ui/notify.ts`): bei `notification:new` lädt er
  `GET /api/notifications` nach (Server filtert, liefert `me`), zeigt nur neue, ungelesene, **an mich** gerichtete Meldungen.
  1–2 gleichzeitig → je ein Pop-up, ab 3 → „N neue Meldungen“. Max. 3 gestapelt. Normal 8 s, dringend
  (`warning`/`critical`, Chat dringend) bleibt bis Antippen. Antippen: Zimmer → Zimmerfenster, Chat → Kanal,
  Auftrag → `/engineering`, sonst Liste. CHAT-Meldungen kein zweites Pop-up (das Chat-Pop-up kommt schon).
- **Ton** (`src/lib/ui/notifySound.ts`): Web Audio, selbst erzeugt; dringend = zweimal. Einstellung je Gerät
  `localStorage["stayclean.sound"]` (`on`/`off`, unset = Banner „Ton aktivieren“). Safari: Freigabe per Tipp; ist der Ton an,
  entsperrt die erste Berührung nach jedem Laden. Testhaken: `window`-Event `stayclean:sound`.
- **Wiederöffnen**: Socket-Reconnect, `visibilitychange` → sichtbar, `online` → Meldungen neu laden, Banner „N neue Meldungen“
  (bleibt bis geöffnet) + Ton, und `app:resync` an alle Ansichten (`useSocket({ "app:resync": … })`). Offline > 3 s → „Verbindung weg“.
  Gesehene IDs in `sessionStorage` (`stayclean.notify.seen`), damit Seitenwechsel nichts doppelt meldet.
- **Gelesen**: `PATCH /api/notifications` quittiert nur Meldungen an die eigene Rolle *ohne Person* oder an mich persönlich —
  auch beim Duty Manager (liest alle, quittiert nichts Fremdes). Zähler/Pop-up zählen nur „meine“.

## Meldungsstellen (vorher → nachher)

| Anlass | Datei | Empfänger | Gastname? |
|---|---|---|---|
| Zimmer zugeteilt/entfernt/verschoben | `rooms/notifyReassignment.ts`, `notifyBulkReassignment.ts` | HK (Person), Etagen-Supervisor | nein |
| Plan bestätigt | `rooms/notifyPlan.ts` | HK, Hausmann, Supervisor, DM (Person, dedupe) | nein |
| Nachimport/Art geändert | `rooms/notifyListUpdate.ts` | HK **nur mit heutiger Zuteilung** (neu), HM, Sup, DM | nein |
| Notiz/Trace/DND/Gastwunsch/Priorität | `rooms/notifyRoomChange.ts` | zuständige HK (`assignedToId` + `assignedOn = heute`) | nein |
| Gast-DND/Reinigung/Kontakt | `guestActions.ts` | Supervisor (Rolle) + zuständige HK (war schon da) | nein |
| Ablehnung/Nacharbeit (→ PICKUP) | `applyStatusChange.ts` | **neu**: zuständige HK, dringend, ohne Notiztext | nein |
| Zimmer freigegeben | `applyStatusChange.ts` | FO (Rolle) | **vorher ja → jetzt nein** |
| Anreise gefährdet | `escalations.ts` | Supervisor (Rolle) | **vorher ja → jetzt nein** |
| Ausflug angelegt / bald zurück | `api/excursions`, `escalations.ts` | **neu**: zuständige HK (dedupe je Ausflug) | nein |
| FO „Sofort“/VIP-Frühanreise | `api/arrivals/[id]` | HK (war da) + **neu** Supervisor der Etage (sonst Rolle) | nein |
| Mangel behoben | `api/workorders/[id]` | Supervisor (Rolle) + **neu** zuständige und meldende HK | nein |
| Hand-Aufgabe (RoomTask) erledigt | `api/roomtasks/[id]` | **neu**: Etagen-Supervisor | nein |
| Trace erledigt | `api/traces/[id]`, `rooms/[id]/traces/[traceId]` | Etagen-Supervisor | nein |
| Neue Aufgabe / Auftrag | `rooms/createRoomTask.ts`, `rooms/reportDefect.ts` | Hausmann / Technik (Rolle) | Freitext `note` (s. offen) |
| Chat dringend/Erwähnung, Zimmer-Nachricht | `chat/service.ts`, `work/messages.ts` | Person | nein |
| Etagen, Hausmann-Zuteilung, Umverteilung, Personalbedarf, Eskalationen | diverse | Person bzw. Rolle | nein |

## Offen / später

- **Gelesen je Person** braucht eine additive Tabelle, z. B. `NotificationRead { notificationId, userId, readAt, @@unique([notificationId, userId]) }`
  (+ Regel in `purgeGuestDataNow` nicht nötig, keine Gastdaten). Nicht gebaut — Freigabe nötig.
- Nacharbeits-Grund als Textschlüssel: es gibt keine Grund-Codes, nur Freitext (`reworkNote`); Meldung nennt deshalb keinen Grund.
- `notify.newTaskNote`/`notify.newWorkOrder` tragen Freitext (`note`) in `messageVars`; ein vom Gast gemeldeter Mangel kann dort Text des Gastes enthalten.
- `BLOCKED_RECHECK` geht an alle HK (Rolle), nicht an die zuständige.
- **Web-Push** (später): `public/sw.js` cacht nur statische Dateien. Möglich mit Push-API + VAPID-Schlüsseln, Tabelle für
  Abos (Schema-Änderung) und `push`/`notificationclick` im Service Worker; iPad nur als installierte Web-App (iPadOS ≥ 16.4).
