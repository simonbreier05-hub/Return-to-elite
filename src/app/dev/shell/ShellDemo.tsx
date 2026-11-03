"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { MARKER_UI } from "@/lib/ui/markers";
import { STATUS_UI, type UiStatus } from "@/lib/ui/status";
import { Banner, Button, FilterChip, GlassCard, Glyph, KpiTile, KpiTileCompact, LangChip, MarkerBadge, Pill, RoomRow, RoomRowCompact } from "@/components/ui";
import { DetailContainer } from "@/components/shell/DetailContainer";
import { GlassDialog } from "@/components/shell/GlassDialog";
import { useBreakpoint } from "@/components/shell/useBreakpoint";

/** Erfundene Testdaten wie im Figma-Entwurf (keine echten Gäste). */
const ROOMS = [
  { room: "305", guest: "Herr Carter", lang: "EN", pill: "Turn", tone: "accent" as const, status: "open" as UiStatus, markers: ["arrival", "priority"] as const },
  { room: "307", guest: "Frau Dubois", lang: "FR", pill: "Tidy", tone: "neutral" as const, status: "cleaning" as UiStatus, markers: ["laundry"] as const },
  { room: "308", guest: "Herr Tan", lang: "EN", pill: "Turn", tone: "accent" as const, status: "dnd" as UiStatus, markers: [] as const },
  { room: "310", guest: "Frau Müller", lang: "DE", pill: "Tidy", tone: "neutral" as const, status: "done" as UiStatus, markers: [] as const },
];

export default function ShellDemo({ initialDetail, initialDialog }: { initialDetail: boolean; initialDialog: boolean }) {
  const { t } = useLocale();
  const bp = useBreakpoint();
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(initialDetail ? "305" : null);
  const [dialog, setDialog] = useState(initialDialog);
  const st = (s: UiStatus) => ({ value: s, label: t(STATUS_UI[s].labelKey) });

  const detail = (
    <DetailContainer
      open={selected !== null}
      onClose={() => setSelected(null)}
      title={`Zimmer ${selected ?? ""}`}
      footer={
        <Button icon="play" block onClick={() => setDialog(true)}>
          Reinigung starten
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="accent">Turn</Pill>
          <LangChip code="EN" label="Englisch" />
          <MarkerBadge marker="arrival" label={t(MARKER_UI.arrival.labelKey)} />
          <MarkerBadge marker="priority" label={t(MARKER_UI.priority.labelKey)} />
        </div>
        <p className="text-body-16 flex items-center gap-3 text-text-primary">
          <Glyph name="user" size={22} className="text-text-secondary" /> Herr Carter · 1 Person
        </p>
        <p className="text-body-16 flex items-center gap-3 text-text-primary">
          <Glyph name="clock" size={22} className="text-text-secondary" /> Frühe Anreise (14:00)
        </p>
        <hr className="border-surface-progress-track" />
        <p className="text-body-18 flex items-center gap-3 text-text-primary">
          <Glyph name="file-text" size={22} className="text-accent-text" /> Hinweise
        </p>
        <ul className="text-body-16 flex flex-col gap-2 text-text-secondary">
          {["Bett komplett neu beziehen", "Bad vollständig reinigen", "Minibar prüfen & auffüllen", "Zusätzliche Kissen bereitstellen"].map((h) => (
            <li key={h} className="flex items-center gap-3">
              <span aria-hidden="true" className="size-1.5 rounded-pill bg-accent-default" />
              {h}
            </li>
          ))}
        </ul>
      </div>
    </DetailContainer>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Handy/Tablet per CSS umschalten (kein Flackern beim Laden) */}
      <div className="grid grid-cols-2 gap-4 sm:hidden">
        <KpiTileCompact icon="bed-single" label="Zimmer" value={8} />
        <KpiTileCompact icon="check" label="Erledigt" value={3} />
      </div>
      <div className="hidden grid-cols-2 gap-4 sm:grid lg:grid-cols-4">
        <KpiTile icon="bed-single" label="Meine Zimmer" value={8} />
        <KpiTile icon="check" label="Erledigt" value={3} />
        <KpiTile icon="refresh" label="In Arbeit" value={1} tone="attention" />
        <KpiTile icon="circle" label="Offen" value={4} tone="attention" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_348px]">
        <GlassCard as="section" aria-label="Meine Zimmer" className="flex min-w-0 flex-col gap-4">
          <Banner tone="accent" title="Frühe Anreisen (2)" detail="Zi. 305, 312 – bis 14:00 fertig" />
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
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
          </div>
          <div className="flex flex-col gap-1">
            {ROOMS.map((r) => (
              <div key={r.room} className="contents">
                <RoomRowCompact
                  className="sm:hidden"
                  room={r.room}
                  guest={r.guest}
                  lang={r.lang}
                  pill={{ label: r.pill, tone: r.tone }}
                  status={st(r.status)}
                  marker={r.markers[0] ? { kind: r.markers[0], label: t(MARKER_UI[r.markers[0]].labelKey) } : undefined}
                  state={selected === r.room ? "selected" : r.status === "done" ? "done" : "default"}
                  onClick={() => setSelected(r.room)}
                />
                <div className="hidden sm:block">
                <RoomRow
                  room={r.room}
                  guest={r.guest}
                  lang={r.lang}
                  pill={{ label: r.pill, tone: r.tone }}
                  status={st(r.status)}
                  markers={r.markers.map((m) => ({ kind: m, label: t(MARKER_UI[m].labelKey) }))}
                  state={selected === r.room ? "selected" : r.status === "done" ? "done" : "default"}
                  onClick={() => setSelected(r.room)}
                />
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
        {bp === "wide" ? detail : null}
      </div>
      {bp !== "wide" ? detail : null}

      <GlassDialog
        open={dialog}
        title="Wirklich erledigt?"
        message="Zimmer 312 · Licht im Bad defekt"
        confirmLabel="Bestätigen"
        onConfirm={() => setDialog(false)}
        onCancel={() => setDialog(false)}
      >
        Notiz: Ersatzleuchte eingebaut.
      </GlassDialog>
    </div>
  );
}
