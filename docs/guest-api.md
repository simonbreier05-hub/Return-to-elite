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

`:action` ∈ `dnd` | `clean-request` | `defect` | `contact` | `notes`.
Antworten sind `application/json`, außer beim Mängel-Endpunkt (Request), der
`multipart/form-data` erwartet. Beide Routen teilen sich dieselbe
Implementierung (`src/lib/guestActions.ts`) — sie unterscheiden sich nur in
der Auflösung des Zugangs (`resolveGuestAccessByRoomCode` vs.
`resolveGuestAccessByStayToken`, `src/lib/guestServer.ts`).

### `.../dnd`

„Bitte nicht stören“.

**Request**
```json
{ "window": "NOW" | "TWO_HOURS" | "MORNING" | "UNTIL_FURTHER" }
```

**Response `201`**
```json
{ "ok": true }
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
Supervisor sieht und übernehmen kann.

### `.../clean-request`

Reinigungswunsch.

**Request**
```json
{
  "timing": "NOW" | "IN_30" | "LATER",
  "time": "HH:MM"   // nur bei timing = "LATER", z. B. "15:00"
}
```

**Response `201`**: `{ "ok": true }`. **Fehler**: wie `dnd`, plus 400 bei
`time` nicht im Format `HH:MM`.

Erzeugt aktuell ebenfalls nur eine `Notification`. **Noch nicht
angebunden:** automatischer Sprung auf Priorität „jetzt benötigt“ in der
Housekeeper-Route (`src/lib/priority/computePriority.ts`) — folgt in
Teil 4.

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
{ "defect": { "id": "...", "roomId": "...", "category": "...", "note": "...", "photoPath": "/uploads/...", "createdAt": "..." } }
```

**Fehler**: wie `dnd`, plus 400 bei fehlendem `multipart/form-data`-Body,
ungültiger/leerer `category`/`note`, `note` > 1000 Zeichen, oder Foto > 8 MB.

Landet als echter `Defect` (Quelle wie jede Personal-Meldung) im
Techniker-Hub — inkl. `WorkOrder`. Fotos liegen unter `/uploads/*`
(**noch nicht** signiert/zugriffsgeschützt — offener DSGVO-Punkt, siehe
`Prompt_G2_Gaeste_Screen_v1.md`, Abschnitt Datenschutz).

### `.../contact`

Abteilung kontaktieren.

**Request**
```json
{ "department": "housekeeping" | "room_service" | "concierge" | "engineering" }
```

Siehe `CONTACT_DEPARTMENTS` in `src/lib/guest.ts` für die vollständige
Zuordnung (Anzeigename → interne Rolle). **Response `201`**: `{ "ok": true }`.
**Fehler**: wie `dnd`, plus 400 bei unbekanntem `department`.

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

## Generator für QR-/NFC-Inhalte

`/supervisor/guest-access` (Rolle `supervisor`/`duty_manager`): Tabelle mit
jedem Zimmer, seinem `roomCode` und der vollen NFC/QR-URL, Kopieren-Button,
Download als Text-Liste, sowie „Neu erzeugen“ pro Zimmer (für ein verlorenes
Tag — der alte Code funktioniert danach sofort nicht mehr).
`/supervisor/guest-access/print` rendert dieselben Zimmer als Karten mit
echtem QR-Code (Bibliothek `qrcode`) und Zimmernummer im Klartext (nur für
das Personal sichtbar) — Drucken/„Als PDF speichern“ über den
Browser-Druckdialog, kein serverseitiges PDF-Rendering nötig.

## Offene Punkte

- Reinigungswunsch löst noch keinen Prioritäts-Sprung aus (Teil 4).
- Mängel-Fotos unter `/uploads/*` sind noch nicht zugriffsgeschützt (DSGVO,
  siehe Prompt-Datei).
- Automatische Löschung/Anonymisierung nach Abreise (Standard 30 Tage) ist
  noch nicht gebaut.
