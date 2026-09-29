# Gäste-API — Schnittstelle für den PWA/Gästebildschirm

Dieses Dokument beschreibt die HTTP-Schnittstelle, mit der der Gäste-Screen
(`src/components/guest/GuestView.tsx`, gerendert unter `/g/r/[roomCode]` und
`/g/s/[stayToken]`) mit dem StayClean-Backend spricht. Es ist die Grundlage
für parallele Frontend-/PWA-Arbeit, unabhängig vom Hub-Code.

## Grundprinzipien

- Kein Login, kein Passwort. Jeder Endpunkt ist unauthentifiziert — die
  Sicherheit kommt aus dem Code/Token selbst (siehe unten), nicht aus einer
  Session.
- Alle Gäste-Endpunkte liegen unter `/api/guest/*`, alle Gäste-Seiten unter
  `/g/*` (eigene Route-Gruppe, eigenes Layout, kein Hub-Header, keine
  Session) — siehe `src/app/g/layout.tsx`.
- **Nirgends im Gäste-Bereich taucht die Zimmernummer in der URL auf** —
  weder im QR-/NFC-Code noch im Pre-Arrival-Link. Angezeigt wird sie dem
  Gast auf der Seite selbst (er steht ja im Zimmer), aber nie in einem
  Link, der sich erraten oder weiterleiten ließe.
- Jede Anfrage erzeugt serverseitig eine `Notification` (oder einen
  `RoomNote`/`Defect`-Eintrag) und wird per Socket.IO (`broadcast(...)`) an
  die Hub-Screens live weitergereicht.
- Absender ist immer ein einziges, geteiltes Systemkonto
  (`GUEST_SYSTEM_EMAIL`, siehe `src/lib/guest.ts`) — es gibt keine
  personenbezogene Gäste-Identität in der DB, außer optional dem Vornamen.
- Jeder Fehlerfall (unbekannter Code/Token, kein aktueller Aufenthalt,
  abgelaufen, storniert) liefert **dieselbe** neutrale Antwort — nie wird
  unterschieden, *warum* der Zugang nicht funktioniert. Das verhindert, dass
  jemand durch Ausprobieren lernt, ob ein Code echt ist.

## Zwei Zugangswege, ein Ziel

### 1. NFC-Tag / QR-Code am Zimmer — `roomCode`

```
GET /g/r/:roomCode
```

`roomCode` ist ein fester, zufälliger, nicht erratbarer Code pro Zimmer
(`Room.guestAccessCode`, 128 Bit, siehe `src/lib/guestRoomCode.ts`). Löst
**immer zum aktuellen Aufenthalt** des Zimmers auf — konkret: dem `Stay` mit
`status = "IN_HOUSE"` für dieses Zimmer (`src/lib/guestStay.ts`,
`currentStayForRoom`). Kein aktueller Aufenthalt → neutrale Seite „Zurzeit
nicht verfügbar“, keine Aktionen.

Der Code ist über die Zeit stabil (dasselbe gedruckte/programmierte Tag
funktioniert für jeden künftigen Gast in diesem Zimmer) und **jederzeit neu
erzeugbar**, falls ein Tag verloren geht — über die Generator-Seite
`/supervisor/guest-access` (Supervisor/Admin). Der alte Code funktioniert
danach sofort nicht mehr.

### 2. Pre-Arrival-E-Mail-Link — `stayToken`

```
GET /g/s/:stayToken
```

`stayToken` ist an einen konkreten Aufenthalt gebunden (`Stay.stayToken`,
128 Bit). Gültig **ab dem Anreisetag** (Mitternacht) — funktioniert also
schon vor dem eigentlichen Check-in — und läuft **nach der Abreise** ab, mit
Kulanzfrist (Setting `guestStayTokenGraceMinutes`, Standard 120 Minuten).
Ein `Stay` mit `status = "CANCELLED"` löst nie auf, unabhängig vom Datum.
Siehe `src/lib/guestStay.ts`, `isStayTokenValid`.

## Endpunkte

Jeder der fünf Gäste-Aktionen liegt unter beiden Zugangswegen, identisch bis
auf das Pfad-Präfix:

```
POST /api/guest/r/:roomCode/:action
POST /api/guest/s/:stayToken/:action
```

`:action` ∈ `dnd` | `dnd-cancel` | `clean-request` | `defect` | `contact` |
`notes`. Antworten sind `application/json`, außer beim Mängel-Endpunkt
(Request), der `multipart/form-data` erwartet. Beide Routen teilen sich
dieselbe Implementierung (`src/lib/guestActions.ts`) — sie unterscheiden sich
nur in der Auflösung des Zugangs (`resolveGuestAccessByRoomCode` vs.
`resolveGuestAccessByStayToken`, `src/lib/guestServer.ts`).

### `.../dnd`

„Bitte nicht stören“.

**Request**
```json
{ "window": "NOW" | "TWO_HOURS" | "MORNING" | "UNTIL_FURTHER" }
```

**Response `201`**
```json
{ "ok": true, "requestId": "..." }
```

**Fehler**
| Status | Wann |
|---|---|
| 400 | `window` fehlt/ungültig |
| 404 | Code/Token unbekannt, kein aktueller Aufenthalt, oder abgelaufen |
| 429 | Rate-Limit erreicht (siehe unten) |

Setzt **nicht** direkt `Room.status`/`blockReason` (das bleibt Personal
vorbehalten, siehe State-Machine) — erzeugt stattdessen eine
`Notification` (`type: GUEST_REQUEST`, `targetRole: supervisor`), die der
Supervisor sieht und übernehmen kann, **und** einen `GuestRequest`-Eintrag
(Status `RECEIVED`), der den Status-Feed unten und das
„zurücknehmen“-Recht unter `dnd-cancel` trägt.

### `.../dnd-cancel`

Nimmt das eigene, noch offene „Bitte nicht stören“ zurück (Prompt G2 Teil 3:
„Gast kann eine DND-Einstellung selbst zurücknehmen“). Kein Request-Body.

**Response `200`**: `{ "ok": true }`. **Fehler**: wie `dnd`, plus `400`, wenn
gerade kein aktives DND für dieses Zimmer offen ist.

Setzt den zugehörigen `GuestRequest` auf `CANCELLED` und informiert das
Personal per `Notification` — rührt, wie `dnd` selbst, `Room.status`/
`blockReason` nicht an.

### `.../clean-request`

Reinigungswunsch.

**Request**
```json
{
  "timing": "NOW" | "IN_30" | "LATER",
  "time": "HH:MM"   // nur bei timing = "LATER", z. B. "15:00"
}
```

**Response `201`**: `{ "ok": true, "requestId": "..." }`. **Fehler**: wie
`dnd`, plus 400 bei `time` nicht im Format `HH:MM`.

Erzeugt `Notification` + `GuestRequest` wie `dnd`. Fließt in die
Prioritäts-Engine ein (Prompt G2 Teil 4, `src/lib/priority/computePriority.ts`):
`timing: "NOW"` zählt genauso viel wie Front Office „jetzt benötigt“,
`IN_30`/`LATER` proportional weniger — das Zimmer springt entsprechend in
der Housekeeper-Route nach oben.

### `.../defect`

Mängelmeldung, inkl. optionalem Foto. **Einziger Endpunkt mit
`multipart/form-data`** statt JSON.

**Request** (`FormData`)
| Feld | Pflicht | Beschreibung |
|---|---|---|
| `category` | ja | einer aus `PLUMBING`, `ELECTRICAL`, `HVAC`, `FURNITURE`, `IT_TV`, `MINIBAR`, `OTHER` |
| `note` | ja | Freitext-Beschreibung, max. 1000 Zeichen, HTML-bereinigt |
| `photo` | nein | Bilddatei, max. 8 MB |

**Response `201`**
```json
{ "defect": { "id": "...", "roomId": "...", "category": "...", "note": "...", "photoPath": "/api/uploads/...", "createdAt": "..." } }
```

**Fehler**: wie `dnd`, plus 400 bei fehlendem `multipart/form-data`-Body,
ungültiger/leerer `category`/`note`, `note` > 1000 Zeichen, oder Foto > 8 MB.

Landet als echter `Defect` (Quelle wie jede Personal-Meldung) im
Techniker-Hub — inkl. `WorkOrder`. Fotos liegen privat unter `./uploads`
(nie unter `public/`) und sind ausschließlich über die zugriffsgeschützte
Route `GET /api/uploads/<datei>` erreichbar (`requireAuth()` — jedes
angemeldete Personalkonto, kein anonymer Zugriff; siehe
`src/app/api/uploads/[...path]/route.ts`).

### `.../contact`

Abteilung kontaktieren.

**Request**
```json
{ "department": "housekeeping" | "room_service" | "concierge" | "engineering" }
```

Siehe `CONTACT_DEPARTMENTS` in `src/lib/guest.ts` für die vollständige
Zuordnung (Anzeigename → interne Rolle). **Response `201`**:
`{ "ok": true, "requestId": "..." }`. **Fehler**: wie `dnd`, plus 400 bei
unbekanntem `department`. Erzeugt `Notification` + `GuestRequest` wie `dnd`.

### `.../notes`

Freitext-Nachricht ans Housekeeping.

**Request**
```json
{ "body": "..." }   // 1–2000 Zeichen, HTML-bereinigt
```

**Response `201`**
```json
{ "note": { "id": "...", "roomId": "...", "body": "...", "status": "OPEN", "createdAt": "..." } }
```

**Fehler**: wie `dnd`, plus 400 bei fehlendem/leerem/zu langem `body`.

Landet als normaler `RoomNote`-Eintrag (wie jede Personal-Notiz).

## Status-Feed (Prompt G2 Teil 3)

```
GET /api/guest/r/:roomCode/status
GET /api/guest/s/:stayToken/status
```

Alles, was der Gast selbst für dieses Zimmer eingereicht hat, vereinheitlicht
auf `RECEIVED` | `IN_PROGRESS` | `DONE` | `CANCELLED` — die Grundlage für
„Eingegangen / In Bearbeitung / Erledigt“ auf dem Gäte-Screen. Vom
Guest-Screen alle 15 s gepollt (`src/components/guest/useGuestStatusFeed.ts`),
**nicht** über den Socket.IO-Broadcast, den die Hub-Screens nutzen: der
sendet volle Staff-Payloads (Housekeeper-Namen, andere Zimmer) unauthentifiziert
an jeden verbundenen Client — für einen Gast-Browser wäre das genau das
Datenleck, das Teil 2 explizit ausschließt.

**Response `200`**
```json
{
  "items": [
    { "id": "...", "kind": "DND" | "CLEAN_REQUEST" | "CONTACT" | "DEFECT" | "NOTE",
      "detail": "...", "status": "RECEIVED" | "IN_PROGRESS" | "DONE" | "CANCELLED",
      "createdAt": "..." }
  ],
  "activeDnd": { "id": "...", "detail": "..." } | null
}
```

`detail` ist **absichtlich unübersetzt** (z. B. `{"window":"NOW"}` für DND,
roher Kategorie-Code für Mängel, der Nachrichtentext für `NOTE`) — der Client
übersetzt es in die gerade aktive Sprache, nicht der Server zum
Erstellungszeitpunkt. `activeDnd` ist gesetzt, solange ein `GuestRequest` vom
Kind `DND` noch `RECEIVED`/`IN_PROGRESS` ist — treibt die
„zurücknehmen“-Kachel auf dem Screen. Nur Zeilen der letzten 24 h, max. 20;
nie ein von Personal verfasster Eintrag (Filter auf den Systemkonto-Autor —
siehe `src/lib/guestStatusFeed.ts`).

## Rate-Limits

Ein Limit **pro Zimmer + IP, über alle fünf Aktionen hinweg** (nicht pro
Endpunkt einzeln) — Setting `guestRateLimitPerHour`, Standard 5
Anfragen/Stunde, rollierendes Fenster. Überschreitung → `429` mit
`Retry-After`-Header (Sekunden). Implementierung: in-process (kein
DB-Zugriff), zurückgesetzt bei jedem Neustart — ausreichend, weil StayClean
als ein einzelner Railway-Service läuft. Siehe `src/lib/guestRateLimit.ts`.

## Freitext-Bereinigung

`note` (Mängelmeldung) und `body` (Nachricht) laufen durch
`sanitizeGuestText()` (`src/lib/guestSanitize.ts`): HTML-Tags und
Steuerzeichen werden entfernt, Whitespace normalisiert. React entschärft
XSS beim Rendern ohnehin selbst — das ist zusätzliche Absicherung für
Konsumenten, die das nicht tun (z. B. ein künftiger PDF-/E-Mail-Export).

## Sprache (DE/EN)

Der Guest-Screen hat sein eigenes, vom Staff-Hub komplett getrenntes
i18n-System: `src/lib/guestI18n/translations.ts` (Wörterbuch),
`GuestLocaleContext.tsx` (Provider). Erkennungsreihenfolge: 1) eine bereits
auf diesem Gerät getroffene Wahl (localStorage), 2) `Stay.language` (vom
Server mitgegeben — siehe `GuestView`'s `stayLanguage`-Prop), 3)
Browsersprache, 4) Deutsch als Fallback. Der sichtbare DE/EN-Umschalter
(`GuestLanguageSwitcher`) überschreibt das dauerhaft für dieses Gerät. Eine
dritte Sprache hinzuzufügen heißt: ein weiteres Objekt in
`translations.ts` + einen Eintrag in `GUEST_LOCALES` — sonst nichts.

## Generator für QR-/NFC-Inhalte

`/supervisor/guest-access` (Rolle `supervisor`/`duty_manager`): Tabelle mit
jedem Zimmer, seinem `roomCode` und der vollen NFC/QR-URL, Kopieren-Button,
Download als Text-Liste, sowie „Neu erzeugen“ pro Zimmer (für ein verlorenes
Tag — der alte Code funktioniert danach sofort nicht mehr).
`/supervisor/guest-access/print` rendert dieselben Zimmer als Karten mit
echtem QR-Code (Bibliothek `qrcode`) und Zimmernummer im Klartext (nur für
das Personal sichtbar) — Drucken/„Als PDF speichern“ über den
Browser-Druckdialog, kein serverseitiges PDF-Rendering nötig.

## PWA / Offline

Jeder JSON-Body-Endpunkt (`dnd`, `dnd-cancel`, `clean-request`, `contact`,
`notes`) läuft über dieselbe Offline-Queue-Mechanik wie der Staff-Hub
(`src/lib/offline/actionQueue.ts`, eigene Instanz für Gäste unter
`src/components/guest/useGuestOfflineQueue.ts`, eigener localStorage-Key):
schlägt die Anfrage mangels Verbindung fehl, wird sie lokal gespeichert und
automatisch erneut gesendet, sobald die Verbindung zurück ist — nie eine
Aktion still verlieren. **Ausnahme:** `defect` (Mängelmeldung mit Foto,
`multipart/form-data`) ist nicht in der Queue — die Warteschlange kann nur
JSON-Bodies wiedergeben, nicht Dateien. Bei fehlender Verbindung zeigt der
Screen das direkt an (`GuestOfflineBar`) statt die Meldung zu verlieren.

## Wirkung im Hotelbetrieb (Prompt G2 Teil 4)

- **DND:** Ein aktives Gast-DND (kein `Room.status`/`blockReason` — reine
  `GuestRequest`-Abfrage) erscheint sofort als 🔕-Icon im Grundriss
  (`/floor-plan`, Planungshub), in der Supervisor-Zimmerliste (eigene KPI-
  Kachel + Filter + Abschnitt „Gast: Bitte nicht stören“) und auf dem
  Housekeeper-Screen. Ein Room Attendant kann ein Zimmer mit aktivem
  Gast-DND nicht auf „In Bearbeitung“ setzen (`applyStatusChange`, 409 „Guest
  has Do Not Disturb active“); ein Supervisor/Duty Manager kann es trotzdem
  starten — die Prüfung greift nur für `room_attendant`.
- **Reinigungswunsch:** siehe oben — fließt jetzt real in
  `computePriority()` ein.
- **Mängelmeldung:** landet unverändert im Techniker-Hub (`WorkOrder`);
  zeigt dort zusätzlich ein „Gast“-Badge, wenn `reportedBy.role === "guest"`.
  Im Zimmer-Modal (`RoomDetailModal`) jetzt ebenfalls sichtbar (vorher fehlte
  die Melder-Anzeige dort komplett).
- **Abteilungskontakt/Freitext:** unverändert `Notification`/`RoomNote`,
  jeweils klar als Gast-Herkunft erkennbar (Autor-Rolle „guest“ bzw.
  „Gast“-Badge).
- **Zimmer-Logbuch:** jede Gästeaktion (auch `dnd`/`dnd-cancel`/
  `clean-request`/`contact`, die vorher nur eine flüchtige `Notification`
  erzeugten) schreibt jetzt einen `AuditLog`-Eintrag, zugeordnet auf das
  Gäste-Systemkonto. `RoomDetailModal` zeigt zusätzlich einen
  „Gästeanfragen“-Abschnitt mit den offenen `GuestRequest`-Zeilen des
  Zimmers.
- **Supervisor-Verwaltung:** `/supervisor/guest-requests` — einsehen (offen
  oder alle), per „Übernehmen“ zuweisen, Status auf „In Bearbeitung“/
  „Erledigt“ setzen. `GET`/`PATCH /api/guest-requests(/[id])`,
  Rolle `supervisor`/`duty_manager`. Jede Änderung landet beim nächsten Poll
  des Gäste-Screens (siehe Status-Feed oben) — das ist die Schreibseite von
  „jede Antwort/Erledigung wird dem Gast als Status angezeigt“.

## Datenschutz (DSGVO)

- **Mängel-Fotos**: privat unter `./uploads` (nie `public/`), nur über
  `GET /api/uploads/<datei>` lesbar (`requireAuth()`, plus Segment- und
  Pfad-Sanity-Checks gegen Traversal). Siehe
  `src/app/api/uploads/[...path]/route.ts`.
- **Automatische Löschung/Anonymisierung**: `src/lib/guestDataRetention.ts`,
  ausgeführt stündlich vom Ticker in `server.js`
  (`POST /api/internal/guest-data-retention`; ein duty_manager kann sie auch
  manuell auslösen). Betrifft nur bereits abgeschlossene/erledigte Daten,
  älter als `Setting.guestDataRetentionDays` (Standard 30 Tage, überschreibbar
  wie jede andere House-Policy-Zahl über `src/lib/settings.ts`):
  - `GuestRequest` (DND/Reinigungswunsch/Kontakt): gelöscht, sobald
    `DONE`/`CANCELLED` und älter als die Frist.
  - Gast-gemeldete `Defect`-Fotos: Datei wird gelöscht und `photoPath`
    genullt; der `Defect`/`WorkOrder`-Datensatz selbst bleibt (Wartungshistorie
    des Technik-Teams, keine Gastdaten).
  - Gast-verfasste `RoomNote`-Freitexte: gelöscht, sobald `DONE` und älter als
    die Frist.
  - Noch offene Einträge werden nie automatisch gelöscht — ein vergessener,
    nie bearbeiteter Gästewunsch soll nicht kommentarlos verschwinden.
  - `AuditLog`-Einträge (Zimmer-Logbuch) sind bewusst ausgenommen — das ist
    das eigene Nachvollziehbarkeits-Protokoll des Hauses, eine separate
    Aufbewahrungsfrage.

## Offene Punkte

- Live-Aktualisierung ist Polling (alle 15 s), kein Push — bewusste
  Sicherheitsentscheidung (siehe Status-Feed-Abschnitt oben), aber spürbar
  langsamer als die Hub-Screens' Socket.IO-Updates.
- `Stay.status` wird nirgends automatisch auf `CHECKED_OUT` gesetzt (keine
  PMS-Anbindung) — die Löschfrist oben zählt daher ab Erstellung der
  jeweiligen Gast-Daten, nicht ab einem tatsächlichen Abreise-Zeitpunkt.
- Rechtstexte (Impressum, Datenschutzerklärung, ggf. AVV) sind weiterhin
  Platzhalter — das ist eine juristische, keine technische Entscheidung.
