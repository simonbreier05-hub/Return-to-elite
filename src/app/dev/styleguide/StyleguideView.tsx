"use client";

/**
 * Styleguide „Glas & Premium“ (Paket D0). Zeigt Token, Schriften, Symbole und alle Bausteine
 * mit allen Zuständen auf `bg-atmosphere`. Die Bretter sind wie in Figma (Seite „03 — System“)
 * gegliedert, damit man Screenshot neben Screenshot legen kann. Nur erfundene Testdaten.
 */
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { ICONS, type IconName } from "@/lib/ui/icons";
import { MARKERS, MARKER_UI } from "@/lib/ui/markers";
import { STATUS_UI, UI_STATUSES, type UiStatus } from "@/lib/ui/status";
import { TILE_STATES, TILE_UI, TILE_UNASSIGNED_KEY } from "@/lib/ui/room-tile";
import { TONES } from "@/lib/ui/tone";
import {
  ActionTile,
  Banner,
  Button,
  Field,
  FilterChip,
  FloorTile,
  GlassCard,
  Glyph,
  KpiTile,
  KpiTileCompact,
  LangChip,
  ListRow,
  ListRowCompact,
  MarkerBadge,
  NavItem,
  Pill,
  ProgressBar,
  RoomRow,
  RoomRowCompact,
  RosterRow,
  RosterTile,
  SectionLabel,
  StatusChip,
  StatusIcon,
  TabItem,
} from "@/components/ui";

const COLOR_TOKENS = [
  "bg-canvas",
  "bg-sidebar",
  "surface-card",
  "surface-card-raised",
  "surface-selected",
  "surface-progress-track",
  "border-subtle",
  "border-default",
  "border-accent",
  "text-primary",
  "text-secondary",
  "text-muted",
  "text-on-accent",
  "accent-default",
  "accent-text",
  "accent-subtle-bg",
  "status-success-fg",
  "status-success-bg",
  "status-warning-fg",
  "status-warning-bg",
  "status-danger-fg",
  "status-danger-bg",
  "status-info-fg",
  "status-info-bg",
  "pill-gold-bg",
  "pill-gold-border",
  "pill-neutral-bg",
  "pill-neutral-border",
] as const;

const GRADIENTS = ["glass-card", "glass-edge", "glass-selected", "glass-warm", "glass-disc", "champagne", "atmosphere", "sky"] as const;
const RADII = [
  ["--glass-radius-sm", "radius-sm 15"],
  ["--glass-radius-md", "radius-md 18"],
  ["--radius-tile", "radius-tile 22"],
  ["--glass-radius-lg", "radius-lg 25"],
  ["--glass-radius-xl", "radius-xl 32"],
  ["--radius-pill", "radius-pill 999"],
] as const;
const SPACES = ["xs", "sm", "md", "lg", "xl", "2xl", "3xl"] as const;
const TYPE = [
  ["text-display", "Display/40 · Lora 700", "Guten Morgen, Ingrid"],
  ["text-title-28", "Title/28 · Lora 700", "Zimmer 305"],
  ["text-title-22", "Title/22 · Lora 700", "Meine Zimmer"],
  ["text-number", "Number/32 · Lora 700", "305 · 11,5"],
  ["text-body-18", "Body/18 Medium · Inter 500", "Herr Dr. Krüger · Reinigung starten"],
  ["text-body-16", "Body/16 · Inter 400", "Bett komplett neu beziehen, Bad vollständig reinigen."],
  ["text-label", "Label/14 · Inter 500", "Wäschewechsel · Größe · Ärger · Öl · Übergabe"],
  ["text-section", "Abschnittstitel · Label/14 + 6 %", "Aktuell in Arbeit"],
] as const;

function Board({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section data-board={id} aria-labelledby={`board-${id}`} className="animate-in-up rounded-(--glass-radius-lg) bg-bg-sidebar p-4 sm:p-8">
      <h2 id={`board-${id}`} className="text-title-22 mb-6 text-text-primary">
        {title}
      </h2>
      <div className="flex flex-col gap-8">{children}</div>
    </section>
  );
}

function Group({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-section text-text-muted">{label}</p>
      <div className={className ?? "flex flex-wrap items-center gap-4"}>{children}</div>
    </div>
  );
}

/** Farbfeld; der Wert wird im Browser aus der CSS-Variable gelesen (keine Werte doppelt im Code). */
function Swatch({ cssVar, name, wide }: { cssVar: string; name: string; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState("");
  useEffect(() => {
    if (ref.current) setValue(getComputedStyle(ref.current).getPropertyValue(cssVar).trim());
  }, [cssVar]);
  return (
    <div ref={ref} className={wide ? "flex w-full flex-col gap-2 sm:w-64" : "flex w-36 flex-col gap-2"}>
      <div className="h-14 rounded-(--glass-radius-sm) border border-border-subtle" style={{ background: `var(${cssVar})` }} />
      <p className="text-label break-all text-text-primary">{name}</p>
      {!wide && <p className="text-label break-all text-text-muted">{value}</p>}
    </div>
  );
}

/** Tablet-Bausteine (feste Figma-Breite) auf dem Handy waagrecht wischbar statt abgeschnitten. */
function Scroller({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <p className="text-label mb-2 text-text-muted sm:hidden">Tablet-Baustein (600 px) — waagrecht wischen →</p>
      <div className="flex w-[600px] max-w-none flex-col gap-2 sm:w-full sm:max-w-[640px]">{children}</div>
    </div>
  );
}

export default function StyleguideView({ backHref }: { backHref: string }) {
  const { t } = useLocale();
  const st = (s: UiStatus) => ({ value: s, label: t(STATUS_UI[s].labelKey) });
  const [filter, setFilter] = useState("all");
  const [dnd, setDnd] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState("305");
  const noop = () => {};

  return (
    <main className="theme-glass bg-atmosphere min-h-screen">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-10 px-4 py-8 sm:px-8 sm:py-12">
        <header className="flex flex-col gap-2">
          <Link
            href={backHref}
            className="text-body-16 inline-flex min-h-(--size-touch-min) items-center gap-2 self-start text-text-secondary focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-accent-default"
          >
            <Glyph name="arrow-left" size={22} className="rtl:-scale-x-100" />
            {t("appShell.back")}
          </Link>
          <p className="text-label text-text-secondary">StayClean · Paket D0 · nur Entwicklung/Preview</p>
          <h1 className="text-title-28 sm:text-display text-text-primary">Styleguide „Glas &amp; Premium“</h1>
          <p className="text-body-16 text-text-secondary">Token aus docs/design/glass-spec.md, Bausteine aus src/components/ui. Alle Daten sind erfunden.</p>
        </header>

        {/* ---------- Token ---------- */}
        <Board id="farben" title="Farben (Abschnitt 2)">
          <div className="flex flex-wrap gap-4">
            {COLOR_TOKENS.map((c) => (
              <Swatch key={c} cssVar={`--color-${c}`} name={c} />
            ))}
          </div>
        </Board>

        <Board id="verlaeufe" title="Verläufe, Glas, Radien, Abstände (Abschnitt 3–4)">
          <Group label="Verläufe">
            {GRADIENTS.map((g) => (
              <Swatch key={g} cssVar={`--${g}`} name={`--${g}`} wide />
            ))}
          </Group>
          <Group label="GlassCard: default · selected · warm" className="grid gap-4 sm:grid-cols-3">
            <GlassCard>
              <p className="text-title-22">Karte</p>
              <p className="text-body-16 text-text-secondary">Heller Rand oben, warmer Rand unten, ein Schatten.</p>
            </GlassCard>
            <GlassCard selected>
              <p className="text-title-22">Ausgewählt</p>
              <p className="text-body-16 text-text-secondary">Fill „Glas/Auswahl“.</p>
            </GlassCard>
            <GlassCard warm>
              <p className="text-title-22">Lichtreflex</p>
              <p className="text-body-16 text-text-secondary">Nur bei Handlungsbedarf.</p>
            </GlassCard>
          </Group>
          <Group label="Radien">
            {RADII.map(([v, n]) => (
              <div key={v} className="flex flex-col items-center gap-2">
                <div className="glass-fill size-16 border border-border-default" style={{ borderRadius: `var(${v})` }} />
                <span className="text-label text-text-secondary">{n}</span>
              </div>
            ))}
          </Group>
          <Group label="Abstände (4/8/12/16/24/32/40) · Tippfläche 48 · Zeile 80 · Hauptknopf 64">
            {SPACES.map((s) => (
              <div key={s} className="flex flex-col items-center gap-2">
                <div className="bg-champagne h-6 rounded-pill" style={{ width: `var(--space-${s})` }} />
                <span className="text-label text-text-secondary">{s}</span>
              </div>
            ))}
            <div className="flex size-(--size-touch-min) items-center justify-center rounded-(--glass-radius-sm) border border-dashed border-border-default">
              <span className="text-label text-text-secondary">48</span>
            </div>
          </Group>
        </Board>

        <Board id="schrift" title="Schrift (Abschnitt 5)">
          <div className="flex flex-col gap-5">
            {TYPE.map(([cls, name, sample]) => (
              <div key={cls} className="flex flex-col gap-1 border-b border-border-subtle pb-4 last:border-b-0">
                <span className="text-label text-text-muted">
                  {name} · <code>.{cls}</code>
                </span>
                <span className={`${cls} text-text-primary`}>{sample}</span>
              </div>
            ))}
          </div>
        </Board>

        <Board id="symbole" title="Symbole (Abschnitt 6, lucide-react)">
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-6 lg:grid-cols-10">
            {(Object.keys(ICONS) as IconName[]).map((n) => (
              <div key={n} className="flex flex-col items-center gap-2 text-text-secondary">
                <Glyph name={n} />
                <span className="text-label text-center text-text-muted">{n}</span>
              </div>
            ))}
          </div>
        </Board>

        {/* ---------- Bausteine, gegliedert wie die Figma-Bretter ---------- */}
        <Board id="basis" title="Komponenten — Basis (Figma 19:2, 19:76)">
          <Group label="Pill · alle Töne">
            {TONES.map((tone) => (
              <Pill key={tone} tone={tone}>
                Turn
              </Pill>
            ))}
          </Group>
          <Group label="StatusChip · alle Status">
            {UI_STATUSES.map((s) => (
              <StatusChip key={s} status={s} label={t(STATUS_UI[s].labelKey)} />
            ))}
          </Group>
          <Group label="LangChip">
            <LangChip code="EN" label="Englisch" />
            <LangChip code="DE" label="Deutsch" />
            <LangChip code="FR" label="Französisch" />
          </Group>
          <Group label="MarkerBadge · alle Marker">
            {MARKERS.map((m) => (
              <MarkerBadge key={m} marker={m} label={t(MARKER_UI[m].labelKey)} />
            ))}
          </Group>
        </Board>

        <Board id="bedienung" title="Komponenten — Bedienung (Figma 20:26)">
          <Group label="FilterChip · default / active (antippbar)">
            {[
              ["all", "Alle (8)"],
              ["turn", "Turn (4)"],
              ["tidy", "Tidy (3)"],
              ["vip", "VIP (1)"],
            ].map(([k, l]) => (
              <FilterChip key={k} active={filter === k} onClick={() => setFilter(k)}>
                {l}
              </FilterChip>
            ))}
          </Group>
          <Group label="Button · primary / secondary · default / disabled">
            <Button icon="check">Reinigung starten</Button>
            <Button icon="check" disabled>
              Reinigung starten
            </Button>
            <Button variant="secondary" icon="check">
              Reinigung starten
            </Button>
            <Button variant="secondary" icon="check" disabled>
              Reinigung starten
            </Button>
          </Group>
          <Group label="NavItem · wide default / wide active mit Zähler / rail default / rail active" className="flex flex-wrap items-center gap-4">
            <div className="w-60">
              <NavItem icon="home" label="Übersicht" onClick={noop} />
            </div>
            <div className="w-60">
              <NavItem icon="home" label="Übersicht" active onClick={noop} />
            </div>
            <div className="w-60">
              <NavItem icon="message" label="Nachrichten" count={2} onClick={noop} />
            </div>
            <NavItem icon="home" label="Übersicht" mode="rail" onClick={noop} />
            <NavItem icon="home" label="Übersicht" mode="rail" active onClick={noop} />
            <NavItem icon="message" label="Nachrichten" mode="rail" count={2} onClick={noop} />
          </Group>
        </Board>

        <Board id="hub" title="Komponenten — Hub (Figma 21:38)">
          <Group label="KpiTile · default / attention" className="grid gap-4 sm:grid-cols-2 lg:max-w-[600px]">
            <KpiTile icon="bed-single" label="Meine Zimmer" value={8} />
            <KpiTile icon="bed-single" label="Meine Zimmer" value={8} tone="attention" />
          </Group>
          <Group label="ProgressBar · 3 von 8 / 0 / voll" className="flex max-w-[360px] flex-col gap-3">
            <ProgressBar value={3} max={8} label="3 von 8 Zimmern" />
            <ProgressBar value={0} max={8} label="0 von 8 Zimmern" />
            <ProgressBar value={8} max={8} label="8 von 8 Zimmern" />
          </Group>
          <Group label="Banner · info / accent / warning" className="flex max-w-[560px] flex-col gap-3">
            <Banner tone="info" title="Frühe Anreisen (2)" detail="Zi. 305, 312 – bis 14:00 fertig" />
            <Banner tone="accent" title="VIP heute (1)" detail="Zi. 401 – Begrüßung vorbereiten" />
            <Banner tone="warning" title="Sonderreinigung" detail="Zi. 214 – Teppich prüfen" />
          </Group>
          <Group label="RoomRow · default / selected / done (antippbar)" className="contents">
            <Scroller>
              {[
                { room: "305", guest: "Herr Carter", lang: "EN", pill: "Turn", tone: "neutral" as const, status: "open" as UiStatus, markers: ["arrival", "priority"] as const },
                { room: "307", guest: "Frau Dubois", lang: "FR", pill: "Tidy", tone: "neutral" as const, status: "cleaning" as UiStatus, markers: ["laundry"] as const },
                { room: "308", guest: "Herr Dr. Krüger", lang: "DE", pill: "Turn", tone: "accent" as const, status: "dnd" as UiStatus, markers: [] as const },
              ].map((r) => (
                <RoomRow
                  key={r.room}
                  room={r.room}
                  guest={r.guest}
                  lang={r.lang}
                  pill={{ label: r.pill, tone: r.tone }}
                  status={st(r.status)}
                  markers={r.markers.map((m) => ({ kind: m, label: t(MARKER_UI[m].labelKey) }))}
                  state={selectedRoom === r.room ? "selected" : "default"}
                  onClick={() => setSelectedRoom(r.room)}
                />
              ))}
              <RoomRow room="310" guest="Frau Novak" lang="EN" pill={{ label: "Turn" }} status={st("done")} state="done" onClick={noop} />
            </Scroller>
          </Group>
        </Board>

        <Board id="verwaltung" title="Komponenten — Verwaltung (Figma 29:431)">
          <Group label="SectionLabel">
            <SectionLabel icon="clock" title="Aktuell in Arbeit" count={2} as="h3" />
            <SectionLabel icon="check" title="Erledigt" count={3} as="h3" />
          </Group>
          <Group label="RosterRow · default / selected" className="contents">
            <Scroller>
              <RosterRow number={3} name="Ingrid Berger" done={3} total={8} progressLabel="3 von 8" credits="11,5" creditsLabel={t("ui.credits")} status={st("open")} onClick={noop} />
              <RosterRow number={4} name="Marta Lis" done={6} total={9} progressLabel="6 von 9" credits="12,0" creditsLabel={t("ui.credits")} status={st("cleaning")} selected onClick={noop} />
            </Scroller>
          </Group>
          <Group label="ListRow · default / selected / done" className="contents">
            <Scroller>
              <ListRow icon="wrench" title="Licht im Bad flackert" subtitle="Zi. 214 · Technik" pill={{ label: "Dringend", tone: "danger" }} meta="14:00" onClick={noop} />
              <ListRow icon="wrench" title="Heizung prüfen" subtitle="Zi. 318" pill={{ label: "Bestätigt", tone: "success" }} meta="15:30" state="selected" onClick={noop} />
              <ListRow icon="wrench" title="Fernbedienung tauschen" subtitle="Zi. 402" pill={{ label: "Erledigt", tone: "success" }} meta="09:10" state="done" onClick={noop} />
            </Scroller>
          </Group>
          <Group label="FloorTile · alle Zustände · Goldrahmen = Zuteilung offen">
            {TILE_STATES.map((s, i) => (
              <FloorTile key={s} room={String(301 + i)} state={s} stateLabel={t(TILE_UI[s].labelKey)} onClick={noop} />
            ))}
            <FloorTile room="307" state="departure" stateLabel={t(TILE_UI.departure.labelKey)} unassigned unassignedLabel={t(TILE_UNASSIGNED_KEY)} onClick={noop} />
            <FloorTile room="308" state="empty" stateLabel={t(TILE_UI.empty.labelKey)} unassigned unassignedLabel={t(TILE_UNASSIGNED_KEY)} onClick={noop} />
          </Group>
          <Group label="RosterTile · default / selected" className="grid max-w-[400px] grid-cols-2 gap-4">
            <RosterTile number={1} name="Ingrid Berger" done={7} total={8} progressLabel="7 von 8" credits="11,5" pill={{ label: "Turn" }} onClick={noop} />
            <RosterTile number={1} name="Ingrid Berger" done={7} total={8} progressLabel="7 von 8" credits="11,5" pill={{ label: "Turn" }} selected onClick={noop} />
          </Group>
        </Board>

        <Board id="handy" title="Komponenten — Handy (Figma 39:1855)">
          <Group label="TabItem · default / active / mit Zähler">
            <TabItem icon="home" label="Übersicht" onClick={noop} />
            <TabItem icon="home" label="Übersicht" active onClick={noop} />
            <TabItem icon="message" label="Nachrichten" count={2} onClick={noop} />
          </Group>
          <Group label="StatusIcon · alle Status">
            {UI_STATUSES.map((s) => (
              <StatusIcon key={s} status={s} label={t(STATUS_UI[s].labelKey)} />
            ))}
          </Group>
          <Group label="RoomRowCompact · default / selected / done" className="flex w-full max-w-[358px] flex-col gap-2">
            <RoomRowCompact room="305" guest="Herr Carter" lang="EN" pill={{ label: "Turn" }} marker={{ kind: "priority", label: t("ui.marker.priority") }} status={st("open")} onClick={noop} />
            <RoomRowCompact room="306" guest="Frau Dubois" lang="FR" pill={{ label: "Tidy" }} status={st("cleaning")} state="selected" onClick={noop} />
            <RoomRowCompact room="309" guest="Herr Tan" lang="EN" pill={{ label: "Turn" }} status={st("done")} state="done" onClick={noop} />
          </Group>
          <Group label="ListRowCompact · default / selected / done" className="flex w-full max-w-[358px] flex-col gap-2">
            <ListRowCompact icon="list" title="Zustellbett aufbauen" subtitle="Zi. 312 · bis 14:00" pill={{ label: "bis 08:00", tone: "warning" }} onClick={noop} />
            <ListRowCompact icon="list" title="Twin umbauen" subtitle="Zi. 220" pill={{ label: "Turn" }} state="selected" onClick={noop} />
            <ListRowCompact icon="list" title="Kissen bringen" subtitle="Zi. 118" pill={{ label: "Erledigt", tone: "success" }} state="done" onClick={noop} />
          </Group>
          <Group label="KpiTileCompact · default / attention" className="grid max-w-[358px] grid-cols-2 gap-4">
            <KpiTileCompact icon="bed-single" label="Zimmer" value={8} />
            <KpiTileCompact icon="bed-single" label="Zimmer" value={8} tone="attention" />
          </Group>
          <Group label="ActionTile · default / active (antippbar)" className="grid max-w-[358px] grid-cols-2 gap-4">
            <ActionTile icon="moon" title="Bitte nicht stören" active={!dnd} onClick={() => setDnd((v) => !v)} />
            <ActionTile icon="moon" title="Bitte nicht stören" active={dnd} onClick={() => setDnd((v) => !v)} />
          </Group>
        </Board>

        <Board id="formular" title="Field (in Screens)">
          <div className="grid max-w-[720px] gap-6 sm:grid-cols-2">
            <Field label="Zimmernummer" placeholder="z. B. 305" inputMode="numeric" />
            <Field label="Zimmernummer" defaultValue="305" hint="Nur Zimmer deiner Etage." />
            <Field label="Zimmernummer" defaultValue="999" error="Dieses Zimmer gibt es nicht." />
            <Field label="Zimmernummer" defaultValue="305" disabled />
            <Field label="Hinweis an die Technik" multiline placeholder="Was ist kaputt?" className="sm:col-span-2" />
          </div>
        </Board>

        <Board id="bewegung" title="Bewegung (Abschnitt 11)">
          <p className="text-body-16 text-text-secondary">
            Bretter blenden beim Laden 8 px nach oben ein (<code>.animate-in-up</code>), Knöpfe und Zeilen drücken sich beim Antippen leicht ein (<code>.press</code>). Bei „Bewegung reduzieren“ ist beides aus.
          </p>
        </Board>
      </div>
    </main>
  );
}
