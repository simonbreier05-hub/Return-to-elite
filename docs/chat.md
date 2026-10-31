# Chat-Hub

Abteilungsübergreifende Kommunikation für alle Staff-Rollen. Einstieg: erster Eintrag im „Mehr“-Menü jedes Hubs (`HubMoreMenu`), Seite `/chat`.

## Rechte (eine Stelle: `src/lib/chat/policy.ts`)

| Kanal | Lesen + Schreiben |
|---|---|
| Housekeeping | room_attendant, supervisor, duty_manager |
| Technik | engineering, supervisor, duty_manager |
| Front Office | front_office, supervisor, duty_manager |
| Hausmann | houseman, supervisor, duty_manager |

- Concierge: kein Kanal, nur Direktnachrichten.
- Direktnachrichten zwischen allen Rollen, außer Housekeeper: nur mit `Setting chat.housekeeperDmRoles` (Standard `supervisor,duty_manager`), in beide Richtungen; gilt bei jedem Senden.
- Der Duty Manager liest fremde Direktnachrichten nicht im Chat, sondern nur über „Einsicht im Streitfall“ (`/api/chat/review`, Aktenzeichen Pflicht, AuditLog `CHAT_REVIEWED` ohne Inhalt). HR hat keine eigene Rolle.

## API (`/api/chat/*`, Rechte immer serverseitig)

`GET channels` · `GET|POST channels/[id]/messages` · `POST channels/[id]/read` · `POST direct {userId}` · `GET people` · `POST messages/[id]/retract` · `POST join {socketId}` · `GET review` · `GET review/[id]?caseRef=`

## Live (Socket.IO)

Räume `chat:<channelId>` und `user:<userId>`; betreten nur über `POST /api/chat/join` (`joinChatRooms`), gesendet nur mit `emitTo` — nie `broadcast()`. Ereignisse: `chat:message`, `chat:retracted`, `chat:read`, `chat:channels`.

## Daten

`ChatChannel`, `ChatMember` (nur Direkt), `ChatMessage` (`originalLanguage` = `User.language` oder `Setting hotelDefaultLanguage`, Standard `de`; immer Original), `ChatReadState`. Übersetzung (Prompt K) dockt als `ChatMessageTranslation(messageId, targetLanguage, text)` an. `hotelId` leer bis Multi-Tenant; Abfragen über `chatScope()`.

## Datenschutz

Kein Bearbeiten; Zurückziehen nur Autor binnen 5 Minuten, Duty Manager blendet aus (Text gelöscht, gekennzeichnet). Löschung nach `chatRetentionDays` (Standard 14) stündlich und in der Nachtlöschung. Kein Nachrichtentext in AuditLog, Notification oder Logs. Datenschutzhinweis beim ersten Öffnen. Keine Auswertung je Person.
