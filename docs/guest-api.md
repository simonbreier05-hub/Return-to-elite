# Gäste-API — Schnittstelle für den PWA/Gästebildschirm

Dieses Dokument beschreibt die HTTP-Schnittstelle, mit der der Gäste-Screen
(`src/app/g/[roomNumber]`) mit dem StayClean-Backend spricht. Es ist die
Grundlage für parallele Frontend-/PWA-Arbeit, unabhängig vom Hub-Code.

> **Status:** Dies dokumentiert den heutigen (Zwischen-)Stand. Der
> Zugangsweg wird sich mit Prompt G2 Teil 2 ändern (siehe
> [Geplant: Zugang über Code/Token](#geplant-zugang-über-codetoken) unten) —
> die Endpunkt-Pfade und Bodies selbst bleiben dabei stabil.

## Grundprinzipien

- Kein Login, kein Passwort. Jeder Endpunkt ist unauthentifiziert.
- Alle Gäste-Endpunkte liegen unter `/api/guest/*`, alle Gäste-Seiten unter
  `/g/*` (eigene Route-Gruppe, eigenes Layout, kein Hub-Header, keine
  Session) — siehe `src/app/g/layout.tsx`.
- Jede Anfrage erzeugt serverseitig eine `Notification` (oder einen
  `RoomNote`/`Defect`-Eintrag) und wird per Socket.IO (`broadcast(...)`) an
  die Hub-Screens live weitergereicht.
- Absender ist immer ein einziges, geteiltes Systemkonto
  (`GUEST_SYSTEM_EMAIL`, siehe `src/lib/guest.ts`) — es gibt keine
  personenbezogene Gäste-Identität in der DB, außer optional dem Vornamen
  (aktuell noch nicht angebunden, siehe unten).

## Seiten-Route

```
GET /g/:roomNumber
```

Löst die Zimmernummer aus der URL auf (`getGuestRoom`, `src/lib/guestServer.ts`).
Gibt es das Zimmer nicht, wird eine neutrale „Zimmer nicht gefunden“-Seite
gerendert (kein Redirect, kein 404-Fehlerstatus nötig — Next.js liefert die
Seite normal aus).

## Endpunkte

Alle POST-Endpunkte erwarten `roomNumber` als Pfad-Parameter, z. B.
`/api/guest/412/dnd`. Antworten sind `application/json`, außer beim
Mängel-Endpunkt (Request), der `multipart/form-data` erwartet.

### `POST /api/guest/:roomNumber/dnd`

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
| 404 | Zimmer existiert nicht |

Setzt **nicht** direkt `Room.status`/`blockReason` (das bleibt Personal
vorbehalten, siehe State-Machine) — erzeugt stattdessen eine
`Notification` (`type: GUEST_REQUEST`, `targetRole: supervisor`), die der
Supervisor sieht und übernehmen kann.

### `POST /api/guest/:roomNumber/clean-request`

Reinigungswunsch.

**Request**
```json
{
  "timing": "NOW" | "IN_30" | "LATER",
  "time": "HH:MM"   // nur bei timing = "LATER", z. B. "15:00"
}
```

**Response `201`**
```json
{ "ok": true }
```

**Fehler**
| Status | Wann |
|---|---|
| 400 | `timing` fehlt/ungültig, oder `time` nicht im Format `HH:MM` |
| 404 | Zimmer existiert nicht |

Erzeugt aktuell ebenfalls nur eine `Notification`. **Noch nicht
angebunden:** automatischer Sprung auf Priorität „jetzt benötigt“ in der
Housekeeper-Route (`src/lib/priority/computePriority.ts`) — folgt in
Teil 4.

### `POST /api/guest/:roomNumber/defect`

Mängelmeldung, inkl. optionalem Foto. **Einziger Endpunkt mit
`multipart/form-data`** statt JSON.

**Request** (`FormData`)
| Feld | Pflicht | Beschreibung |
|---|---|---|
| `category` | ja | einer aus `PLUMBING`, `ELECTRICAL`, `HVAC`, `FURNITURE`, `IT_TV`, `MINIBAR`, `OTHER` |
| `note` | ja | Freitext-Beschreibung |
| `photo` | nein | Bilddatei, max. 8 MB |

**Response `201`**
```json
{ "defect": { "id": "...", "roomId": "...", "category": "...", "note": "...", "photoPath": "/uploads/...", "createdAt": "..." } }
```

**Fehler**
| Status | Wann |
|---|---|
| 400 | kein `multipart/form-data`-Body |
| 400 | `category` fehlt/ungültig |
| 400 | `note` leer |
| 400 | Foto größer als 8 MB |
| 404 | Zimmer existiert nicht |

Landet als echter `Defect` (Quelle wie jede Personal-Meldung) im
Techniker-Hub — inkl. `WorkOrder`. Fotos liegen unter `/uploads/*`
(**noch nicht** signiert/zugriffsgeschützt — offener DSGVO-Punkt, siehe
`Prompt_G2_Gaeste_Screen_v1.md`, Abschnitt Datenschutz).

### `POST /api/guest/:roomNumber/contact`

Abteilung kontaktieren.

**Request**
```json
{ "department": "housekeeping" | "room_service" | "concierge" | "engineering" }
```

Siehe `CONTACT_DEPARTMENTS` in `src/lib/guest.ts` für die vollständige
Zuordnung (Anzeigename → interne Rolle).

**Response `201`**
```json
{ "ok": true }
```

**Fehler**
| Status | Wann |
|---|---|
| 400 | `department` fehlt oder unbekannt |
| 404 | Zimmer existiert nicht |

### `POST /api/guest/:roomNumber/notes`

Freitext-Nachricht ans Housekeeping.

**Request**
```json
{ "body": "..." }   // 1–2000 Zeichen
```

**Response `201`**
```json
{ "note": { "id": "...", "roomId": "...", "body": "...", "status": "OPEN", "createdAt": "..." } }
```

**Fehler**
| Status | Wann |
|---|---|
| 400 | `body` fehlt/leer/länger als 2000 Zeichen |
| 404 | Zimmer existiert nicht |

Landet als normaler `RoomNote`-Eintrag (wie jede Personal-Notiz).

## Rate-Limits

**Noch nicht implementiert.** Geplant (Teil 2): je Zimmer/IP max. 5
Anfragen/Stunde über alle Endpunkte hinweg. Bis dahin: keine
Absicherung gegen Spam auf diesen Endpunkten — nicht produktiv mit
echten Gästen verwenden.

## Geplant: Zugang über Code/Token

Der heutige Zugangsweg (`roomNumber` im Klartext in der URL) ist ein
Zwischenstand und **kein** finaler Sicherheitsmechanismus. Prompt G2
Teil 2 ersetzt ihn durch:

- `GET /g/r/:roomCode` — fester, zufälliger, nicht erratbarer Code pro
  Zimmer (NFC-Tag/QR-Code am Zimmer), löst zum **aktuellen Aufenthalt**
  (`Stay.status = IN_HOUSE`) auf.
- `GET /g/s/:stayToken` — Token pro Aufenthalt (Pre-Arrival-E-Mail-Link),
  ≥128 Bit zufällig, gültig ab Anreisetag, läuft nach Abreise + Kulanzfrist
  ab (Standard 2 Stunden). Datenmodell: `Stay` (`prisma/schema.prisma`).
- Kein aktiver Aufenthalt → neutrale Seite „Zurzeit nicht verfügbar“, keine
  Aktionen möglich.
- Die POST-Endpunkte oben ändern sich dabei voraussichtlich von
  `:roomNumber` auf `:roomCode`/`:stayToken` als Pfad-Parameter — Bodies
  und Response-Shapes bleiben unverändert.

Bis Teil 2 gelandet ist, bitte nicht auf die aktuelle `roomNumber`-URL als
stabile Schnittstelle verlassen.
