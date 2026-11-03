"use client";

import Modal from "@/components/Modal";
import Collapsible from "@/components/Collapsible";
import FloorPlanGrid, { FloorPlanLegend } from "@/components/FloorPlanGrid";
import DayNumberTiles from "@/components/DayNumberTiles";
import DragDropBoard, { type BoardColumn } from "@/components/DragDropBoard";
import { toCleanOnFloor } from "@/lib/dayplan/dayNumbers";
import type { RoomDayCategory } from "@/lib/rooms/roomDayCategory";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import { usePlanningFloorPlan, type DraftBinding, type LiveRoom, type OnShiftAttendant, type PanelView } from "@/components/usePlanningFloorPlan";

export type { DraftBinding } from "@/components/usePlanningFloorPlan";

const DAY_CATEGORY_KEY: Record<RoomDayCategory, TKey | null> = {
  ARRIVAL: "planning.dayCategoryArrival",
  DEPARTURE: "planning.dayCategoryDeparture",
  STAYOVER: "planning.dayCategoryStayover",
  SAME_DAY_TURN: "planning.dayCategorySameDayTurn",
  DND: "planning.dayCategoryDnd",
  NONE: null,
};

/**
 * Manual, grundriss-based counterpart to the auto-generated plan above it
 * (see PlanningView) — same fields (assignedToId, routeOrder via the apply
 * endpoint's index), just filled in by tapping instead of accepting the
 * algorithm's proposal. Persists through the same single-room endpoint the
 * hotel-wide /floor-plan reference page already uses for click assignment
 * (POST /api/rooms/[id]/assign), so a click here and a click there can never
 * disagree about how a room gets assigned.
 *
 * Two assignment modes share the same grid and the same assign call (see
 * /floor-plan's room-first/housekeeper-first split): "room-first" opens a
 * picker for the tapped room; "housekeeper-first" keeps the existing
 * pick-then-tap flow with the on-shift rail at the screen edge.
 */
export default function PlanningFloorPlanPanel({
  onShiftAttendants,
  actionableRoomIds,
  deferredRoomIds = [],
  draft,
  initialView = "plan",
  bands,
  reloadToken = 0,
}: {
  onShiftAttendants: OnShiftAttendant[];
  actionableRoomIds: string[];
  deferredRoomIds?: string[];
  draft?: DraftBinding;
  /** Mit welcher Ansicht das Fenster startet (Grundriss oder Liste je Zimmermädchen). */
  initialView?: PanelView;
  /** Zielband der Credits je Kraft (nur Anzeige, nie eine Sperre). */
  bands?: Record<string, { lo: number; hi: number }>;
  /** Ändert sich der Wert, werden die Daten im Hintergrund neu geladen — ohne Neuaufbau (Auswahl, Scroll-Stand, Ansicht bleiben). */
  reloadToken?: number;
}) {
  const { t } = useLocale();
  // Logik unverändert im Hook (geteilt mit der Glas-Tagesplanung auf /floor-plan).
  const { plan, view, setView, addingTo, setAddingTo, startedPrompt, setStartedPrompt, error, mode, activeAttendantId, setActiveAttendantId, sessionRoomNumbers, pickingRoom, setPickingRoom, dayRows, notice, setNotice, multiMode, setMultiMode, multiPick, setMultiPick, addPick, setAddPick, bulkPrompt, setBulkPrompt, changeMode, liveRooms, liveByNumber, liveById, numbers, unassignedRoomIds, unassignedNumbers, laundryIds, roomFacts, creditsByAttendant, roomsDueForLinen, targetCredits, assignRoom, markLinenChanged, assignMany, handleRoomClick, removeFromSession, dayRowIds, roomItem, openQuick, activeAttendant } = usePlanningFloorPlan({ onShiftAttendants, draft, initialView, reloadToken });

  if (error && !plan) {
    return <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>;
  }
  if (!plan) {
    return <p className="text-sm text-graphite/60">{t("planning.floorPlanLoading")}</p>;
  }

  return (
    <div className="animate-rise pb-24">
      <DayNumberTiles className="mb-3" numbers={numbers} onShowOpen={() => { setView("list"); document.getElementById("board-open")?.scrollIntoView({ behavior: "smooth", block: "center" }); }} />
      {notice && (
        <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-status-in-progress/40 bg-status-in-progress/10 px-3 py-2 text-sm">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="min-h-11 rounded-lg border border-charcoal/15 px-3 text-xs font-medium">{t("common.close")}</button>
        </div>
      )}

      <FloorPlanLegend
        className="mb-3"
        occupiedLabel={t("planning.floorPlanLegendOccupied")}
        laundryLabel={t("planning.floorPlanLegendLaundryDue")}
        guestDndLabel={t("planning.floorPlanLegendGuestDnd")}
        categoryLabels={{
          ARRIVAL: t("planning.dayCategoryArrival"),
          DEPARTURE: t("planning.dayCategoryDeparture"),
          STAYOVER: t("planning.dayCategoryStayover"),
          SAME_DAY_TURN: t("planning.dayCategorySameDayTurn"),
          DND: t("planning.dayCategoryDnd"),
        }}
      />

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => changeMode("room-first")}
          aria-pressed={mode === "room-first"}
          className={`h-11 rounded-lg border px-4 text-sm font-medium transition ${
            mode === "room-first" ? "border-gold-line bg-parchment shadow-sm" : "border-charcoal/15 bg-white"
          }`}
        >
          {t("planning.floorPlanModeRoomFirst")}
        </button>
        <button
          type="button"
          onClick={() => changeMode("housekeeper-first")}
          aria-pressed={mode === "housekeeper-first"}
          className={`h-11 rounded-lg border px-4 text-sm font-medium transition ${
            mode === "housekeeper-first" ? "border-gold-line bg-parchment shadow-sm" : "border-charcoal/15 bg-white"
          }`}
        >
          {t("planning.floorPlanModeHousekeeperFirst")}
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {(["plan", "list"] as const).map((v) => (
          <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v}
            className={`h-11 rounded-lg border px-4 text-sm font-medium transition ${view === v ? "border-gold-line bg-parchment shadow-sm" : "border-charcoal/15 bg-white"}`}>
            {v === "plan" ? t("planning.floorPlanViewPlan") : t("planning.floorPlanViewList")}
          </button>
        ))}
      </div>
      {view === "plan" && (
        <div className="mb-3">
          <button type="button" aria-pressed={multiMode} onClick={() => { setMultiMode((m) => !m); setMultiPick(new Set()); setPickingRoom(null); }}
            className={`h-11 rounded-lg border px-4 text-sm font-medium transition ${multiMode ? "border-gold-line bg-parchment shadow-sm" : "border-charcoal/15 bg-white"}`}>
            {t("planning.floorPlanMultiSelect")}
          </button>
          {multiMode && (
            <div className="mt-2 rounded-xl border border-gold-line bg-parchment p-3" role="group" aria-label={t("planning.floorPlanMultiSelect")}>
              <p className="mb-2 text-sm">{multiPick.size === 0 ? t("planning.floorPlanMultiHint") : t("planning.floorPlanMultiCount", { n: multiPick.size })}</p>
              {/* Ganze Etage einer Kraft zuteilen: wählt die heute zu reinigenden Zimmer der Etage, dann wie jede Auswahl zuteilen */}
              <div className="mb-2 flex flex-wrap items-center gap-2" role="group" aria-label={t("planning.floorPlanMultiFloors")}>
                <span className="text-xs font-medium text-graphite/70">{t("planning.floorPlanMultiFloors")}</span>
                {[...new Set(dayRows.map((r) => r.floor ?? Number(r.number.slice(0, 1))))].sort((a, b) => a - b).map((f) => (
                  <button key={f} type="button" className="h-11 min-w-11 rounded-lg border border-charcoal/15 bg-white px-3 text-sm font-medium"
                    onClick={() => setMultiPick((prev) => { const n = new Set(prev); for (const r of toCleanOnFloor(dayRows, f, (id) => liveById.get(id)?.status)) if (liveByNumber.has(r.number)) n.add(r.number); return n; })}>
                    {t("board.floor", { n: f })}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {onShiftAttendants.map((a) => (
                  <button key={a.id} type="button" disabled={multiPick.size === 0} className="h-11 rounded-lg border border-charcoal/15 bg-white px-4 text-sm font-medium disabled:opacity-40"
                    onClick={() => { const ids = [...multiPick].map((n) => liveByNumber.get(n)?.id).filter((x): x is string => !!x); setMultiPick(new Set()); void assignMany(ids, a.id); }}>{a.name}</button>
                ))}
                <button type="button" disabled={multiPick.size === 0} className="h-11 rounded-lg border border-charcoal/15 bg-white px-4 text-sm disabled:opacity-40"
                  onClick={() => { const ids = [...multiPick].map((n) => liveByNumber.get(n)?.id).filter((x): x is string => !!x); setMultiPick(new Set()); void assignMany(ids, null); }}>{t("planning.floorPlanMultiRemove")}</button>
                <button type="button" disabled={multiPick.size === 0} className="h-11 rounded-lg px-3 text-sm text-graphite/70 underline disabled:opacity-40" onClick={() => setMultiPick(new Set())}>{t("planning.floorPlanMultiClear")}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === "room-first" ? (
        <p className="mb-3 text-sm text-graphite/60">{t("planning.floorPlanModeRoomFirstHint")}</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {onShiftAttendants.map((a) => {
              const active = a.id === activeAttendantId;
              const credits = creditsByAttendant.get(a.id) ?? 0;
              const over = credits > targetCredits;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setActiveAttendantId((prev) => (prev === a.id ? null : a.id))}
                  aria-pressed={active}
                  title={over ? t("planning.floorPlanCreditsOverTarget", { target: targetCredits }) : undefined}
                  className={`h-11 rounded-lg border px-4 text-sm font-medium transition ${
                    active ? "border-gold-line bg-parchment shadow-sm" : "border-charcoal/15 bg-white"
                  }`}
                >
                  {a.name}{" "}
                  <span className={over ? "font-semibold text-status-dirty" : "text-graphite/60"}>
                    · {credits} {t("planning.floorPlanCreditsShort")}
                  </span>
                </button>
              );
            })}
          </div>
          {!activeAttendantId && <p className="mb-3 text-sm text-graphite/60">{t("planning.floorPlanPickAttendantHint")}</p>}
        </>
      )}

      {view === "list" ? (
        <div id="board-open-anchor">
          <DragDropBoard
            hint={t("board.hint")}
            onMove={(ids, to) => assignMany(ids, to)}
            columns={[
              ...onShiftAttendants.map((a): BoardColumn => {
                const rooms = liveRooms.filter((r) => r.assignedToId === a.id && dayRowIds.has(r.id));
                const credits = creditsByAttendant.get(a.id) ?? 0;
                const band = bands?.[a.id];
                const bad = band ? credits > band.hi + 0.25 || (rooms.length > 0 && credits < band.lo - 0.25) : credits > targetCredits;
                return {
                  id: a.id, title: a.name, items: rooms.map(roomItem),
                  summary: <span className={`text-sm ${bad ? "font-semibold text-status-dirty" : "text-graphite/60"}`}>{Math.round(credits * 10) / 10}{band ? ` / ${band.lo}–${band.hi}` : ""} {t("planning.floorPlanCreditsShort")}</span>,
                };
              }),
              {
                id: null, title: t("planning.floorPlanOpenCard"), tone: "open",
                items: liveRooms.filter((r) => unassignedRoomIds.includes(r.id)).map(roomItem),
                quick: openQuick,
              },
            ]}
          />
        </div>
      ) : (
      <FloorPlanGrid
        plan={plan}
        onRoomClick={handleRoomClick}
        getRoomMeta={(r) => {
          const live = liveByNumber.get(r.number);
          const facts = live ? roomFacts.get(live.id) : undefined;
          const category = facts?.category ?? "NONE";
          return {
            category,
            occupancy: live?.occupancy,
            isCheckoutToday: live?.isCheckoutToday ?? false,
            laundryDue: facts?.laundryDue ?? false,
            guestDndActive: facts?.guestDndActive ?? false,
            selected: multiMode ? multiPick.has(r.number) : mode === "housekeeper-first" && activeAttendantId != null && live?.assignedToId === activeAttendantId,
            unassignedActionable: unassignedNumbers.has(r.number),
            badge: live?.assignedTo?.name.split(" ")[0],
            title:
              [
                live?.assignedTo && `${live.assignedTo.name}`,
                unassignedNumbers.has(r.number) && t("planning.floorPlanUnassignedLegend"),
                DAY_CATEGORY_KEY[category] && t(DAY_CATEGORY_KEY[category] as TKey),
              ]
                .filter(Boolean)
                .join(" · ") || undefined,
          };
        }}
      />
      )}

      {roomsDueForLinen.length > 0 && (
        <div className="mt-3 rounded-2xl border border-status-in-progress/30 bg-status-in-progress/10 p-4">
          <Collapsible
            defaultOpen={roomsDueForLinen.length <= 8}
            summary={
              <h4 className="font-serif text-lg text-status-in-progress">
                {t("planning.floorPlanLinenSectionTitle")} · {roomsDueForLinen.length}
              </h4>
            }
          >
            <ul className="flex flex-wrap gap-2">
              {roomsDueForLinen.map((r) => (
                <li key={r.id} className="flex items-center gap-1.5 rounded-lg border border-charcoal/15 bg-white px-2.5 py-1.5 text-sm">
                  <span className="font-medium">{r.number}</span>
                  <button
                    type="button"
                    onClick={() => markLinenChanged(r.id)}
                    className="rounded-md border border-charcoal/15 px-2 py-0.5 text-xs font-medium hover:border-gold-line"
                  >
                    {t("planning.floorPlanLinenMarkChanged")}
                  </button>
                </li>
              ))}
            </ul>
          </Collapsible>
        </div>
      )}

      {mode === "housekeeper-first" && activeAttendant && (
        <div className="fixed bottom-3 start-3 end-3 z-40 rounded-2xl border border-charcoal/10 bg-linen/95 p-4 shadow-lift backdrop-blur sm:start-auto sm:end-4 sm:w-80">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-serif text-xl">{t("planning.floorPlanActivePanelTitle", { name: activeAttendant.name })}</h4>
            <button
              type="button"
              onClick={() => setActiveAttendantId(null)}
              className="h-9 rounded-lg border border-charcoal/15 px-3 text-xs font-medium hover:border-gold-line"
            >
              {t("planning.floorPlanDeselectAttendant")}
            </button>
          </div>
          {sessionRoomNumbers.length === 0 ? (
            <p className="mt-2 text-xs text-graphite/60">{t("planning.floorPlanActivePanelEmpty")}</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {sessionRoomNumbers.map((number) => (
                <li key={number}>
                  <button
                    type="button"
                    onClick={() => removeFromSession(number)}
                    title={t("planning.floorPlanRemoveRoom", { number })}
                    className="flex h-9 items-center gap-1 rounded-lg border border-charcoal/15 bg-white px-2.5 text-sm font-medium hover:border-status-out-of-order/40 hover:text-status-out-of-order"
                  >
                    {number} <span aria-hidden>×</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {pickingRoom && (mode === "room-first" || view === "list") && (
        <Modal
          title={t("planning.floorPlanPickAttendantForRoom", { number: pickingRoom.number })}
          onClose={() => setPickingRoom(null)}
        >
          <div className="grid gap-2">
            {onShiftAttendants.map((a) => {
              const credits = creditsByAttendant.get(a.id) ?? 0;
              const over = credits > targetCredits;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    assignRoom(pickingRoom, a.id);
                    setPickingRoom(null);
                  }}
                  title={over ? t("planning.floorPlanCreditsOverTarget", { target: targetCredits }) : undefined}
                  className="flex h-14 items-center justify-between rounded-xl border border-charcoal/15 px-4 text-start hover:border-gold-line"
                >
                  <span className="font-medium">{a.name}</span>
                  <span className={`text-sm ${over ? "font-semibold text-status-dirty" : "text-graphite/60"}`}>
                    {credits} {t("planning.floorPlanCreditsShort")}
                  </span>
                </button>
              );
            })}
            {liveByNumber.get(pickingRoom.number)?.assignedToId && (
              <button type="button" onClick={() => { assignRoom(pickingRoom, null); setPickingRoom(null); }}
                className="flex h-12 items-center justify-center rounded-xl border border-charcoal/15 px-4 text-sm font-medium text-graphite hover:border-status-out-of-order/40">
                {t("planning.floorPlanOpenCard")}
              </button>
            )}
          </div>
        </Modal>
      )}

      {addingTo && (
        <Modal title={t("planning.floorPlanAddRoomTitle", { name: onShiftAttendants.find((a) => a.id === addingTo)?.name ?? "" })} onClose={() => { setAddingTo(null); setAddPick(new Set()); }}>
          {unassignedRoomIds.length === 0 ? <p className="text-sm text-graphite/70">{t("planning.floorPlanNoOpenRooms")}</p> : (
            <>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {openQuick.map((q) => (
                  <button key={q.label} type="button" onClick={() => setAddPick((p) => new Set([...p, ...q.ids]))} className="min-h-11 rounded-full border border-dashed border-charcoal/25 px-3 text-xs font-medium hover:border-gold-line">{q.label}</button>
                ))}
              </div>
              <ul className="mb-3 flex flex-wrap gap-1.5">
                {unassignedRoomIds.map((id) => liveById.get(id)).filter((r): r is LiveRoom => !!r).map((r) => (
                  <li key={r.id}>
                    <button type="button" aria-pressed={addPick.has(r.id)} onClick={() => setAddPick((p) => { const n = new Set(p); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                      className={`min-h-11 rounded-lg border px-3 text-sm font-medium ${addPick.has(r.id) ? "border-gold-line bg-parchment ring-2 ring-gold-line" : "border-charcoal/15 bg-white hover:border-gold-line"}`}>
                      {r.number} <span className="text-xs text-graphite/60">· {Math.round((roomFacts.get(r.id)?.credit ?? 0) * 10) / 10}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" disabled={addPick.size === 0} onClick={() => { const ids = [...addPick]; const to = addingTo; setAddPick(new Set()); setAddingTo(null); void assignMany(ids, to); }}
                className="h-12 rounded-xl bg-navy px-6 text-sm font-medium text-white hover:bg-navy-line disabled:opacity-40">{t("board.nSelected", { n: addPick.size })} → {t("board.assignTo").replace(":", "")}</button>
            </>
          )}
        </Modal>
      )}

      {bulkPrompt && (
        <Modal title={t("planning.floorPlanStartedTitle", { number: bulkPrompt.rooms.join(", ") })} onClose={() => setBulkPrompt(null)}>
          <p className="mb-4 text-sm text-graphite/80">{t("planning.floorPlanStartedBody")}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { const p = bulkPrompt; setBulkPrompt(null); void assignMany(p.ids, p.attendantId, true); }} className="h-12 rounded-xl bg-navy px-6 text-sm font-medium text-white hover:bg-navy-line">{t("planning.floorPlanStartedConfirm")}</button>
            <button type="button" onClick={() => setBulkPrompt(null)} className="h-12 rounded-xl border border-charcoal/15 bg-white px-5 text-sm">{t("common.cancel")}</button>
          </div>
        </Modal>
      )}

      {startedPrompt && (
        <Modal title={t("planning.floorPlanStartedTitle", { number: startedPrompt.number })} onClose={() => setStartedPrompt(null)}>
          <p className="mb-4 text-sm text-graphite/80">{t("planning.floorPlanStartedBody")}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { const p = startedPrompt; setStartedPrompt(null); void assignRoom(p.room, p.attendantId, true); }}
              className="h-12 rounded-xl bg-navy px-6 text-sm font-medium text-white hover:bg-navy-line">{t("planning.floorPlanStartedConfirm")}</button>
            <button type="button" onClick={() => setStartedPrompt(null)} className="h-12 rounded-xl border border-charcoal/15 bg-white px-5 text-sm">{t("common.cancel")}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
