"use client";

import { useMemo, useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import { toCleanOnFloor } from "@/lib/dayplan/dayNumbers";
import type { RoomDayCategory } from "@/lib/rooms/roomDayCategory";
import { MARKER_UI } from "@/lib/ui/markers";
import { TILE_STATES, TILE_UI, TILE_UNASSIGNED_KEY, tileStateFor, type TileState } from "@/lib/ui/room-tile";
import { averageCredits, isOverTarget, roundCredits } from "@/lib/ui/supervisorHub";
import { Banner, Button, FilterChip, FloorTile, GlassCard, Glyph, KpiTile, Pill, ProgressBar, SectionLabel } from "@/components/ui";
import { cx, FOCUS_RING, TILE_FG } from "@/components/ui/primitives";
import { GlassDialog } from "@/components/shell/GlassDialog";
import { HkWindow } from "@/components/hk/HkParts";
import DragDropBoard, { type BoardColumn } from "@/components/DragDropBoard";
import { usePlanningFloorPlan, type LiveRoom, type OnShiftAttendant } from "@/components/usePlanningFloorPlan";
import { LegacySurface } from "./SupervisorParts";

const DAY_CATEGORY_KEY: Record<RoomDayCategory, TKey | null> = {
  ARRIVAL: "planning.dayCategoryArrival",
  DEPARTURE: "planning.dayCategoryDeparture",
  STAYOVER: "planning.dayCategoryStayover",
  SAME_DAY_TURN: "planning.dayCategorySameDayTurn",
  DND: "planning.dayCategoryDnd",
  NONE: null,
};

/**
 * Tagesplanung im Design „Glas & Premium“ (Figma `31:1118`): links der Etagen-Grundriss aus `FloorTile`
 * (Goldrahmen = noch nicht zugeteilt), rechts die Zuteilungsleiste mit Credits je Kraft und Überlast-Hinweis.
 * Alle Wege (Zwei-Tap in beiden Modi, Mehrfachauswahl, Ziehen in der Liste, Wäschewechsel, Rückfrage bei begonnenen
 * Zimmern) kommen unverändert aus `usePlanningFloorPlan` — nur die Darstellung ist neu. Zuteilungen werden sofort gespeichert.
 */
export function GlassPlanningBoard({ onShiftAttendants, reloadToken }: { onShiftAttendants: OnShiftAttendant[]; reloadToken: number }) {
  const { t, fmt } = useLocale();
  const fp = usePlanningFloorPlan({ onShiftAttendants, reloadToken });
  // Gewählte Etage; ohne Wahl die erste Etage mit offenen Zimmern (sonst die erste Etage).
  const [chosenFloor, setFloor] = useState<number | null>(null);
  const floors = fp.plan?.floors ?? [];
  const firstOpen = fp.plan?.rooms.find((r) => fp.unassignedNumbers.has(r.number))?.floor;
  const floor = chosenFloor ?? firstOpen ?? floors[0] ?? null;

  const credits = (id: string) => roundCredits(fp.creditsByAttendant.get(id) ?? 0);
  const num = (n: number) => fmt.number(n, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const over = onShiftAttendants.filter((a) => isOverTarget(credits(a.id), fp.targetCredits));
  const avg = averageCredits(onShiftAttendants.map((a) => credits(a.id)));

  const floorRooms = useMemo(
    () => (fp.plan?.rooms ?? []).filter((r) => r.floor === floor).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })),
    [fp.plan, floor]
  );

  if (fp.error && !fp.plan) return <Banner tone="warning" title={fp.error} />;
  if (!fp.plan) return <p className="text-body-16 text-text-muted">{t("planning.floorPlanLoading")}</p>;

  const tileOf = (number: string): { state: TileState; category: RoomDayCategory; live: LiveRoom | undefined; laundry: boolean } => {
    const live = fp.liveByNumber.get(number);
    const facts = live ? fp.roomFacts.get(live.id) : undefined;
    const category = facts?.category ?? "NONE";
    const state: TileState = facts?.guestDndActive ? "dnd" : tileStateFor(category, live?.occupancy === "OCCUPIED");
    return { state, category, live, laundry: facts?.laundryDue ?? false };
  };

  const pickList = fp.pickingRoom && (fp.mode === "room-first" || fp.view === "list");
  const active = fp.activeAttendant;

  const kpis = (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <KpiTile label={t("dayNumbers.toClean")} value={fp.numbers.toClean} icon="bed-single" />
      <KpiTile label={t("dayNumbers.assigned")} value={fp.numbers.assigned} icon="check" />
      <KpiTile
        label={t("dayNumbers.open")}
        value={fp.numbers.open}
        icon="circle"
        tone={fp.numbers.open > 0 ? "attention" : "default"}
        onClick={() => fp.setView("list")}
        aria-label={`${t("dayNumbers.showOpen")}: ${fp.numbers.open}`}
      />
      <KpiTile label={t("supHub.avgCredits")} value={avg == null ? "–" : num(avg)} icon="users" />
    </div>
  );

  const floorCard = (
    <GlassCard as="section" aria-labelledby="plan-floor-title" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="plan-floor-title" className="text-title-22 text-text-primary">
          {fp.view === "plan" ? t("supHub.floorTitle") : t("planning.floorPlanViewList")}
        </h2>
        {fp.view === "plan" && (
          <div role="group" aria-label={t("supHub.floorTitle")} className="flex flex-wrap gap-2">
            {floors.map((f) => (
              <FilterChip key={f} active={f === floor} onClick={() => setFloor(f)} className="min-w-14 px-4!">
                <span className="sr-only">{t("board.floor", { n: f })}</span>
                <span aria-hidden="true">{f}</span>
              </FilterChip>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {(["plan", "list"] as const).map((v) => (
          <FilterChip key={v} active={fp.view === v} onClick={() => fp.setView(v)} className="px-5!">
            {v === "plan" ? t("planning.floorPlanViewPlan") : t("planning.floorPlanViewList")}
          </FilterChip>
        ))}
        {fp.view === "plan" && (
          <FilterChip
            active={fp.multiMode}
            onClick={() => { fp.setMultiMode((m) => !m); fp.setMultiPick(new Set()); fp.setPickingRoom(null); }}
            className="px-5!"
          >
            {t("planning.floorPlanMultiSelect")}
          </FilterChip>
        )}
      </div>

      {fp.view === "plan" && fp.multiMode && (
        <div role="group" aria-label={t("planning.floorPlanMultiSelect")} className="flex flex-col gap-3 rounded-(--glass-radius-md) bg-surface-selected p-4">
          <p className="text-body-16 text-text-primary">{fp.multiPick.size === 0 ? t("planning.floorPlanMultiHint") : t("planning.floorPlanMultiCount", { n: fp.multiPick.size })}</p>
          {/* Ganze Etage einer Kraft zuteilen: wählt die heute zu reinigenden Zimmer der Etage, dann wie jede Auswahl zuteilen */}
          <div role="group" aria-label={t("planning.floorPlanMultiFloors")} className="flex flex-wrap items-center gap-2">
            <span className="text-label text-text-muted">{t("planning.floorPlanMultiFloors")}</span>
            {[...new Set(fp.dayRows.map((r) => r.floor ?? Number(r.number.slice(0, 1))))].sort((a, b) => a - b).map((f) => (
              <FilterChip
                key={f}
                className="px-4!"
                onClick={() => fp.setMultiPick((prev) => { const n = new Set(prev); for (const r of toCleanOnFloor(fp.dayRows, f, (id) => fp.liveById.get(id)?.status)) if (fp.liveByNumber.has(r.number)) n.add(r.number); return n; })}
              >
                {t("board.floor", { n: f })}
              </FilterChip>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {onShiftAttendants.map((a) => (
              <FilterChip
                key={a.id}
                disabled={fp.multiPick.size === 0}
                className="px-5!"
                onClick={() => { const ids = [...fp.multiPick].map((n) => fp.liveByNumber.get(n)?.id).filter((x): x is string => !!x); fp.setMultiPick(new Set()); void fp.assignMany(ids, a.id); }}
              >
                {a.name}
              </FilterChip>
            ))}
            <FilterChip
              disabled={fp.multiPick.size === 0}
              className="px-5!"
              onClick={() => { const ids = [...fp.multiPick].map((n) => fp.liveByNumber.get(n)?.id).filter((x): x is string => !!x); fp.setMultiPick(new Set()); void fp.assignMany(ids, null); }}
            >
              {t("planning.floorPlanMultiRemove")}
            </FilterChip>
            <FilterChip disabled={fp.multiPick.size === 0} className="px-5!" onClick={() => fp.setMultiPick(new Set())}>
              {t("planning.floorPlanMultiClear")}
            </FilterChip>
          </div>
        </div>
      )}

      {fp.view === "plan" ? (
        <>
          {/* Grundriss nie spiegeln (auch nicht auf Persisch/Arabisch): feste Links-nach-rechts-Anordnung. */}
          <div dir="ltr" className="flex flex-wrap gap-1" role="group" aria-label={t("board.floor", { n: floor ?? "" })}>
            {floorRooms.map((r) => {
              const tile = tileOf(r.number);
              const unassigned = fp.unassignedNumbers.has(r.number);
              const selected = fp.multiMode
                ? fp.multiPick.has(r.number)
                : fp.mode === "housekeeper-first" && fp.activeAttendantId != null && tile.live?.assignedToId === fp.activeAttendantId;
              // Kachel sagt schon Abreise/Bleiber/…; extra nur „Turn“ (Abreise + Anreise am selben Tag)
              const categoryKey = tile.category === "SAME_DAY_TURN" ? DAY_CATEGORY_KEY.SAME_DAY_TURN : null;
              const hint = [tile.live?.assignedTo?.name, categoryKey ? t(categoryKey) : null].filter(Boolean).join(" · ");
              return (
                <FloorTile
                  key={r.number}
                  room={r.number}
                  state={tile.state}
                  stateLabel={t(TILE_UI[tile.state].labelKey)}
                  unassigned={unassigned}
                  unassignedLabel={t(TILE_UNASSIGNED_KEY)}
                  selected={selected}
                  marker={tile.laundry ? "laundry" : undefined}
                  markerLabel={t(MARKER_UI.laundry.labelKey)}
                  hint={hint || undefined}
                  onClick={() => fp.handleRoomClick(r)}
                />
              );
            })}
          </div>
          <Legend />
        </>
      ) : (
        <LegacySurface>
          <DragDropBoard
            hint={t("board.hint")}
            onMove={(ids, to) => fp.assignMany(ids, to)}
            columns={[
              ...onShiftAttendants.map((a): BoardColumn => {
                const rooms = fp.liveRooms.filter((r) => r.assignedToId === a.id && fp.dayRowIds.has(r.id));
                const c = fp.creditsByAttendant.get(a.id) ?? 0;
                const bad = c > fp.targetCredits;
                return {
                  id: a.id, title: a.name, items: rooms.map(fp.roomItem),
                  summary: <span className={`text-sm ${bad ? "font-semibold text-status-dirty" : "text-graphite/60"}`}>{Math.round(c * 10) / 10} {t("planning.floorPlanCreditsShort")}</span>,
                };
              }),
              {
                id: null, title: t("planning.floorPlanOpenCard"), tone: "open",
                items: fp.liveRooms.filter((r) => fp.unassignedRoomIds.includes(r.id)).map(fp.roomItem),
                quick: fp.openQuick,
              },
            ]}
          />
        </LegacySurface>
      )}
    </GlassCard>
  );

  const assignCard = (
    <GlassCard as="section" aria-labelledby="plan-assign-title" className="order-first flex min-w-0 flex-col gap-4 lg:order-none">
      <h2 id="plan-assign-title" className="text-title-22 text-text-primary">{t("supHub.assignTitle")}</h2>
      <div role="group" aria-label={t("supHub.assignTitle")} className="grid grid-cols-2 gap-2">
        <FilterChip active={fp.mode === "room-first"} onClick={() => fp.changeMode("room-first")} className="whitespace-normal! px-3! text-center">
          {t("planning.floorPlanModeRoomFirst")}
        </FilterChip>
        <FilterChip active={fp.mode === "housekeeper-first"} onClick={() => fp.changeMode("housekeeper-first")} className="whitespace-normal! px-3! text-center">
          {t("planning.floorPlanModeHousekeeperFirst")}
        </FilterChip>
      </div>

      {over.length > 0 && (
        <Banner
          tone="warning"
          title={t("supHub.overloadTitle", { names: over.map((a) => a.name).join(", ") })}
          detail={t("planning.floorPlanCreditsOverTarget", { target: fp.targetCredits })}
        />
      )}

      <p className="text-body-16 text-text-muted">
        {fp.mode === "room-first" ? t("planning.floorPlanModeRoomFirstHint") : active ? t("planning.floorPlanActivePanelEmpty") : t("planning.floorPlanPickAttendantHint")}
      </p>

      <ul className="flex flex-col gap-2">
        {onShiftAttendants.map((a) => {
          const c = credits(a.id);
          const isActive = fp.mode === "housekeeper-first" && a.id === fp.activeAttendantId;
          const tooMuch = isOverTarget(c, fp.targetCredits);
          const creditsText = t("supHub.creditsOf", { credits: num(c), target: fp.targetCredits });
          return (
            <li key={a.id}>
              <button
                type="button"
                aria-pressed={fp.mode === "housekeeper-first" ? isActive : undefined}
                disabled={fp.mode !== "housekeeper-first"}
                onClick={() => fp.setActiveAttendantId((prev) => (prev === a.id ? null : a.id))}
                className={cx(
                  "press glass flex w-full flex-col gap-2 rounded-(--glass-radius-md) px-4 py-3 text-start disabled:cursor-default",
                  isActive && "glass-selected",
                  FOCUS_RING,
                )}
              >
                <span className="flex w-full items-center gap-3">
                  <span className="text-body-18 min-w-0 flex-1 truncate text-text-primary">{a.name}</span>
                  <span className={cx("text-label whitespace-nowrap", tooMuch ? "text-status-warning-fg" : "text-text-secondary")}>{creditsText}</span>
                </span>
                <ProgressBar value={c} max={fp.targetCredits} label={creditsText} />
                {tooMuch && (
                  <span className="flex items-center gap-2">
                    <Glyph name="triangle-alert" size={18} className="text-status-warning-fg" />
                    <Pill tone="warning">{t("supHub.overloadPill")}</Pill>
                  </span>
                )}
              </button>
              {isActive && (
                <div className="mt-2 flex flex-col gap-2 px-1">
                  {fp.sessionRoomNumbers.length > 0 && <span className="text-label text-text-muted">{t("supHub.sessionRooms")}</span>}
                  <div className="flex flex-wrap gap-2">
                    {fp.sessionRoomNumbers.map((number) => (
                      <button
                        key={number}
                        type="button"
                        onClick={() => fp.removeFromSession(number)}
                        aria-label={t("supHub.removeRoom", { number })}
                        className={cx("press text-label inline-flex min-h-(--size-touch-min) items-center gap-1 rounded-pill border border-pill-gold-border bg-pill-gold-bg px-4 text-text-primary", FOCUS_RING)}
                      >
                        {number}
                        <Glyph name="x" size={16} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-label flex items-center gap-2 text-text-muted">
        <Glyph name="check" size={18} className="text-status-success-fg" />
        {t("supHub.liveSaved")}
      </p>
    </GlassCard>
  );

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {kpis}
      {fp.notice && (
        <div role="alert" className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Banner tone="warning" title={fp.notice} className="flex-1" />
          <Button variant="secondary" icon="x" onClick={() => fp.setNotice(null)}>
            {t("common.close")}
          </Button>
        </div>
      )}
      <div className="grid items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]">
        {floorCard}
        {assignCard}
      </div>

      {fp.roomsDueForLinen.length > 0 && (
        <GlassCard as="section" aria-labelledby="plan-linen-title" className="flex flex-col gap-3">
          <div id="plan-linen-title">
            <SectionLabel icon="shirt" title={t("planning.floorPlanLinenSectionTitle")} count={fp.roomsDueForLinen.length} />
          </div>
          <ul className="flex flex-wrap gap-2">
            {fp.roomsDueForLinen.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-(--glass-radius-sm) bg-surface-card-raised py-1 ps-4 pe-1">
                <span className="text-body-18 text-text-primary">{r.number}</span>
                <button
                  type="button"
                  onClick={() => fp.markLinenChanged(r.id)}
                  className={cx("press text-label min-h-(--size-touch-min) rounded-(--glass-radius-sm) px-3 text-accent-text underline underline-offset-4", FOCUS_RING)}
                >
                  {t("planning.floorPlanLinenMarkChanged")}
                </button>
              </li>
            ))}
          </ul>
        </GlassCard>
      )}

      {pickList && fp.pickingRoom && (
        <HkWindow title={t("planning.floorPlanPickAttendantForRoom", { number: fp.pickingRoom.number })} onClose={() => fp.setPickingRoom(null)}>
          <div className="grid gap-2">
            {onShiftAttendants.map((a) => {
              const c = credits(a.id);
              const tooMuch = isOverTarget(c, fp.targetCredits);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => { void fp.assignRoom(fp.pickingRoom!, a.id); fp.setPickingRoom(null); }}
                  className={cx("press glass flex min-h-(--size-button-height) items-center justify-between gap-3 rounded-(--glass-radius-md) px-4 text-start", FOCUS_RING)}
                >
                  <span className="text-body-18 text-text-primary">{a.name}</span>
                  <span className="flex items-center gap-2">
                    {tooMuch && <Glyph name="triangle-alert" size={18} className="text-status-warning-fg" />}
                    <span className={cx("text-label", tooMuch ? "text-status-warning-fg" : "text-text-secondary")}>
                      {num(c)} {t("planning.floorPlanCreditsShort")}
                      {tooMuch && ` · ${t("supHub.overloadPill")}`}
                    </span>
                  </span>
                </button>
              );
            })}
            {fp.liveByNumber.get(fp.pickingRoom.number)?.assignedToId && (
              <Button variant="secondary" icon="circle" block onClick={() => { void fp.assignRoom(fp.pickingRoom!, null); fp.setPickingRoom(null); }}>
                {t("supHub.leaveOpen")}
              </Button>
            )}
          </div>
        </HkWindow>
      )}

      <GlassDialog
        open={!!fp.bulkPrompt}
        title={fp.bulkPrompt ? t("planning.floorPlanStartedTitle", { number: fp.bulkPrompt.rooms.join(", ") }) : ""}
        message={t("planning.floorPlanStartedBody")}
        confirmLabel={t("planning.floorPlanStartedConfirm")}
        onConfirm={() => { const p = fp.bulkPrompt; fp.setBulkPrompt(null); if (p) void fp.assignMany(p.ids, p.attendantId, true); }}
        onCancel={() => fp.setBulkPrompt(null)}
      />
      <GlassDialog
        open={!!fp.startedPrompt}
        title={fp.startedPrompt ? t("planning.floorPlanStartedTitle", { number: fp.startedPrompt.number }) : ""}
        message={t("planning.floorPlanStartedBody")}
        confirmLabel={t("planning.floorPlanStartedConfirm")}
        onConfirm={() => { const p = fp.startedPrompt; fp.setStartedPrompt(null); if (p) void fp.assignRoom(p.room, p.attendantId, true); }}
        onCancel={() => fp.setStartedPrompt(null)}
      />
    </div>
  );
}

/** Legende: jeder Zustand mit Symbol + Text, Goldrahmen und Wäschewechsel-Marker (nie nur Farbe). */
function Legend() {
  const { t } = useLocale();
  return (
    <ul className="text-label flex flex-wrap gap-x-4 gap-y-2 text-text-secondary">
      {TILE_STATES.map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <Glyph name={TILE_UI[s].icon} size={18} className={TILE_FG[TILE_UI[s].tone]} />
          {t(TILE_UI[s].labelKey)}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <Glyph name={MARKER_UI.laundry.icon} size={18} className="text-status-info-fg" />
        {t(MARKER_UI.laundry.labelKey)}
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="inline-block h-4 w-5 rounded-[5px] border-2 border-accent-default" />
        {t(TILE_UNASSIGNED_KEY)}
      </li>
    </ul>
  );
}
