"use client";

import { useLocale } from "@/lib/i18n/LocaleContext";
import { toCleanOnFloor } from "@/lib/dayplan/dayNumbers";
import { MARKER_UI } from "@/lib/ui/markers";
import { TILE_STATES, TILE_UI, TILE_UNASSIGNED_KEY } from "@/lib/ui/room-tile";
import { Button, FilterChip, GlassCard, Glyph, SectionLabel } from "@/components/ui";
import { cx, FOCUS_RING, TILE_FG } from "@/components/ui/primitives";
import { GlassDialog } from "@/components/shell/GlassDialog";
import { HkWindow } from "@/components/hk/HkParts";
import DragDropBoard, { type BoardColumn } from "@/components/DragDropBoard";
import type { OnShiftAttendant, usePlanningFloorPlan } from "@/components/usePlanningFloorPlan";

/**
 * Gemeinsame Teile der Zuteilung im Glas-Stil (aus `GlassPlanningBoard` herausgelöst, Verhalten unverändert):
 * Liste je Kraft (Ziehen/Mehrfachauswahl), „Mehrere Zimmer wählen“, Wäschewechsel, Rückfragen bei begonnenen Zimmern,
 * Kraft-Wahl für ein Zimmer. Alle Wege kommen aus `usePlanningFloorPlan` — hier ist nur Darstellung.
 */
export type FloorPlanState = ReturnType<typeof usePlanningFloorPlan>;

const num1 = (fmt: ReturnType<typeof useLocale>["fmt"], n: number) => fmt.number(n, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Liste je Kraft (gleiches `DragDropBoard` wie bisher): Ziehen, Antippen = Mehrfachauswahl, Leiste „Zuteilen an“. */
export function PlanningListBoard({ fp, attendants, overIds }: { fp: FloorPlanState; attendants: OnShiftAttendant[]; overIds: Set<string> }) {
  const { t, fmt } = useLocale();
  return (
    <DragDropBoard
      hint={t("board.hint")}
      onMove={(ids, to) => fp.assignMany(ids, to)}
      columns={[
        ...attendants.map((a): BoardColumn => {
          const rooms = fp.liveRooms.filter((r) => r.assignedToId === a.id && fp.dayRowIds.has(r.id));
          const c = fp.creditsByAttendant.get(a.id) ?? 0;
          const bad = overIds.has(a.id);
          return {
            id: a.id, title: a.name, items: rooms.map(fp.roomItem),
            summary: (
              <span className={cx("text-label flex items-center gap-1", bad ? "text-status-warning-fg" : "text-text-secondary")}>
                {bad && <Glyph name="triangle-alert" size={16} />}
                {rooms.length} {t("tagesplan.roomsShort")} · {num1(fmt, c)} {t("planning.floorPlanCreditsShort")}{bad ? ` · ${t("tagesplan.loadOverload")}` : ""}
              </span>
            ),
          };
        }),
        {
          id: null, title: t("planning.floorPlanOpenCard"), tone: "open",
          items: fp.liveRooms.filter((r) => fp.unassignedRoomIds.includes(r.id)).map(fp.roomItem),
          quick: fp.openQuick,
        },
      ]}
    />
  );
}

/** „Mehrere Zimmer wählen“: ganze Etage wählen, dann einer Kraft zuteilen / freigeben (ein Aufruf `assignMany`). */
export function MultiSelectPanel({ fp, attendants }: { fp: FloorPlanState; attendants: OnShiftAttendant[] }) {
  const { t } = useLocale();
  const ids = () => [...fp.multiPick].map((n) => fp.liveByNumber.get(n)?.id).filter((x): x is string => !!x);
  return (
    <div role="group" aria-label={t("planning.floorPlanMultiSelect")} className="flex flex-col gap-3 rounded-(--glass-radius-md) bg-surface-selected p-4">
      <p className="text-body-16 text-text-primary">{fp.multiPick.size === 0 ? t("planning.floorPlanMultiHint") : t("planning.floorPlanMultiCount", { n: fp.multiPick.size })}</p>
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
        {attendants.map((a) => (
          <FilterChip key={a.id} disabled={fp.multiPick.size === 0} className="px-5!" onClick={() => { const x = ids(); fp.setMultiPick(new Set()); void fp.assignMany(x, a.id); }}>
            {a.name}
          </FilterChip>
        ))}
        <FilterChip disabled={fp.multiPick.size === 0} className="px-5!" onClick={() => { const x = ids(); fp.setMultiPick(new Set()); void fp.assignMany(x, null); }}>
          {t("planning.floorPlanMultiRemove")}
        </FilterChip>
        <FilterChip disabled={fp.multiPick.size === 0} className="px-5!" onClick={() => fp.setMultiPick(new Set())}>
          {t("planning.floorPlanMultiClear")}
        </FilterChip>
      </div>
    </div>
  );
}

/** Wäschewechsel fällig: Supervisor meldet den Wechsel (nur aus echten Daten). */
export function LinenCard({ fp }: { fp: FloorPlanState }) {
  const { t } = useLocale();
  if (!fp.roomsDueForLinen.length) return null;
  return (
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
              className={cx("press text-label min-h-12 rounded-(--glass-radius-sm) px-3 text-accent-text underline underline-offset-4", FOCUS_RING)}
            >
              {t("planning.floorPlanLinenMarkChanged")}
            </button>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

/** Rückfragen (begonnene Zimmer, einzeln und gebündelt) und Kraft-Wahl für ein Zimmer — dieselben Wege wie bisher. */
export function PlanningDialogs({ fp, attendants, overIds }: { fp: FloorPlanState; attendants: OnShiftAttendant[]; overIds: Set<string> }) {
  const { t, fmt } = useLocale();
  return (
    <>
      {fp.pickingRoom && (
        <HkWindow title={t("planning.floorPlanPickAttendantForRoom", { number: fp.pickingRoom.number })} onClose={() => fp.setPickingRoom(null)}>
          <div className="grid gap-2">
            {attendants.map((a) => {
              const c = fp.creditsByAttendant.get(a.id) ?? 0;
              const tooMuch = overIds.has(a.id);
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
                      {num1(fmt, c)} {t("planning.floorPlanCreditsShort")}
                      {tooMuch && ` · ${t("tagesplan.loadOverload")}`}
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
    </>
  );
}

/** Legende: jeder Zustand mit Symbol + Text, Goldrahmen und Wäschewechsel-Marker (nie nur Farbe). */
export function TileLegend() {
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
