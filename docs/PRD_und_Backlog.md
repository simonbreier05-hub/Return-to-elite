# StayClean — Product Requirements & UX Backlog

> **Zweck dieses Dokuments:** Dies ist die "Source of Truth" für jede Claude Code Session.
> Regel für Agenten: Vor jeder Arbeitssession dieses Dokument lesen → offenen Punkt aus
> Backlog wählen → umsetzen → Status aktualisieren → nächste Session macht weiter.
> So entsteht die gewünschte kontinuierliche Optimierung, ohne dass ein Mensch jedes Mal
> neu briefen muss.

---

## 1. Produktvision

StayClean ist ein Housekeeping-Management-System für die Hotellerie (nicht Ferienwohnungen/
Airbnb-Co-Hosting — das ist J&S-Haus). Zielgruppe: kleine bis mittlere Hotels, Boutique-Hotels,
Hostel-Ketten, die aktuell Housekeeping über Zettel, WhatsApp oder Excel koordinieren.

**Kernproblem, das gelöst wird:** Housekeeping-Teams wissen nicht in Echtzeit, welche Zimmer
wann in welchem Zustand gereinigt werden müssen, und Manager haben keinen Überblick über
Fortschritt/Qualität.

---

## 2. North Star für "user-friendly"

Jede UX-Entscheidung wird gegen diese 4 Kriterien geprüft:

| Kriterium | Messbar durch |
|---|---|
| **3-Sekunden-Regel** | Ein Zimmermädchen/Cleaner versteht seine nächste Aufgabe in <3 Sek ohne Erklärung |
| **Ein-Hand-Bedienung** | Alle täglichen Aktionen (Status ändern, Foto hochladen) mit Daumen auf Smartphone bedienbar |
| **Null-Schulung-Prinzip** | Kein Feature braucht ein Tutorial, um verstanden zu werden |
| **Manager-Overview in 10 Sek** | Hotelmanager sieht Gesamtstatus aller Zimmer auf einen Blick |

---

## 3. Nutzerrollen

**Ursprüngliches Konzept (4 Rollen):**

1. **Housekeeper/Cleaner** — mobile-first, sieht nur eigene Zimmer, minimale Interaktion
2. **Supervisor/Inspector** — Quality Checks, sieht Team-Fortschritt
3. **Hotel Manager** — Dashboard, Reporting, Zimmerstatus-Übersicht
4. **(später) Gast** — evtl. Self-Service "Bitte nicht stören" / "Jetzt reinigen"

**Tatsächlicher Stand (Stand 2026-08-19, 6 Rollen — siehe `src/lib/domain.ts`
`ROLES` und die Rollen-Rechte-Matrix `ROLE_ALLOWED_TARGETS` in
`src/lib/stateMachine.ts`):**

1. **`room_attendant`** (Housekeeper/Cleaner) — mobile-first, sieht nur
   zugewiesene Zimmer priorisiert nach Dringlichkeit, Statuswechsel per Tap,
   Offline-Queue für WLAN-Funklöcher. Darf `IN_PROGRESS`, `CLEAN`,
   `BLOCKED` (+Grund), `DEFECT_REPORTED`, `GREEN_OPT_OUT` setzen —
   **nicht** `INSPECTED`.
2. **`supervisor`** (Inspector/Team Lead) — Freigabe (`INSPECTED`) und
   Nacharbeit (`PICKUP` mit Notiz), Team-Board mit Live-Status, morgendliche
   Zimmer-Zuteilung (`/supervisor/planning`), Schichtübergabe-Notiz
   (`/supervisor/handover`), Bulk-Freigabe der Release-Queue.
3. **`duty_manager`** (Hotel Manager / Admin) — besteht jede Rollenprüfung,
   zusätzlich exklusiv `/settings` (Eskalationsschwellen, Priority-Gewichte
   pro Haus).
4. **`front_office`** — Anreise-Board (ETA, VIP, "jetzt benötigt"),
   bekommt Benachrichtigung sobald ein angefragtes Zimmer `INSPECTED` wird.
   **Kann keinen Housekeeping-Status ändern** (403 bei jedem Versuch).
5. **`concierge`** — pflegt Ausflugsfenster der Gäste (Zimmer ist in dieser
   Zeit sicher leer → ideales Reinigungsfenster für die Priority-Engine).
   **Kann ebenfalls keinen Housekeeping-Status ändern.**
6. **`engineering`** — Work-Order-Queue (aus Defect-Meldungen automatisch
   erzeugt), Status OPEN → ACK → IN_PROGRESS → RESOLVED. Darf zusätzlich
   selbst `DEFECT_REPORTED` setzen.

Der Gast-Self-Service aus dem ursprünglichen Konzept ist weiterhin **nicht**
umgesetzt (siehe P3 in Abschnitt 5) — dafür kam mit `front_office`,
`concierge` und `engineering` ein deutlich größerer, abteilungsübergreifender
Rollenraum dazu, als das ursprüngliche 3+1-Rollenmodell vorsah.

---

## 4. Core User Flows (müssen zuerst stehen, bevor Details optimiert werden)

**Ursprüngliches Konzept (4 Flows):**

1. **Zimmerstatus-Update:** Cleaner öffnet App → sieht Zimmerliste (Farbcode: 🔴 dirty, 🟡 in progress, 🟢 clean, ⚪ inspected) → tippt Zimmer an → ändert Status → fertig
2. **Task-Zuweisung:** Neue Buchung/Checkout → Task entsteht automatisch → Supervisor weist zu (oder Auto-Zuweisung nach Verfügbarkeit)
3. **Quality Check:** Supervisor bekommt Benachrichtigung bei "clean" → prüft → Foto + Pass/Fail
4. **Manager-Dashboard:** Grid-Ansicht aller Zimmer nach Status, Filter nach Etage/Team

**Tatsächlicher Stand (Stand 2026-08-19):**

1. **Zimmerstatus-Update** — im Kern wie geplant, aber mit 10 statt 4
   Status (`DIRTY → IN_PROGRESS → CLEAN → INSPECTED`, plus `PICKUP`,
   `BLOCKED`, `DEFECT_REPORTED`, `OUT_OF_ORDER`, `OUT_OF_SERVICE`,
   `GREEN_OPT_OUT` — siehe State-Diagramm in `CLAUDE.md`). Jeder Tap läuft
   serverseitig über `checkTransition()`/`applyStatusChange()`; bei
   fehlendem Netz landet die Aktion in der Offline-Queue und wird beim
   nächsten Kontakt nachgeliefert.
2. **Zuweisung** — **keine** automatische Task-Erzeugung aus Buchung/
   Checkout (die PMS-Anbindung ist heute ein Mock ohne echte
   Reservierungs-Events, siehe `src/lib/pms/`). Stattdessen: der Supervisor
   erzeugt morgens am Planning-Board (`/supervisor/planning`) einen
   Zuteilungsvorschlag — zusammenhängende Zimmerblöcke nach Etage/Sektion,
   gewichtet nach vorhergesagten Reinigungsminuten, den Team-Mitgliedern
   passend zu ihrer Heimatsektion zugeteilt — und bestätigt ihn per Tap.
   Innerhalb eines Zuteilungsblocks sortiert die Priority-Engine dringende
   Zimmer nach vorn (Front-Office-"jetzt benötigt", VIP, ETA-Fenster,
   Concierge-Ausflugsfenster, DND-Alter, Laufweg).
3. **Quality Check** — kein separates "Foto + Pass/Fail"-UI. Ein `CLEAN`
   gemeldetes Zimmer erscheint in der Release-Queue des Supervisors; er
   setzt entweder `INSPECTED` (Freigabe, geht als einziger Status an die
   PMS-Mock-Anbindung und benachrichtigt Front Office) oder `PICKUP` mit
   Pflicht-Notiz für den Attendant (Nacharbeit). Eine Sammel-Freigabe der
   ganzen Queue läuft über denselben Code-Pfad wie eine Einzelfreigabe.
4. **Manager-Dashboard** — als Supervisor-Board umgesetzt: Etagen-/
   Sektions-Grid mit Live-Status per Socket.IO, Suche über Zimmernummer/
   Sektion/Gast/Attendant, Filter nach Status/Etage/Zuweisung, hausweite
   KPIs. `duty_manager` sieht dasselbe Board zusätzlich mit Zugriff auf
   `/settings`.

**Zusätzliche Flows, die im ursprünglichen Konzept noch nicht vorkamen:**

- **Defekt- und Work-Order-Flow:** Attendant/Supervisor/Engineering meldet
  einen Defekt (Kategorie, Notiz, optionales Foto) → automatischer
  Work-Order an Engineering → OPEN → ACK → IN_PROGRESS → RESOLVED.
- **Eskalationen:** ein 60s-Ticker prüft konfigurierbare Schwellen
  (DND-Recheck, Welfare-Check, ETA-at-risk, Release-Queue-Backlog) und
  löst rollenspezifische In-App-Benachrichtigungen aus.
- **Schichtübergabe:** `/supervisor/handover` fasst den Tag (offene
  Entscheidungen, gefährdete Anreisen, offene Work-Orders, Notizen) in
  einer generierten Übergabe-Notiz zusammen — deterministisch ohne
  `ANTHROPIC_API_KEY`, sonst LLM-gestützt auf denselben, vorab berechneten
  Fakten (siehe "Shift handover" in `CLAUDE.md`).

---

## 5. UX-Backlog (priorisiert, Agenten arbeiten von oben nach unten ab)

> **Stand 2026-08-19:** Die produktive Next.js-App (siehe `CLAUDE.md` und
> `README.md`) ist inzwischen weit über diesen ursprünglichen Klick-Prototyp
> hinausgewachsen — P0 und der Großteil von P1/P2 sind in echtem Code
> umgesetzt, nicht nur als Prototyp (Details zum größeren Rollen- und
> Statusraum jetzt in Abschnitt 3/4). Häkchen unten spiegeln den echten
> Implementierungsstand, nicht den Prototyp-Stand.

### 🔴 P0 — Fundament (blockiert alles andere)
- [x] Wireframes für die 4 Core-Flows oben (Mobile: Cleaner-View, Desktop: Manager-Dashboard)
      — überholt durch die produktive App: `src/app/attendant/` (Cleaner) und
      `src/app/supervisor/` (Manager-Dashboard)
- [x] Design-System definieren (Farben für Status, Typografie, Spacing)
      — `STATUS_COLORS`/`STATUS_LABELS` in `src/lib/domain.ts`, Tailwind-Setup,
      siehe "Visual design" in `README.md` für die Farb-/Typo-Entscheidungen
      am Haus (Vault-Ink, Brass, Garnet-Akzent)
- [x] Klickbarer Prototyp Cleaner-View (Zimmerliste + Status-Update)
      — ersetzt durch die echte, funktionale Attendant-View inkl. Offline-Queue

### 🟡 P1 — Kernfunktionen
- [ ] Task-Detail-Ansicht (Checkliste pro Zimmertyp)
      — **nicht umgesetzt.** Die App hat stattdessen freie `RoomNote`s und
      strukturierte `Defect`-Meldungen pro Zimmer statt einer festen
      Checkliste pro Zimmertyp; offen, ob eine Checkliste zusätzlich noch
      gebraucht wird oder ob Notes/Defects den Bedarf abdecken
- [x] Foto-Upload-Flow (max. 2 Taps bis Kamera offen)
      — Foto ist Teil der Defect-Meldung (`POST /api/rooms/[id]/defects`,
      multipart, optional, max. 8 MB, abgelegt unter `public/uploads`);
      Foto ist bewusst **optional**, siehe Anti-Pattern in Abschnitt 6
- [x] Manager-Dashboard Grid-View mit Live-Status
      — Supervisor-Board mit Etagen-/Sektions-Grid, Suche, Filtern, KPIs,
      Live-Updates per Socket.IO (`src/app/supervisor/view.tsx`)
- [~] Supervisor Quality-Check-Flow
      — teilweise: `INSPECTED` (Freigabe) / `PICKUP` (Nacharbeit mit Notiz)
      sind umgesetzt und rollenscharf erzwungen (`checkTransition`), aber
      **kein** dediziertes Foto+Pass/Fail-UI wie ursprünglich hier skizziert
      — die Quality-Gate-Logik läuft heute über Statuswechsel + Notiz

### 🟢 P2 — Effizienz-Features
- [x] Auto-Zuweisung nach Verfügbarkeit/Nähe
      — `src/lib/assignment/planAssignments.ts`: deterministischer
      Round-Planer (zusammenhängende Blöcke nach Etage/Sektion/Zimmernummer,
      gewichtet nach vorhergesagten Reinigungsminuten), `/supervisor/planning`
- [~] Push-Benachrichtigungen (nur kritische: überfällige Zimmer)
      — teilweise: In-App-Echtzeit-Alerts (kritisch/warnung/info) über
      Socket.IO + `Notification`-Tabelle und den 60s-Eskalations-Ticker
      (BLOCKED-Recheck, Welfare-Check, ETA-at-risk, Release-Queue-Backlog)
      sind da; **echte Browser-/Mobile-Push** (Service Worker, Web Push)
      fehlt noch — die App muss offen sein, um Alerts zu sehen
- [x] Offline-Modus (Hotels haben oft schlechtes WLAN in Fluren)
      — `src/lib/offline/actionQueue.ts`, unit-getestet
      (`tests/offlineQueue.test.ts`); deckt Taps ab, nicht Seitenladungen im
      Offline-Zustand (ein Service Worker wäre der nächste Schritt dafür)

### ⚪ P3 — Später
- [ ] Mehrsprachigkeit (Housekeeping-Teams oft international)
      — **nicht umgesetzt.** UI ist durchgängig Englisch, kein i18n-Framework
      eingebunden
- [ ] Analytics/Reporting für Management
      — **nicht umgesetzt** im Sinne einer aggregierten Auswertung. Es gibt
      einen rohen Audit-Trail (`GET /api/audit`, supervisor/DM), aber kein
      Reporting/Analytics-Dashboard darüber
- [ ] Gäste-Self-Service
      — **nicht umgesetzt**, keine Gast-Rolle/kein Gast-Flow vorhanden

---

## 6. Anti-Patterns (was StayClean NICHT tun soll)

- Keine Feature-Overload auf der Cleaner-Ansicht — sie ist die meistgenutzte und muss am
  einfachsten sein
- Keine Pflichtfelder, die einen Task blockieren, wenn Info fehlt (z.B. Foto optional machen,
  nicht erzwingen — reale Hotels haben Zeitdruck)
- Keine Logins/Passwörter für Cleaner — PIN-Code oder QR-Scan reicht

---

## 7. Session-Log (jede Claude Code Session trägt hier ein, was sie gemacht hat)

| Datum | Was wurde umgesetzt | Nächster Schritt |
|---|---|---|
| — | Initiales PRD erstellt | P0: Wireframes + Prototyp |
| 2026-08-19 | PRD-Dokument ins Repo übernommen (`docs/PRD_und_Backlog.md`); CLAUDE.md verweist jetzt darauf und verlangt einen Session-Log-Eintrag pro Session | P0-Backlog abarbeiten: Wireframes für die 4 Core-Flows, Design-System, klickbarer Cleaner-View-Prototyp — Hinweis: die produktive Next.js-App (siehe Haupt-CLAUDE.md) hat P0/P1 inhaltlich bereits überholt, P3-Punkte (Mehrsprachigkeit, Analytics, Gäste-Self-Service) bleiben offen |
| 2026-08-19 | Backlog (Abschnitt 5) auf echten Implementierungsstand abgeglichen: P0 komplett erledigt (echte App statt Prototyp), P1 größtenteils erledigt (Quality-Check-Flow nur teilweise wie ursprünglich skizziert, Zimmertyp-Checkliste fehlt), P2 größtenteils erledigt (echte Browser-/Mobile-Push fehlt noch, In-App-Alerts + Eskalationen sind da) | P3 ist der noch offene Rest: Mehrsprachigkeit (i18n), aggregiertes Analytics/Reporting über den Audit-Trail hinaus, Gäste-Self-Service — plus die im P1-Abschnitt offene Frage, ob eine feste Zimmertyp-Checkliste zusätzlich zu Notes/Defects gebraucht wird |
| 2026-08-19 | Abschnitt 3 (Nutzerrollen) und 4 (Core User Flows) auf echten Stand gebracht: ursprüngliches 4-Rollen-/4-Flow-Konzept jeweils als historischer Referenzpunkt belassen, darunter die tatsächlichen 6 Rollen (inkl. Rechte-Matrix aus `stateMachine.ts`) und die real umgesetzten Flows (Planning-Board statt Auto-Zuweisung aus Buchung, Freigabe/Pickup statt Foto+Pass/Fail-UI, plus Defekt/Work-Order-, Eskalations- und Handover-Flows, die im Original noch nicht vorkamen) ergänzt | P3-Backlog bleibt der offene Rest (i18n, Analytics/Reporting, Gäste-Self-Service); ggf. prüfen, ob Abschnitt 1/2 (Produktvision, North Star) noch zum jetzigen Funktionsumfang passen oder ebenfalls ein Update brauchen |
