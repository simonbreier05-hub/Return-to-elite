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

1. **Housekeeper/Cleaner** — mobile-first, sieht nur eigene Zimmer, minimale Interaktion
2. **Supervisor/Inspector** — Quality Checks, sieht Team-Fortschritt
3. **Hotel Manager** — Dashboard, Reporting, Zimmerstatus-Übersicht
4. **(später) Gast** — evtl. Self-Service "Bitte nicht stören" / "Jetzt reinigen"

---

## 4. Core User Flows (müssen zuerst stehen, bevor Details optimiert werden)

1. **Zimmerstatus-Update:** Cleaner öffnet App → sieht Zimmerliste (Farbcode: 🔴 dirty, 🟡 in progress, 🟢 clean, ⚪ inspected) → tippt Zimmer an → ändert Status → fertig
2. **Task-Zuweisung:** Neue Buchung/Checkout → Task entsteht automatisch → Supervisor weist zu (oder Auto-Zuweisung nach Verfügbarkeit)
3. **Quality Check:** Supervisor bekommt Benachrichtigung bei "clean" → prüft → Foto + Pass/Fail
4. **Manager-Dashboard:** Grid-Ansicht aller Zimmer nach Status, Filter nach Etage/Team

---

## 5. UX-Backlog (priorisiert, Agenten arbeiten von oben nach unten ab)

### 🔴 P0 — Fundament (blockiert alles andere)
- [ ] Wireframes für die 4 Core-Flows oben (Mobile: Cleaner-View, Desktop: Manager-Dashboard)
- [ ] Design-System definieren (Farben für Status, Typografie, Spacing) — siehe frontend-design Skill
- [ ] Klickbarer Prototyp Cleaner-View (Zimmerliste + Status-Update)

### 🟡 P1 — Kernfunktionen
- [ ] Task-Detail-Ansicht (Checkliste pro Zimmertyp)
- [ ] Foto-Upload-Flow (max. 2 Taps bis Kamera offen)
- [ ] Manager-Dashboard Grid-View mit Live-Status
- [ ] Supervisor Quality-Check-Flow

### 🟢 P2 — Effizienz-Features
- [ ] Auto-Zuweisung nach Verfügbarkeit/Nähe
- [ ] Push-Benachrichtigungen (nur kritische: überfällige Zimmer)
- [ ] Offline-Modus (Hotels haben oft schlechtes WLAN in Fluren)

### ⚪ P3 — Später
- [ ] Mehrsprachigkeit (Housekeeping-Teams oft international)
- [ ] Analytics/Reporting für Management
- [ ] Gäste-Self-Service

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
