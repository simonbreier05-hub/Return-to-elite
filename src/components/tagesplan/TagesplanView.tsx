"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import { isToClean } from "@/lib/dayplan/dayNumbers";
import type { RoomFlags } from "@/components/FloorPlanGrid";
import { MARKER_UI } from "@/lib/ui/markers";
import { TILE_UI, TILE_UNASSIGNED_KEY, tileStateFor, type TileState } from "@/lib/ui/room-tile";
import {
  CLEAN_KIND_UI, cleanKindOf, crewKindOf, crewSummaries, floorLanes, groupByCrew, planHints, planState, roomsWithoutFloor, roundCredits,
  type PlanHint, type PlanRoom,
} from "@/lib/ui/tagesplan";
import { Banner, Button, FilterChip, FloorTile, GlassCard, Glyph } from "@/components/ui";
import { cx, FOCUS_RING } from "@/components/ui/primitives";
import { DetailContainer } from "@/components/shell/DetailContainer";
import { useBreakpoint } from "@/components/shell/useBreakpoint";
import LiveRoomModal from "@/components/lists/LiveRoomModal";
import { usePlanningFloorPlan, type DraftBinding, type OnShiftAttendant } from "@/components/usePlanningFloorPlan";
import { LinenCard, MultiSelectPanel, PlanningDialogs, PlanningListBoard, TileLegend } from "./PlanningParts";
import { CrewDetailBody, DayHeader, FloorLane, HintRow, RoomChips, TeamBar, type DayStat } from "./TagesplanParts";
import { EMPTY_META, type TagesplanMeta } from "./useTagesplanMeta";

const KIND_KEY: Record<string, TKey> = { VOLLZEIT: "tagesplan.crewFull", TEILZEIT: "tagesplan.crewPart", AZUBI: "tagesplan.crewTrainee" };

/**
 * Tagesplan „Glas & Premium“ (Plan-1) — ein Screen für Supervisor (`/floor-plan`, live) und Duty Manager (`/planung`, Entwurf
 * des Vorschlags bis zum Bestätigen). Tageskopf, Team-Leiste, Etagen-Zeilen (`FloorLane`), Kraft-Detail, Hinweise.
 * Alle Daten und Wege kommen aus `usePlanningFloorPlan` (Zuteilen per Zwei-Tap, `bulk-assign` bzw. Entwurf) und
 * `computeDayNumbers`; Anzeige-Regeln aus `src/lib/ui/tagesplan.ts`. Zimmer antippen = `openRoom` → `LiveRoomModal`.
 * Die Oberfläche wird nie per `key` neu aufgebaut: neue Daten kommen über `reloadToken` im Hintergrund.
 */
export function TagesplanView({
  onShiftAttendants, reloadToken = 0, draft, meta = EMPTY_META, date, actions, footer,
}: {
  onShiftAttendants: OnShiftAttendant[];
  reloadToken?: number;
  draft?: DraftBinding;
  meta?: TagesplanMeta;
  date: string | null;
  /** Zusätzliche Knöpfe im Tageskopf (z. B. „Listen“). */
  actions?: ReactNode;
  /** Fester Bereich unten (z. B. „Plan prüfen und bestätigen“). */
  footer?: ReactNode;
}) {
  const { t, fmt } = useLocale();
  const bp = useBreakpoint();
  const fp = usePlanningFloorPlan({ onShiftAttendants, draft, reloadToken });
  const [openFloor, setOpenFloor] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [roomRef, setRoomRef] = useState<string | null>(null);
  const [jump, setJump] = useState<number | null>(null);
  const online = useOnline();

  // ── Daten (nur gruppiert, nichts neu gezählt) ──
  const floorOf = useMemo(() => new Map((fp.plan?.rooms ?? []).map((r) => [r.number, r.floor])), [fp.plan]);
  const openIds = useMemo(() => new Set(fp.unassignedRoomIds), [fp.unassignedRoomIds]);
  const rooms = useMemo<PlanRoom[]>(() => fp.dayRows.flatMap((r) => {
    const live = fp.liveById.get(r.id);
    if (!isToClean(r.kind, live?.status ?? r.status)) return [];
    const kind = cleanKindOf(r);
    if (!kind) return [];
    const to = live?.assignedToId ?? null;
    return [{
      id: r.id, number: r.number, floor: floorOf.get(r.number) ?? r.floor ?? null, kind,
      credit: fp.roomFacts.get(r.id)?.credit ?? 0,
      assignedToId: to && fp.onShiftIds.has(to) ? to : null,
      open: openIds.has(r.id),
    }];
  }), [fp.dayRows, fp.liveById, fp.roomFacts, fp.onShiftIds, floorOf, openIds]);

  const crew = useMemo(() => crewSummaries(onShiftAttendants.map((a) => ({ ...a, kind: meta.kinds[a.id] })), rooms), [onShiftAttendants, meta.kinds, rooms]);
  const crewById = useMemo(() => new Map(crew.map((c) => [c.id, c])), [crew]);
  const floors = fp.plan?.floors ?? [];
  const lanes = useMemo(() => floorLanes(floors, rooms, crew), [floors, rooms, crew]);
  const hints = useMemo(() => planHints({ crew, rooms, levelWarnings: meta.levelWarnings }), [crew, rooms, meta.levelWarnings]);
  const overIds = useMemo(() => new Set(crew.filter((c) => c.state === "overload").map((c) => c.id)), [crew]);
  const noFloorHouse = roomsWithoutFloor(fp.inventory, fp.plan?.rooms.length ?? 0);
  const noFloorDay = rooms.filter((r) => r.floor == null);
  const state = planState({ hasProposal: meta.hasProposal, confirmed: meta.confirmed, edits: meta.edits });

  // Hinweis angetippt: Zeile öffnen, dann dorthin scrollen (nach dem Rendern)
  useEffect(() => {
    if (jump == null) return;
    document.getElementById(`tp-lane-${jump}`)?.scrollIntoView({ block: "nearest" });
    setJump(null);
  }, [jump]);

  if (bp === "phone") {
    return <Banner tone="info" icon="calendar-days" title={t("supHub.tabletOnlyTitle")} detail={t("supHub.tabletOnlyDetail")} />;
  }
  if (fp.error && !fp.plan) {
    return <div role="alert"><Banner tone="warning" icon="triangle-alert" title={t("tagesplan.errorTitle")} detail={fp.error} /></div>;
  }
  if (!fp.plan || !bp) {
    return (
      <div role="status" aria-live="polite" className="flex flex-col gap-3">
        <span className="sr-only">{t("tagesplan.loading")}</span>
        {[0, 1, 2].map((i) => <div key={i} aria-hidden="true" className="glass h-18 rounded-(--glass-radius-md) opacity-60" />)}
      </div>
    );
  }

  // ── Handlungen ──
  const assigningId = fp.mode === "housekeeper-first" ? fp.activeAttendantId : null;
  const assigning = assigningId ? crewById.get(assigningId) ?? null : null;
  const selected = selectedId ? crewById.get(selectedId) ?? null : null;
  const openRoom = (roomId: string) => setRoomRef(roomId);
  const selectCrew = (id: string) => setSelectedId((cur) => (cur === id ? null : id));
  const startAssign = (id: string) => {
    if (fp.mode !== "housekeeper-first") fp.changeMode("housekeeper-first");
    fp.setMultiMode(false); fp.setMultiPick(new Set());
    fp.setActiveAttendantId(id);
    if (bp !== "wide") setSelectedId(null); // Sheet würde den Grundriss verdecken
  };
  const stopAssign = () => fp.setActiveAttendantId(null);
  /** Kachel: im Zuteilen-/Auswahlmodus wie bisher (Zwei-Tap), sonst Zimmer öffnen. */
  const onTile = (room: RoomFlags) => {
    if (fp.multiMode || assigningId) { fp.handleRoomClick(room); return; }
    const live = fp.liveByNumber.get(room.number);
    if (live) openRoom(live.id);
  };
  const onHint = (h: PlanHint) => {
    if (h.crewId) setSelectedId(h.crewId);
    if (h.floor != null) { setOpenFloor(h.floor); setJump(h.floor); }
  };

  const tileOf = (number: string): { state: TileState; laundry: boolean; hint: string } => {
    const live = fp.liveByNumber.get(number);
    const facts = live ? fp.roomFacts.get(live.id) : undefined;
    const st: TileState = facts?.guestDndActive ? "dnd" : tileStateFor(facts?.category ?? "NONE", live?.occupancy === "OCCUPIED");
    const r = live ? rooms.find((x) => x.id === live.id) : undefined;
    const hint = [live?.assignedTo?.name, r ? t(CLEAN_KIND_UI[r.kind].labelKey) : null].filter(Boolean).join(" · ");
    return { state: st, laundry: facts?.laundryDue ?? false, hint };
  };

  const totalCredits = roundCredits(rooms.reduce((a, r) => a + r.credit, 0));
  const mixAll = rooms.reduce((m, r) => ({ ...m, [r.kind]: m[r.kind] + 1 }), { turn: 0, linen: 0, tidy: 0, deep: 0, arrival: 0 });
  const stats: DayStat[] = [
    ...(["turn", "deep", "tidy", "linen", "arrival"] as const).filter((k) => mixAll[k] > 0 || k !== "arrival").map((k) => ({ key: k, icon: CLEAN_KIND_UI[k].icon, label: t(CLEAN_KIND_UI[k].labelKey), value: String(mixAll[k]) })),
    { key: "traces", icon: "list", label: t("tagesplan.traces"), value: meta.traces == null ? "–" : String(meta.traces) },
    { key: "credits", icon: "star", label: t("tagesplan.creditsSum"), value: fmt.number(totalCredits, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) },
    { key: "assigned", icon: "users", label: t("tagesplan.assigned"), value: `${fp.numbers.assigned}/${fp.numbers.toClean}` },
  ];
  const release = fp.liveRooms.filter((r) => fp.dayRowIds.has(r.id) && r.status === "CLEAN").length;
  const dateText = date ? fmt.date(new Date(`${date}T12:00:00`), { weekday: "long", day: "numeric", month: "long" }) : t("tagesplan.today");

  const available = crew.filter((c) => c.rooms === 0).map((c) => ({ id: c.id, name: c.name }));
  const showBanner = hints.length > 0 || (state === "proposal" || state === "draft");

  const detail = (
    <DetailContainer
      open={!!selected}
      onClose={() => setSelectedId(null)}
      title={selected?.name ?? ""}
      forceMode={bp === "wide" ? "wide" : "phone"}
      footer={selected && (
        assigningId === selected.id
          ? <Button variant="secondary" icon="check" block onClick={stopAssign}>{t("tagesplan.assignDone")}</Button>
          : <Button icon="bed-single" block onClick={() => startAssign(selected.id)}>{t("tagesplan.assignStart")}</Button>
      )}
    >
      {selected && (
        <CrewDetailBody crew={selected} rooms={rooms} hints={hints.filter((h) => h.crewId === selected.id)}
          kindLabel={t(KIND_KEY[crewKindOf(meta.kinds[selected.id])])} onOpenRoom={openRoom} onHint={onHint} />
      )}
    </DetailContainer>
  );

  return (
    <div className={cx("grid items-start gap-4", bp === "wide" && selected && "grid-cols-[minmax(0,1fr)_348px]")}>
      <div className="flex min-w-0 flex-col gap-4">
        <DayHeader dateText={dateText} state={state} live={{ done: fp.numbers.cleaned, total: fp.numbers.toClean }} release={release} stats={stats} actions={actions} />

        {!online && <div role="alert"><Banner tone="warning" icon="triangle-alert" title={t("tagesplan.offlineTitle")} detail={t("tagesplan.offlineDetail")} /></div>}
        {fp.notice && (
          <div role="alert" className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Banner tone="warning" title={fp.notice} className="flex-1" />
            <Button variant="secondary" icon="x" onClick={() => fp.setNotice(null)}>{t("common.close")}</Button>
          </div>
        )}

        <TeamBar crew={crew} selectedId={selectedId} assigningId={assigningId} available={available} onSelect={selectCrew} />

        {showBanner && (
          <details className="group flex flex-col gap-2" open={hints.length > 0 && hints.length <= 4}>
            <summary className={cx("press flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-(--glass-radius-md)", FOCUS_RING)}>
              <Banner tone={state === "proposal" || state === "draft" ? "accent" : "warning"} icon={state === "proposal" || state === "draft" ? "zap" : "triangle-alert"} className="flex-1"
                title={state === "proposal" || state === "draft" ? t("tagesplan.proposalReady", { n: hints.length }) : t("tagesplan.hintsN", { n: hints.length })} />
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              {hints.length === 0 ? <p className="text-body-16 text-text-muted">{t("tagesplan.noHints")}</p> : hints.map((h, i) => <HintRow key={i} hint={h} onClick={() => onHint(h)} />)}
            </div>
          </details>
        )}

        {assigning && (
          <div role="status" className="glass sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-(--glass-radius-md) px-4 py-2">
            <Glyph name="bed-single" size={20} className="text-accent-text" />
            <span className="text-body-16 min-w-0 flex-1 text-text-primary">{t("tagesplan.assignBanner", { name: assigning.name })}</span>
            {fp.sessionRoomNumbers.map((n) => (
              <button key={n} type="button" onClick={() => fp.removeFromSession(n)} aria-label={t("supHub.removeRoom", { number: n })}
                className={cx("press text-label inline-flex min-h-12 items-center gap-1 rounded-pill border border-pill-gold-border bg-pill-gold-bg px-4 text-text-primary", FOCUS_RING)}>
                {n}<Glyph name="x" size={16} />
              </button>
            ))}
            <Button variant="secondary" icon="check" onClick={stopAssign}>{t("tagesplan.assignDone")}</Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {(["plan", "list"] as const).map((v) => (
            <FilterChip key={v} active={fp.view === v} onClick={() => fp.setView(v)} className="px-5!">
              {v === "plan" ? t("tagesplan.viewFloors") : t("planning.floorPlanViewList")}
            </FilterChip>
          ))}
          {fp.view === "plan" && (
            <FilterChip active={fp.multiMode} className="px-5!"
              onClick={() => { fp.setMultiMode((m) => !m); fp.setMultiPick(new Set()); fp.setPickingRoom(null); stopAssign(); }}>
              {t("planning.floorPlanMultiSelect")}
            </FilterChip>
          )}
        </div>
        {fp.view === "plan" && fp.multiMode && <MultiSelectPanel fp={fp} attendants={onShiftAttendants} />}

        {rooms.length === 0 && (
          <Banner tone="info" icon="info" title={t("tagesplan.emptyTitle")} detail={t("tagesplan.emptyDetail")} />
        )}

        {fp.view === "list" ? (
          <GlassCard as="section" aria-label={t("planning.floorPlanViewList")}><PlanningListBoard fp={fp} attendants={onShiftAttendants} overIds={overIds} /></GlassCard>
        ) : (
          <div className="flex flex-col gap-2" aria-label={t("tagesplan.floorsTitle")} role="list">
            {lanes.map((lane) => {
              const f = lane.floor!;
              const isOpen = openFloor === f;
              const laneRooms = rooms.filter((r) => r.floor === f);
              const tiles = (fp.plan?.rooms ?? []).filter((r) => r.floor === f).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
              return (
                <div role="listitem" key={f}>
                  <FloorLane lane={lane} open={isOpen} onToggle={() => setOpenFloor(isOpen ? null : f)} selectedId={selectedId} onSelectCrew={selectCrew}>
                    {/* Grundriss nie spiegeln (auch nicht RTL). Goldrahmen = noch nicht zugeteilt. */}
                    <div dir="ltr" className="flex flex-wrap gap-1" role="group" aria-label={t("board.floor", { n: f })}>
                      {tiles.map((r) => {
                        const tile = tileOf(r.number);
                        const live = fp.liveByNumber.get(r.number);
                        const sel = fp.multiMode ? fp.multiPick.has(r.number) : (!!assigningId && live?.assignedToId === assigningId) || (!!selectedId && live?.assignedToId === selectedId);
                        return (
                          <FloorTile key={r.number} room={r.number} state={tile.state} stateLabel={t(TILE_UI[tile.state].labelKey)}
                            unassigned={fp.unassignedNumbers.has(r.number)} unassignedLabel={t(TILE_UNASSIGNED_KEY)} selected={sel}
                            marker={tile.laundry ? "laundry" : undefined} markerLabel={t(MARKER_UI.laundry.labelKey)} hint={tile.hint || undefined}
                            onClick={() => onTile(r)} />
                        );
                      })}
                    </div>
                    <TileLegend />
                    <div className="flex flex-col gap-3">
                      {groupByCrew(laneRooms, onShiftAttendants).map((g) => (
                        <div key={g.id ?? "open"} className="flex flex-col gap-2">
                          {g.id ? (
                            <button type="button" onClick={() => selectCrew(g.id!)} aria-pressed={g.id === selectedId}
                              className={cx("press text-body-16 inline-flex min-h-12 items-center gap-2 self-start rounded-pill px-3 text-text-primary", g.id === selectedId && "glass-selected", FOCUS_RING)}>
                              <Glyph name="user" size={18} className="text-text-secondary" />{g.name} · {t("tagesplan.roomsN", { n: g.rooms.length })}
                            </button>
                          ) : (
                            <span className="text-body-16 inline-flex min-h-12 items-center gap-2 text-accent-text"><Glyph name="circle" size={18} />{t("planning.floorPlanOpenCard")} · {g.rooms.length}</span>
                          )}
                          <RoomChips rooms={g.rooms} onOpen={openRoom} />
                        </div>
                      ))}
                    </div>
                  </FloorLane>
                </div>
              );
            })}
            {(noFloorHouse > 0 || noFloorDay.length > 0) && (
              <div role="listitem">
                <section className="glass flex flex-col gap-2 rounded-(--glass-radius-md) px-4 py-3" aria-label={t("tagesplan.noFloorN", { n: noFloorHouse + noFloorDay.length })}>
                  <span className="text-body-16 flex items-center gap-2 text-text-primary"><Glyph name="info" size={20} className="text-status-info-fg" />{t("tagesplan.noFloorN", { n: noFloorHouse + noFloorDay.length })}</span>
                  <span className="text-label text-text-secondary">{t("tagesplan.noFloorHint", { inventory: fp.inventory, mapped: fp.plan?.rooms.length ?? 0 })}</span>
                  {noFloorDay.length > 0 && <RoomChips rooms={noFloorDay} onOpen={openRoom} />}
                </section>
              </div>
            )}
          </div>
        )}

        <LinenCard fp={fp} />
        {footer && <div className="sticky bottom-0 z-10 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">{footer}</div>}
      </div>

      {detail}

      <PlanningDialogs fp={fp} attendants={onShiftAttendants} overIds={overIds} />
      {roomRef && <LiveRoomModal roomRef={roomRef} onClose={() => setRoomRef(null)} onChanged={fp.loadLive} />}
    </div>
  );
}

/** Verbindung zum Server (Offline-Zustand im Glas-Stil, Zuteilen speichert dann nicht). */
function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  return online;
}
