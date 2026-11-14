"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import type { HkGroup } from "@/lib/rooms/hkGroups";
import { MARKER_UI, MAX_MARKERS_COMPACT, MAX_MARKERS_ROW } from "@/lib/ui/markers";
import { STATUS_UI } from "@/lib/ui/status";
import {
  earlyArrivals,
  FILTER_LABEL,
  filterCounts,
  hkMarkers,
  hkRowStatus,
  kindPill,
  langCode,
  matchesFilter,
  type HkFilter,
  type HkRoomView,
} from "@/lib/ui/hkHub";
import { Banner, FilterChip, GlassCard, Glyph, KpiTile, KpiTileCompact, Pill, ProgressBar, RoomRow, RoomRowCompact, SectionLabel } from "@/components/ui";
import { cx, FOCUS_RING } from "@/components/ui/primitives";
import { useBreakpoint } from "@/components/shell/useBreakpoint";

/** Eine Zeile der Zimmerliste: Anzeige-Daten + Gruppe (Jetzt dran / Als Nächstes / Erledigt / heute keine Reinigung). */
export interface HkListItem {
  view: HkRoomView;
  group: HkGroup;
  guest: string | null;
  lang: string | null;
  pax: number | null;
  /** Kurz hervorheben (durch Nachimport geändert). */
  flash?: boolean;
}

export interface HkHubProps {
  /** Schon geordnet: Jetzt dran, Als Nächstes (Route), Erledigt, Sonstige. Schlüssel = Zimmer-Id (stabil bei Live-Updates). */
  items: HkListItem[];
  kpis: { total: number; done: number; inProgress: number; open: number };
  progress: { done: number; total: number; creditsDone: number; creditsTotal: number };
  floors: number[];
  perFloor: { floor: number; released: number; total: number }[];
  /** z. B. „Typischer Tag: 10–13 Zimmer“. */
  routeLoadText?: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Das Detail (`DetailContainer`): ab 1280 Panel in der Spalte, darunter Einschub/Sheet. */
  detail: ReactNode;
  detailOpen: boolean;
  /** Hinweise über der Liste (Offline, Tagesplan fehlt, Fehler, gesperrte Zimmer). */
  notices?: ReactNode;
  /** Unter der Liste (Meldungen, Meine Zeiten). */
  below?: ReactNode;
  /** Knopf „Reihenfolge ändern“ + Inhalt des Sortiermodus (ersetzt dann die Gruppe „Als Nächstes“). */
  reorderToggle?: ReactNode;
  reorderContent?: ReactNode;
  /** Hinweis „Tagesplan fehlt“ ist schon in `notices` — dann keine Leer-Karte. */
  hubMissing?: boolean;
}

const GROUP_TITLE: Record<HkGroup, TKey> = { NOW: "hkHub.groupNow", NEXT: "hkHub.groupNext", DONE: "hkHub.groupDone", OTHER: "hkHub.groupOther" };
const GROUP_ORDER: HkGroup[] = ["NOW", "NEXT", "DONE", "OTHER"];
const fmtNum = (n: number) => n.toString().replace(".", ",");

/**
 * Housekeeper-Hub „Übersicht“ im Design „Glas & Premium“ (Figma `22:67`, `22:449`, `30:465`, `41:1899`):
 * Kennzahlen, Banner „Frühe Anreisen“, Filter, Zimmerliste; ab 1280 px Detail rechts, ab 1600 px dritte Spalte
 * „Mein Fortschritt“ + „Nächste Zimmer“. Reine Darstellung — Daten und Aktionen kommen vom Aufrufer.
 */
export function HkHub(p: HkHubProps) {
  const { t } = useLocale();
  const bp = useBreakpoint() ?? "tablet";
  const phone = bp === "phone";
  const [filter, setFilter] = useState<HkFilter>("all");

  const views = useMemo(() => p.items.map((i) => i.view), [p.items]);
  const counts = useMemo(() => filterCounts(views), [views]);
  const activeFilter = counts.some((c) => c.filter === filter) ? filter : "all";
  const visible = p.items.filter((i) => matchesFilter(i.view, activeFilter));
  const early = earlyArrivals(views);
  const nextRooms = p.items.filter((i) => i.group === "NEXT").slice(0, 3);
  const allDone = p.items.length > 0 && p.items.every((i) => i.group === "DONE" || i.group === "OTHER");

  const kpiTiles: { key: string; label: string; value: number; icon: "bed-single" | "check" | "refresh" | "circle"; warm: boolean }[] = [
    { key: "total", label: bp === "wide" ? t("hkHub.kpiRooms") : t("nav.rooms"), value: p.kpis.total, icon: "bed-single", warm: false },
    { key: "done", label: t("hkHub.kpiDone"), value: p.kpis.done, icon: "check", warm: false },
    { key: "inProgress", label: t("hkHub.kpiInProgress"), value: p.kpis.inProgress, icon: "refresh", warm: p.kpis.inProgress > 0 },
    { key: "open", label: t("hkHub.kpiOpen"), value: p.kpis.open, icon: "circle", warm: p.kpis.open > 0 },
  ];

  const row = (i: HkListItem) => {
    const v = i.view;
    const ui = hkRowStatus(v);
    const pill = kindPill(v.kind);
    const markers = hkMarkers(v).map((m) => ({ kind: m, label: t(MARKER_UI[m].labelKey, m === "later" ? { time: v.cleanAfter ?? "" } : undefined) }));
    const state = p.selectedId === v.id ? "selected" : i.group === "DONE" ? "done" : "default";
    const common = {
      room: v.number,
      guest: i.guest ?? undefined,
      lang: langCode(i.lang) ?? undefined,
      // Planung L1 (Regel 9): „Reinigung ab HH:MM“ steht sichtbar an der Art-Pille, nicht nur als Symbol
      pill: pill ? { label: v.cleanAfter ? `${t(pill.labelKey)} · ${t("ui.marker.later", { time: v.cleanAfter })}` : t(pill.labelKey), tone: pill.tone, edge: pill.edge } : undefined,
      status: { value: ui, label: t(STATUS_UI[ui].labelKey) },
      state,
      onClick: () => p.onSelect(v.id),
      className: cx("animate-in-up", i.flash && "outline-2 outline-offset-2 outline-accent-default"),
    } as const;
    return (
      <li key={v.id} data-room={v.number}>
        {phone ? (
          <RoomRowCompact {...common} marker={MAX_MARKERS_COMPACT ? markers[0] : undefined} />
        ) : (
          <RoomRow {...common} markers={markers.slice(0, MAX_MARKERS_ROW)} />
        )}
      </li>
    );
  };

  const progressCard = (
    <GlassCard as="section" aria-labelledby="hk-progress-title" className="flex flex-col gap-3">
      <h2 id="hk-progress-title" className="text-title-22 text-text-primary">{t("hkHub.myProgress")}</h2>
      <div className="flex items-center justify-between gap-3">
        <p className="text-body-16 text-text-secondary" aria-live="polite">
          {t("hkHub.progressRooms", { done: p.progress.done, total: p.progress.total })}
        </p>
        <span className="text-body-18 text-text-primary">
          {t("hkHub.percent", { n: p.progress.total ? Math.round((p.progress.done / p.progress.total) * 100) : 0 })}
        </span>
      </div>
      <ProgressBar value={p.progress.done} max={p.progress.total} label={t("hkHub.progressRooms", { done: p.progress.done, total: p.progress.total })} />
      {p.progress.creditsTotal > 0 && (
        <p className="text-label text-text-secondary">{t("lists.credits", { done: fmtNum(p.progress.creditsDone), total: fmtNum(p.progress.creditsTotal) })}</p>
      )}
      {p.perFloor.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t("hkHub.perFloor")}>
          {p.perFloor.map((f) => (
            <li key={f.floor}>
              <Pill tone={f.released === f.total ? "success" : "neutral"}>
                {t("attendant.floor", { floor: f.floor })} · {t("hkHub.floorReleased", { done: f.released, total: f.total })}
              </Pill>
            </li>
          ))}
        </ul>
      )}
      {p.floors.length > 0 && (
        <p className="text-label flex items-center gap-2 text-text-secondary">
          <Glyph name="list" size={18} className="text-accent-text" />
          {t("lists.myFloors", { list: p.floors.join(", ") })}
        </p>
      )}
      {p.routeLoadText && <p className="text-label text-text-muted">{p.routeLoadText}</p>}
    </GlassCard>
  );

  const nextCard = nextRooms.length > 0 && (
    <GlassCard as="section" aria-labelledby="hk-next-title" className="flex flex-col gap-2">
      <h2 id="hk-next-title" className="text-title-22 text-text-primary">{t("hkHub.nextRooms")}</h2>
      <ol>
        {nextRooms.map((i, n) => {
          const pill = kindPill(i.view.kind);
          const parts = [i.view.number, pill ? t(pill.labelKey) : null, i.pax != null ? t("hkHub.paxShort", { n: i.pax }) : null, i.view.vip ? t("lists.vip") : null].filter(Boolean);
          return (
            <li key={i.view.id} className="border-b border-border-subtle last:border-b-0">
              <button
                type="button"
                onClick={() => p.onSelect(i.view.id)}
                className={cx("press flex min-h-(--size-touch-min) w-full items-center gap-4 py-2 text-start", FOCUS_RING)}
              >
                <span aria-label={t("hkHub.stop", { n: n + 1 })} className="glass-disc text-label flex size-8 shrink-0 items-center justify-center text-text-primary">
                  {n + 1}
                </span>
                <span className="text-body-16 text-text-primary">{parts.join(" · ")}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </GlassCard>
  );

  const groups = GROUP_ORDER.map((g) => ({ g, items: visible.filter((i) => i.group === g) })).filter((x) => x.items.length > 0 || (x.g === "NEXT" && p.reorderContent));

  return (
    <div className="flex flex-col gap-4" data-testid="hk-hub">
      {/* Kennzahlen: Handy seitlich scrollbar, Tablet hoch 2×2, ab 1024 eine Reihe */}
      {phone ? (
        <div className="-mx-3 flex snap-x gap-3 overflow-x-auto px-3 pb-1" role="list" aria-label={t("hkHub.kpiRooms")}>
          {kpiTiles.map((k) => (
            <div role="listitem" key={k.key} className="w-[171px] shrink-0 snap-start">
              <KpiTileCompact label={k.label} value={k.value} icon={k.icon} tone={k.warm ? "attention" : "default"} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {kpiTiles.map((k) => (
            <KpiTile key={k.key} label={k.label} value={k.value} icon={k.icon} tone={k.warm ? "attention" : "default"} />
          ))}
        </div>
      )}

      {p.notices}

      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_348px] xl:items-start xl:gap-4 xl:min-[1600px]:grid-cols-[minmax(0,1fr)_280px_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <GlassCard as="section" aria-label={t("nav.myRooms")} padded={false} className="flex flex-col gap-4 p-4 sm:p-6">
            {early.rooms.length > 0 && (
              <button type="button" onClick={() => p.onSelect(early.rooms[0].id)} className={cx("press rounded-(--glass-radius-md) text-start", FOCUS_RING)}>
                <Banner
                  tone="accent"
                  icon="star"
                  title={t("hkHub.earlyTitle", { n: early.rooms.length })}
                  detail={early.by ? t("hkHub.earlyDetail", { rooms: early.rooms.map((r) => r.number).join(", "), time: early.by }) : t("hkHub.earlyRooms", { rooms: early.rooms.map((r) => r.number).join(", ") })}
                />
              </button>
            )}

            {p.items.length > 0 && (
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6" role="group" aria-label={t("hkHub.filter")}>
                {counts.map((c) => (
                  <FilterChip key={c.filter} active={activeFilter === c.filter} onClick={() => setFilter(c.filter)}>
                    {t("hkHub.withCount", { label: t(FILTER_LABEL[c.filter]), n: c.count })}
                  </FilterChip>
                ))}
              </div>
            )}

            {p.items.length === 0 && !p.hubMissing && (
              <p className="text-body-16 flex items-center gap-3 py-6 text-text-secondary" data-testid="hk-empty">
                <Glyph name="bed-single" size={24} className="text-text-muted" />
                {t("attendant.noRoomsAssigned")}
              </p>
            )}
            {allDone && (
              <Banner tone="info" icon="check" title={t("hkHub.allDone")} detail={t("hkHub.progressRooms", { done: p.progress.done, total: p.progress.total })} />
            )}

            {groups.map(({ g, items }) => (
              <section key={g} aria-label={t(GROUP_TITLE[g])} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <SectionLabel as="h3" title={t(GROUP_TITLE[g])} count={items.length} />
                  {g === "NEXT" && p.reorderToggle}
                </div>
                {g === "NEXT" && p.reorderContent ? p.reorderContent : <ol>{items.map(row)}</ol>}
              </section>
            ))}
          </GlassCard>

          <div className="flex flex-col gap-4 min-[1600px]:hidden">{progressCard}</div>
          {p.below}
        </div>

        <div className="hidden min-[1600px]:flex min-[1600px]:flex-col min-[1600px]:gap-4">
          {progressCard}
          {nextCard}
        </div>

        <div>
          {!p.detailOpen && (
            <GlassCard className="hidden flex-col items-center gap-3 py-10 text-center xl:flex">
              <Glyph name="bed-single" size={32} className="text-text-muted" />
              <p className="text-body-16 text-text-secondary">{t("hkHub.selectHint")}</p>
            </GlassCard>
          )}
          {p.detail}
        </div>
      </div>
    </div>
  );
}
