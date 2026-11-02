# StayClean – Design-Spezifikation „Glas & Premium“ (v1)

Stand 01.11.2026. Diese Datei ist die verbindliche Umsetzungsgrundlage für alle Design-Pakete (D0–D6). Sie ersetzt die alte Palette (Navy `#133457`, Messing `#A9843F`, Creme `#F7F3EA`) und die alte Schrift (Cormorant Garamond).

Quelle in Figma (nur lesbar nötig, falls Figma-MCP verbunden): Datei `h3aRUNjLpsYBhrQmxij6nO`, Seite „03 — System“ (`16:2`). Referenz des Ursprungs-Mockups: Seite „02“ (`4:8`). Wenn Figma nicht erreichbar ist, gilt dieser Text.

## 1. Grundidee

- **Glas ohne Unschärfe:** Karten sind Verläufe mit hellem Rand oben, warmem Rand unten und weichem Schatten. Es wird **kein** `backdrop-filter` und kein Blur verwendet (Leistung auf Tablets).
- **Nur dunkel.** Der Hell-Modus ist nicht Teil von v1.
- **Gold ist knapp:** Champagner-Verlauf nur für Hauptaktion, aktiven Filter, Avatar, Zähler-Badge und Auswahlmarkierung.
- **Foto nur im Kopf** (weich ausgeblendet) und in der Seitenleiste unten (nur Wide). Freigegebenes Foto: Hotel de Rome, Datei `public/branding/hotel-de-rome-header.webp` (701×394, ca. 52 KB). Das Foto ist pro Hotel einstellbar; ohne Foto gilt der Himmel-Verlauf (siehe 3). Das KI-Foto aus dem Mockup bleibt draußen. Bildrechte vor Produktivstart mit dem Hotel klären.
- **Status nie nur über Farbe:** immer Symbol oder Text.

## 2. Farben (CSS-Variablen, 1:1 so benennen)

| Variable | Wert | Verwendung |
|---|---|---|
| `--color-bg-canvas` | `#061421` | Seitenhintergrund (Basis) |
| `--color-bg-sidebar` | `#0A1928` | dunkle Flächen, Komponenten-Brett |
| `--color-surface-card` | `#142536` | Karte (Fallback unter dem Glas-Verlauf) |
| `--color-surface-card-raised` | `#192A3B` | erhöhte Fläche |
| `--color-surface-selected` | `rgba(212,172,126,.16)` | ausgewählte Fläche (einfach) |
| `--color-surface-progress-track` | `rgba(255,255,255,.12)` | Fortschrittsspur, Trennlinien, Eingabefelder |
| `--color-border-subtle` | `rgba(255,255,255,.08)` | feiner Rand |
| `--color-border-default` | `rgba(212,172,126,.32)` | Standard-Rand (Gold-getönt) |
| `--color-border-accent` | `#EBD0AB` | Rand von Gold-Elementen |
| `--color-text-primary` | `#F8F7F6` | Haupttext |
| `--color-text-secondary` | `#C9D1DB` | Zweittext |
| `--color-text-muted` | `#8F9BAA` | gedämpfter Text (mind. 5,5:1 auf Karte) |
| `--color-text-on-accent` | `#0A1928` | Text auf Gold |
| `--color-accent-default` | `#D4AC7E` | Akzent (Punkte, Rahmen offen) |
| `--color-accent-text` | `#E3BB8E` | Akzent-Text/-Symbole |
| `--color-accent-subtle-bg` | `rgba(212,172,126,.16)` | Akzent-Fläche |
| `--color-status-success-fg` / `-bg` | `#7CC49A` / `rgba(124,196,154,.16)` | erledigt, bestätigt, erkannt |
| `--color-status-warning-fg` / `-bg` | `#E8B04B` / `rgba(232,176,75,.16)` | pausiert, Priorität, Hinweis |
| `--color-status-danger-fg` / `-bg` | `#EE8277` / `rgba(238,130,119,.16)` | DND, Mangel, dringend |
| `--color-status-info-fg` / `-bg` | `#8DB4E0` / `rgba(141,180,224,.16)` | Gast, Anreise, Wäschewechsel |
| `--color-pill-gold-bg` / `-border` | `rgba(198,170,135,.486)` / `rgba(230,189,136,.369)` | Pille Turn/VIP/Trace |
| `--color-pill-neutral-bg` / `-border` | `rgba(173,176,178,.243)` / `rgba(255,255,255,.047)` | Pille Tidy/Standard |

Geprüfte Kontraste (dunkel): Text primär/Karte 14,6 · sekundär 10,1 · gedämpft 5,5 · Akzent-Text/Karte 8,7 · Text auf Gold 8,5 · Status-fg auf Status-bg 4,7 bis 5,8. Keine eigenen Grautöne erfinden.

## 3. Verläufe und Rand (CSS)

Alle Verläufe laufen **senkrecht von oben nach unten** (`180deg`), außer der Hintergrund-Atmosphäre.

```css
:root {
  --glass-card: linear-gradient(180deg, #354353 0%, #142536 18%, #192A3B 70%, #303E50 92%, #50535A 100%);
  --glass-edge: linear-gradient(180deg, rgba(244,240,233,.859) 0%, rgba(187,197,208,.188) 25%, rgba(177,189,197,.133) 65%, rgba(245,206,157,.851) 100%);
  --glass-selected: linear-gradient(180deg, rgba(182,166,146,.471) 0%, rgba(109,104,99,.396) 50%, rgba(191,156,118,.6) 100%);
  --glass-warm: linear-gradient(180deg, rgba(231,190,151,.302) 0%, rgba(147,110,73,.161) 50%, rgba(220,165,111,.4) 100%);
  --glass-disc: linear-gradient(180deg, rgba(165,173,180,.4) 0%, rgba(111,121,134,.259) 60%, rgba(85,102,117,.439) 100%);
  --champagne: linear-gradient(180deg, #F5DAB4 0%, #D4AC7E 55%, #E3BB8E 100%);
  --atmosphere: linear-gradient(90deg, #061421 0%, #23303F 60%, #25313F 100%);
  --sky: radial-gradient(ellipse at center, #606575 0%, rgba(72,86,110,.533) 70%, rgba(72,86,110,0) 100%);
  --shadow-card: 0 5px 16px rgba(0,0,0,.086);
  --glow-marker: 1px 0 12px rgba(255,205,119,.667);
}
```

**Glas-Karte** = `background: var(--glass-card)` + Rand über Pseudoelement (der Rand ist ein Verlauf und liegt über dem Fuellverlauf):

```css
.glass { position: relative; background: var(--glass-card); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); }
.glass::before { content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1px; background: var(--glass-edge);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; }
```

Weitere Klassen: `.glass-selected` (Fill `--glass-selected`), `.glass-disc` (Symbolscheibe), `.bg-champagne`, `.bg-atmosphere` (Seitenhintergrund), `.bg-sky`.
Auswahlmarkierung (Zeile): 6×68 px, Radius 4, `--champagne`, Schatten `--glow-marker`, links bündig.

**Foto im Kopf:** Höhe 150–190 px, rechts oben, `object-fit: cover`, links und rechts weich ausgeblendet (Maske `linear-gradient(90deg, transparent 0, #000 12%, #000 89%, transparent 100%)`), darunter der Himmel-Verlauf. Das Original ist nur 701 px breit: **nicht hochskalieren**, breitere Flächen füllt der Himmel-Verlauf. Quelle: `src/lib/branding.ts` (`HEADER_PHOTO_URL`, pro Hotel einstellbar), ohne Foto nur `--sky`.

## 4. Radien, Abstände, Größen

| Variable | Wert | Verwendung |
|---|---|---|
| `--radius-sm` | 15 | Navigationseintrag, Zeile, Zimmerkachel |
| `--radius-md` | 18 | Button, Eingabefeld, Banner, Roster-Kachel |
| `--radius-tile` | 22 | Kennzahl-Kachel |
| `--radius-lg` | 25 | Karte |
| `--radius-xl` | 32 | Seitenleiste, Bottom-Sheet, Tab-Leiste (oben) |
| `--radius-pill` | 999 | Pille, Filter, Avatar |
| `--space-xs/sm/md/lg/xl/2xl/3xl` | 4/8/12/16/24/32/40 | Abstände |
| `--size-touch-min` | 48 | Mindest-Tippfläche |
| `--size-row-height` | 80 (Handy 72) | Zeilenhöhe |
| `--size-button-height` | 64 | Hauptknopf |
| `--size-sidebar-wide` / `-rail` | 264 / 80 | Seitenleiste |

## 5. Schrift

Beide Schriften **selbst hosten** (SIL OFL), damit der Build ohne Internet läuft: Lora Bold (700), Inter Regular (400) und Medium (500).

| Stil | Schrift | Größe / Zeilenhöhe | Verwendung |
|---|---|---|---|
| Display/40 | Lora 700 | 40 / 48 | Begrüßung (Tablet), große Zahl |
| Title/28 | Lora 700 | 28 / 34 | Begrüßung Handy, Zimmerzahl in Liste (Handy), Detailtitel |
| Title/22 | Lora 700 | 22 / 28 | Kartentitel |
| Number/32 | Lora 700 | 32 / 36 | Zimmernummer (Tablet), Kennzahl |
| Body/18 Medium | Inter 500 | 18 / 26 | Namen, Listentitel, Button |
| Body/16 | Inter 400 | 16 / 24 | Fließtext |
| Label/14 | Inter 500 | 14 / 20 | Labels, Pillen, Hinweise. Abschnittstitel: Großbuchstaben, Laufweite +6 % |

Kleiner als 14 px wird nichts.

## 6. Symbole

Linien-Symbole, 24 px Raster, Strichstärke 2, runde Enden: **`lucide-react`** verwenden (Namen siehe Tabelle). Bedeutung nie nur über Farbe.

| Figma | Lucide | Figma | Lucide |
|---|---|---|---|
| home | House | pause | Pause |
| bed-single | BedSingle | moon | Moon |
| calendar-days | CalendarDays | zap | Zap |
| list | List | wrench | Wrench |
| chart | ChartColumn | shirt | Shirt |
| message | MessageCircle | play | Play |
| users | Users | log-in / log-out | LogIn / LogOut |
| search / bell | Search / Bell | clock | Clock |
| check / x | Check / X | circle | Circle |
| chevron-right / -down | ChevronRight / ChevronDown | info | Info |
| arrow-left | ArrowLeft | user | User |
| refresh | RefreshCw | file-text | FileText |
| triangle-alert | TriangleAlert | star | Star |

## 7. Zuordnungen (zentral in `src/lib/ui/` ablegen, nicht in Komponenten verstreuen)

**Status** (Symbol · Ton): Offen · circle · neutral | In Reinigung · refresh · accent | Erledigt · check · success | Pausiert · pause · warning | DND · moon · danger | Mangel · wrench · danger | Nachbessern · refresh · warning.

**Marker** (Symbol · Ton): Priorität · zap · warning | DND · moon · danger | Mangel · wrench · danger | Wäschewechsel · shirt · info | Anreise · log-in · accent | VIP · star · accent | Pause · pause · warning.

**Zimmerkachel (Zustand)**: Leer · circle · gedämpft | Belegt · user · sekundär | Abreise · log-out · Akzent | Anreise · log-in · info | Bleiber · bed-single · success | DND · moon · danger. Goldrahmen 2 px (`--color-accent-default`) = „noch nicht zugeteilt“.

**Pillen-Ton** (Beispiele): Turn und VIP und Trace = Accent (Gold) · Tidy und Standard = Neutral · Bleiber, Gast, Anreise, Housekeeping = Info · Dringend = Danger · Bestätigt, Erkannt, Erledigt = Success · Offen (Ausflug), bis 08:00 = Warning.

## 8. Komponenten (alle unter `src/components/ui/`)

| Komponente | Zweck und Zustände | Figma-Knoten |
|---|---|---|
| `GlassCard` | Karte mit Glas-Fill, Rand, Schatten; Innenabstand 24 (Handy 16) | – |
| `Button` | Style `primary` (Champagner, Text dunkel, Höhe 64, Radius 18, Rand `--color-border-accent`, **ohne** Glow) und `secondary` (Glas, heller Rand); Zustand `disabled` = 40 % Deckkraft; optional Symbol links | `20:48` |
| `Pill` | Tone `neutral/accent/success/warning/danger/info`; Höhe 28, Label/14 | `19:15` |
| `StatusChip` | Symbol + Text je Status (Tablet/Desktop) | `19:51` |
| `StatusIcon` | nur Symbol im Kreis 36 px (Handy) | `39:1899` |
| `MarkerBadge` | runder Marker 32 px je Marker | `19:76` |
| `LangChip` | Sprachkürzel (EN, DE, FR) | `19:77` |
| `FilterChip` | `default` (Glas) / `active` (Champagner); Höhe ≥ 48 | `20:31` |
| `KpiTile` | Kennzahl mit Symbolscheibe; Ton `default` / `attention` (warmer Lichtreflex) | `21:57` |
| `KpiTileCompact` | Handy, 171 px breit | `39:1999` |
| `ProgressBar` | Spur + Champagner-Füllung, Höhe 12 | `21:58` |
| `Banner` | Ton `accent/info/warning` (Titel + Detail + Symbol) | `21:80` |
| `RoomRow` | Zimmerzeile Tablet: Nummer, Gast, Sprache, Pille, Status, 2 Marker; States `default/selected/done` | `21:144` |
| `RoomRowCompact` | Zimmerzeile Handy (358 px) | `39:1948` |
| `ListRow` / `ListRowCompact` | Listenzeile (Auftrag, Aufgabe, Anreise, Ausflug) | `29:516` / `39:1979` |
| `RosterTile` | Housekeeper-Kachel (Nummer, Name, Fortschritt, Credits, Status) | (Seite 03, Brett „Verwaltung“) |
| `RosterRow` | Housekeeper als Zeile (breite Ansicht) | `29:476` |
| `SectionLabel` | Abschnittstitel mit Symbol und Zähler | `29:432` |
| `FloorTile` | Zimmerkachel im Grundriss (64×60) mit Zustand + „Zuteilung offen“ | `29:554` |
| `NavItem` | Menüpunkt `wide` (Symbol+Text+Zähler) / `rail` (nur Symbol); `default/active` | `20:71` |
| `TabItem` | Eintrag der Tab-Leiste (Handy), Zähler-Badge oben rechts am Symbol | `39:1870` |
| `ActionTile` | große Aktionsfläche der Gäste-Startseite; `default/active` | `39:2010` |
| `Field` | Eingabefeld/Textfeld: Label/14 gedämpft darüber, Feld mit `--color-surface-progress-track`, Rand `--color-border-subtle`, Radius 18, Mindesthöhe 48 | (in Screens) |

## 9. Screens (Figma-Knoten)

| Screen | Größe | Knoten |
|---|---|---|
| Housekeeper-Hub Tablet | 1280×800 | `22:67` |
| Housekeeper-Hub Tablet klein (Icon-Leiste, Einschub) | 1024×768 | `22:449` |
| Housekeeper-Hub Desktop (3 Spalten) | 1672×941 | `30:465` |
| Supervisor Übersicht / Tagesplanung | 1280×800 | `31:653` / `31:1118` |
| Duty Manager Haus / Morgenplanung | 1440×900 | `34:1139` / `34:1410` |
| Techniker / Hausmann / Front Office / Concierge | 1280×800 | `36:1351` / `36:1589` / `36:1839` / `36:2108` |
| Techniker-Bestätigungsdialog | 640×360 | `36:2364` |
| Handy: Housekeeper Liste / Detail / Supervisor / Duty Manager / Hausmann / Gast | 390×844 | `41:1899` / `41:2140` / `41:2237` / `41:2493` / `41:2654` / `41:2827` |
| Archiv (alter deckender Entwurf, nur Vergleich) | 1280×800 | `27:596` |

## 10. Aufbau und Breakpoints

- **App-Rahmen:** Seitenleiste als schwebende Glaskarte (Abstand 8 px zum Rand, Radius `--radius-xl`), rechts daneben der Inhalt. Handy: Inhalt oben, unten Tab-Leiste (Glas, oben abgerundet).
- **Kopf:** Datum (Label, sekundär), Begrüßung (Display/40, Handy Title/28), Untertitel, rechts Suche, Glocke (Punkt bei Neuem), Avatar mit Initialen.
- **Zielgeräte (Entscheidung Simon, 01.11.2026):** alle Rollen bekommen Tablets unter 11 Zoll (typisch 1280×800 quer, 800×1280 hoch, teils 1024×600). Das Tablet ist die Hauptansicht aller Rollen, Handy nur Rückfall (und Gast). Tablet hoch (ca. 800 px) nutzt das Layout „Tablet klein“ (Figma `22:449`): Icon-Leiste, eine Spalte, Detail als Einschub. Texte und Tippflächen für Arbeit mit einer Hand und Handschuhen/nassen Fingern großzügig halten.
- **Breakpoints:** unter 640 px Tab-Leiste und Bottom-Sheet · 640–1279 px Icon-Leiste (80) und Einschub von rechts · ab 1280 px Seitenleiste (264) und Detailpanel rechts · ab 1600 px dritte Spalte (nur Housekeeper: Mein Fortschritt, Nächste Zimmer).
- **Menüs je Rolle** (Tablet; Handy = die ersten vier, Rest unter dem letzten Eintrag oder im Profil):
  - Housekeeper: Übersicht, Aufgaben, Nachrichten, Mängel (+ Pause-Taste)
  - Supervisor: Übersicht, Tagesplanung, Zimmer, Aufgaben, Nachrichten, Team
  - Duty Manager: Haus, Morgenplanung, Zimmer, Berichte, Nachrichten, Team
  - Techniker: Aufträge, Zimmer, Nachrichten
  - Hausmann: Aufgaben, Nachrichten, Mangel melden
  - Front Office: Anreisen, Zimmer, Nachrichten
  - Concierge: Ausflüge, Anreisen, Nachrichten
  Die genauen Routen kommen aus dem Bestand (Schritt 0 jedes Pakets).

## 11. Bewegung (klein halten)

Nur `opacity` und `transform`, 150–220 ms, `ease-out`: Karten und Listen blenden beim Laden leicht ein (8 px nach oben), Bottom-Sheet und Einschub gleiten von unten bzw. rechts, Antippen einer Zeile/Taste = kurzes Eindrücken (`scale(.98)`). Keine Dauer-Animationen. Bei `prefers-reduced-motion: reduce` alles aus.

## 12. Leistung und Barrierefreiheit (Pflicht)

- Kein `backdrop-filter`. Höchstens ein Schatten pro Karte. Fotos nur WebP ≤ 150 KB, `loading="lazy"`, nur im Kopf.
- Listen mit mehr als 40 Einträgen scrollen innerhalb der Karte; lange Listen nicht komplett rendern, wenn der Bestand das schon tut, nichts ändern.
- Tippflächen ≥ 48 px, sichtbarer Fokusring (2 px `--color-accent-default`, Abstand 2 px), Kontraste aus Abschnitt 2.
- Gastanzeige: „Anrede Titel Nachname“ (z. B. „Herr Dr. Krüger“); Gäste-Seiten zeigen höchstens den Vornamen und nie Namen anderer Personen.

## 13. Offene Punkte

1. Hotelfoto: aktuelle Datei ist klein (701×394). Für scharfe Darstellung auf großen Bildschirmen höher aufgelöstes Original (mind. 1600 px breit) vom Hotel/aus dem Pressebereich holen; Bildrechte klären.
2. Handy-Ansichten für Tagesplanung, Techniker-Detail und Pause-Taste sind noch nicht gezeichnet (siehe `Handy_Konzept_v1.md`).
3. Flaggen statt Sprachkürzel: nur wenn später gewünscht.
4. Hell-Modus: nicht Teil von v1.
