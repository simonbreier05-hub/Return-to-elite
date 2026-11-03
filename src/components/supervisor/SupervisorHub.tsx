"use client";

import type { ReactNode } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { TILE_UI, type TileState } from "@/lib/ui/room-tile";
import { STATUS_UI } from "@/lib/ui/status";
import { SUP_GROUP_UI, SUP_KPI_UI, SUP_KPIS, type RosterEntry, type SupGroup, type SupKpi } from "@/lib/ui/supervisorHub";
import { Button, FloorTile, GlassCard, KpiTile, KpiTileCompact, RosterTile, SectionLabel } from "@/components/ui";
import { cx } from "@/components/ui/primitives";
import { useBreakpoint } from "@/components/shell/useBreakpoint";

export interface HubTile {
  id: string;
  number: string;
  state: TileState;
  /** Weitere Angaben fürs Vorlesen (z. B. Status). */
  hint?: string;
}

export interface SupervisorHubProps {
  kpis: Record<SupKpi, number>;
  onKpi: (k: SupKpi) => void;
  roster: RosterEntry[];
  selectedAttendantId: string | null;
  onSelectAttendant: (id: string) => void;
  /** Zimmer der gewählten Kraft nach Gruppen (schon geordnet, leere Gruppen fehlen). */
  groups: { group: SupGroup; tiles: HubTile[] }[];
  selectedRoomId: string | null;
  onOpenRoom: (id: string) => void;
  onMoveRooms: () => void;
  /** Hinweise ganz oben (Tagesplan fehlt, Fehler, Live-Ticker, Umverteilungsvorschläge). */
  notices?: ReactNode;
  /** Freigabe-Warteschlange (Glas-Karte). */
  release?: ReactNode;
  /** Weitere Bereiche unter „Team heute“. */
  below?: ReactNode;
  /** Detail (`DetailContainer`): ab 1280 px als Panel rechts, darunter Einschub/Sheet. */
  detail: ReactNode;
  detailOpen: boolean;
}

/**
 * Supervisor-Übersicht im Design „Glas & Premium“ (Figma `31:653`, Handy `41:2237`, Tablet hoch nach `22:449`):
 * Kennzahlen, „Team heute“ (eine Kachel je Kraft), darunter die Zimmer der gewählten Person nach Gruppen.
 * Reine Darstellung — Daten und Aktionen kommen von `app/supervisor/view.tsx`.
 */
export function SupervisorHub(p: SupervisorHubProps) {
  const { t, fmt } = useLocale();
  const bp = useBreakpoint() ?? "tablet";
  const phone = bp === "phone";
  const wide = bp === "wide";
  const selected = p.roster.find((r) => r.id === p.selectedAttendantId) ?? null;

  const kpiRow = (
    <div className={cx("grid gap-3 sm:gap-4", phone ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4")}>
      {SUP_KPIS.map((k) => {
        const ui = SUP_KPI_UI[k];
        const tone = (k === "dnd" || k === "defects") && p.kpis[k] > 0 ? "attention" : "default";
        return phone ? (
          <KpiTileCompact key={k} label={t(k === "open" ? "supHub.groupOpen" : ui.labelKey)} value={p.kpis[k]} icon={ui.icon} tone={tone} onClick={() => p.onKpi(k)} />
        ) : (
          <KpiTile key={k} label={t(ui.labelKey)} value={p.kpis[k]} icon={ui.icon} tone={tone} onClick={() => p.onKpi(k)} />
        );
      })}
    </div>
  );

  const team = (
    <GlassCard as="section" aria-labelledby="sup-team-title" className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="sup-team-title" className="text-title-22 text-text-primary">
          {t("supHub.teamTitle")}
        </h2>
        <span className="text-label text-text-muted">{phone ? t("supHub.teamCount", { n: p.roster.length }) : t("supHub.teamHint")}</span>
      </div>

      {p.roster.length === 0 ? (
        <p className="text-body-16 text-text-muted">{t("roster.noAttendants")}</p>
      ) : (
        <div
          className={cx(
            phone
              ? "-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [&>*]:w-[184px] [&>*]:shrink-0 [&>*]:snap-start"
              : "grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3",
          )}
          role="list"
        >
          {p.roster.map((r) => (
            <div key={r.id} role="listitem">
              <RosterTile
                number={r.number}
                name={r.short}
                done={r.done}
                total={r.total}
                progressLabel={t("supHub.progress", { done: r.done, total: r.total })}
                credits={fmt.number(r.credits, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                pill={{ label: t(STATUS_UI[r.status].labelKey), tone: r.status === "open" ? "neutral" : r.status === "done" ? "success" : "info" }}
                selected={r.id === p.selectedAttendantId}
                aria-label={`${r.number} ${r.name}, ${t("supHub.progress", { done: r.done, total: r.total })}, ${t(STATUS_UI[r.status].labelKey)}`}
                onClick={() => p.onSelectAttendant(r.id)}
              />
            </div>
          ))}
        </div>
      )}

      {selected ? (
        <div aria-label={t("supHub.roomsOf", { name: selected.name })} role="region" className="flex flex-wrap gap-x-6 gap-y-5">
          {p.groups.length === 0 && <p className="text-body-16 text-text-muted">{t("roster.noRooms")}</p>}
          {p.groups.map(({ group, tiles }) => (
            <div key={group} className="flex min-w-0 flex-col gap-3">
              <SectionLabel as="h3" icon={SUP_GROUP_UI[group].icon} title={t(SUP_GROUP_UI[group].labelKey)} count={tiles.length} />
              <div className="flex flex-wrap gap-1">
                {tiles.map((tile) => (
                  <FloorTile
                    key={`${group}-${tile.id}`}
                    room={tile.number}
                    state={tile.state}
                    stateLabel={t(TILE_UI[tile.state].labelKey)}
                    selected={tile.id === p.selectedRoomId}
                    hint={tile.hint}
                    onClick={() => p.onOpenRoom(tile.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        p.roster.length > 0 && <p className="text-body-16 text-text-muted">{t("supHub.pickPerson")}</p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button variant="secondary" icon="refresh" onClick={p.onMoveRooms} className={phone ? "w-full" : undefined}>
          {t("supHub.moveRooms")}
        </Button>
        <p className="text-body-16 min-w-0 text-text-muted">{t("supHub.moveHint")}</p>
      </div>
    </GlassCard>
  );

  const main = (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
      {p.notices}
      {kpiRow}
      {team}
      {p.release}
      {p.below}
    </div>
  );

  if (wide && p.detailOpen) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_348px] items-start gap-6">
        {main}
        {p.detail}
      </div>
    );
  }
  return (
    <>
      {main}
      {p.detail}
    </>
  );
}
