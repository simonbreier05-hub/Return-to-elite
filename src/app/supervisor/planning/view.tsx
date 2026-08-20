"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/components/api";
import Modal from "@/components/Modal";
import Collapsible from "@/components/Collapsible";
import { useLocale } from "@/lib/i18n/LocaleContext";

interface Attendant {
  id: string;
  name: string;
  section?: string | null;
}

interface RoomDetail {
  number: string;
  floor: number;
  section: string;
  minutes: number;
  isDeparture: boolean;
}

interface Assignment {
  attendantId: string;
  attendantName: string;
  roomIds: string[];
  totalMinutes: number;
  roomCount: number;
  floors: number[];
  sections: string[];
  load: number;
  overbooked: boolean;
  reasons: string[];
}

interface DayFigures {
  departures: number;
  arrivals: number;
  eveningOccupancy: number;
}

interface Plan {
  assignments: Assignment[];
  unassigned: { roomId: string; number: string; reason: string }[];
  summary: {
    totalRooms: number;
    totalMinutes: number;
    averageMinutes: number;
    spreadMinutes: number;
    capacityMinutes: number;
  };
}

interface PlanResponse {
  plan: Plan;
  rooms: Record<string, RoomDetail>;
  figures: DayFigures;
  defaults: DayFigures;
  warnings: { field: keyof DayFigures; message: string }[];
  stayovers: number;
  totalRooms: number;
  roomsNeedingWork: number;
}

const SHIFT_PRESETS = [
  { label: "Short", detail: "4 h", minutes: 240 },
  { label: "Standard", detail: "6.5 h", minutes: 390 },
  { label: "Long", detail: "8 h", minutes: 480 },
];

const fmt = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, "0")}`;

export default function PlanningView() {
  const { t } = useLocale();
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [onShift, setOnShift] = useState<Set<string>>(new Set());
  const [capacity, setCapacity] = useState(390);
  const [figures, setFigures] = useState<DayFigures | null>(null);
  const [result, setResult] = useState<PlanResponse | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState<{ roomId: string; fromId: string } | null>(null);
  const [edited, setEdited] = useState(false);

  const rooms = result?.rooms ?? {};

  useEffect(() => {
    api<{ attendants: Attendant[] }>("/api/rooms")
      .then((d) => {
        setAttendants(d.attendants);
        setOnShift(new Set(d.attendants.map((a) => a.id)));
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  /**
   * Guards against an out-of-order answer: turning a stepper quickly fires
   * several requests, and without this a slower earlier one could land last
   * and show figures the supervisor has already moved past.
   */
  const requestSeq = useRef(0);

  const createPlan = useCallback(
    async (
      overrides: { dayFigures?: DayFigures; onShift?: Set<string>; capacity?: number } = {},
      mode: "full" | "refresh" = "full"
    ) => {
      const seq = ++requestSeq.current;
      if (mode === "full") setBusy(true);
      else setRefreshing(true);
      setError(null);
      setApplied(null);
      try {
        // Explicit values, not the closured state: setOnShift/setCapacity are
        // async, so a team toggle followed straight by a recalc would otherwise
        // read the value from before the toggle.
        const res = await api<PlanResponse>("/api/assignments/plan", {
          body: {
            attendantIds: [...(overrides.onShift ?? onShift)],
            capacityMinutes: overrides.capacity ?? capacity,
            dayFigures: overrides.dayFigures ?? figures ?? undefined,
          },
        });
        if (seq !== requestSeq.current) return; // a newer request is already on its way
        setResult(res);
        setPlan(res.plan);
        setFigures(res.figures);
        setEdited(false);
      } catch (e) {
        if (seq === requestSeq.current) setError((e as Error).message);
      } finally {
        if (seq === requestSeq.current) {
          setBusy(false);
          setRefreshing(false);
        }
      }
    },
    [onShift, capacity, figures]
  );

  // Load the night-audit figures once, so the panel opens filled in rather
  // than empty — the supervisor adjusts, they do not type from scratch.
  useEffect(() => {
    if (attendants.length > 0 && !result) createPlan();  // uses current onShift/capacity, both freshly set above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendants.length]);

  /**
   * Turning a knob should show its effect immediately.
   *
   * A tap on +/− is a finished intent, so it fires at once — the plan endpoint
   * answers in well under 50 ms, and waiting half a second first was the whole
   * reason this felt sluggish. Typing into the field is not finished until the
   * typing stops, so that stays debounced, but only briefly.
   */
  const recalcTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyFigures = useCallback(
    (next: DayFigures, immediate: boolean) => {
      setFigures(next);
      setEdited(false);
      if (recalcTimer.current) clearTimeout(recalcTimer.current);
      if (immediate) {
        createPlan({ dayFigures: next }, "refresh");
      } else {
        recalcTimer.current = setTimeout(() => createPlan({ dayFigures: next }, "refresh"), 250);
      }
    },
    [createPlan]
  );
  useEffect(() => () => { if (recalcTimer.current) clearTimeout(recalcTimer.current); }, []);

  const setFigure = (field: keyof DayFigures, value: number, immediate = false) => {
    if (!figures) return;
    applyFigures({ ...figures, [field]: Math.max(0, value) }, immediate);
  };

  // Team and shift length feed the same planner, so changing either recalculates
  // too — a supervisor toggling three attendants off should not also have to
  // remember to press a button afterwards. Individual toggles debounce briefly
  // in case several are tapped in a row; the presets and All/None are one clear
  // action each and fire at once.
  const teamTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleTeamRecalc = useCallback(
    (next: { onShift?: Set<string>; capacity?: number }, immediate: boolean) => {
      if (!result) return; // nothing to refresh before the first proposal exists
      if (teamTimer.current) clearTimeout(teamTimer.current);
      if (immediate) createPlan(next, "refresh");
      else teamTimer.current = setTimeout(() => createPlan(next, "refresh"), 250);
    },
    [createPlan, result]
  );
  useEffect(() => () => { if (teamTimer.current) clearTimeout(teamTimer.current); }, []);

  const toggleAttendant = (id: string) => {
    const next = new Set(onShift);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOnShift(next);
    scheduleTeamRecalc({ onShift: next }, false);
  };
  const selectAllAttendants = () => {
    const next = new Set(attendants.map((a) => a.id));
    setOnShift(next);
    scheduleTeamRecalc({ onShift: next }, true);
  };
  const selectNoAttendants = () => {
    setOnShift(new Set());
    scheduleTeamRecalc({ onShift: new Set() }, true);
  };
  const selectCapacity = (minutes: number) => {
    setCapacity(minutes);
    scheduleTeamRecalc({ capacity: minutes }, true);
  };

  const moveRoom = (roomId: string, fromId: string, toId: string) => {
    setPlan((prev) => {
      if (!prev || fromId === toId) return prev;
      const minutes = rooms[roomId]?.minutes ?? 0;
      const cap = prev.summary.capacityMinutes;
      return {
        ...prev,
        assignments: prev.assignments.map((a) => {
          if (a.attendantId === fromId) {
            const roomIds = a.roomIds.filter((r) => r !== roomId);
            return recalc(a, roomIds, a.totalMinutes - minutes, cap);
          }
          if (a.attendantId === toId) return recalc(a, [...a.roomIds, roomId], a.totalMinutes + minutes, cap);
          return a;
        }),
      };
    });
    setEdited(true);
    setMoving(null);
  };

  const recalc = (a: Assignment, roomIds: string[], totalMinutes: number, cap: number): Assignment => {
    const floors = [...new Set(roomIds.map((id) => rooms[id]?.floor).filter((f): f is number => f != null))].sort();
    return {
      ...a,
      roomIds,
      totalMinutes,
      roomCount: roomIds.length,
      floors,
      load: cap > 0 ? totalMinutes / cap : 0,
      overbooked: totalMinutes > cap,
    };
  };

  const apply = async () => {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ roomsAssigned: number }>("/api/assignments/apply", {
        body: {
          assignments: plan.assignments
            .filter((a) => a.roomIds.length > 0)
            .map((a) => ({ attendantId: a.attendantId, roomIds: a.roomIds })),
        },
      });
      setApplied(t("planning.applied", { count: res.roomsAssigned }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const live = useMemo(() => plan?.assignments.filter((a) => a.roomCount > 0) ?? [], [plan]);
  const spread = useMemo(() => {
    if (!live.length) return 0;
    const m = live.map((a) => a.totalMinutes);
    return Math.max(...m) - Math.min(...m);
  }, [live]);

  const totalCapacity = capacity * onShift.size;
  const coverage = totalCapacity > 0 && plan ? plan.summary.totalMinutes / totalCapacity : 0;
  const warn = (field: keyof DayFigures) => result?.warnings.find((w) => w.field === field)?.message;

  return (
    <div className="animate-rise pb-28">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-4xl leading-none">{t("planning.title")}</h2>
          <div className="rule-gold my-2 w-40" />
          <p className="text-sm text-graphite/70">{t("planning.subtitle")}</p>
        </div>
        <Link
          href="/supervisor"
          className="flex h-12 items-center rounded-xl border border-charcoal/15 bg-linen px-5 text-sm font-medium hover:border-gold-line"
        >
          {t("planning.liveBoardLink")}
        </Link>
      </div>

      {/* ---- 1 · The day ---------------------------------------------------- */}
      <section className="mb-4 rounded-2xl border border-charcoal/10 bg-linen p-5 shadow-card">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-serif text-2xl">{t("planning.step1")}</h3>
          {result && (
            <button
              onClick={() => applyFigures(result.defaults, true)}
              className="h-10 rounded-lg px-3 text-sm text-gold hover:bg-parchment"
            >
              {t("planning.resetSystemData")}
            </button>
          )}
        </div>
        <p className="mb-4 text-sm text-graphite/60">{t("planning.step1Explain")}</p>

        {figures ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Stepper
              label={t("planning.departures")}
              hint={t("planning.departuresHint")}
              value={figures.departures}
              step={1}
              onChange={(v, immediate) => setFigure("departures", v, immediate)}
              warning={warn("departures")}
            />
            <Stepper
              label={t("planning.arrivals")}
              hint={t("planning.arrivalsHint")}
              value={figures.arrivals}
              step={1}
              onChange={(v, immediate) => setFigure("arrivals", v, immediate)}
              warning={warn("arrivals")}
            />
            <Stepper
              label={t("planning.occupiedTonight")}
              hint={t("planning.occupiedHint", { count: result?.stayovers ?? 0 })}
              value={figures.eveningOccupancy}
              step={1}
              onChange={(v, immediate) => setFigure("eveningOccupancy", v, immediate)}
              warning={warn("eveningOccupancy")}
            />
          </div>
        ) : (
          <p className="text-sm text-graphite/50">{t("planning.loadingDay")}</p>
        )}
      </section>

      {/* ---- 2 · The team --------------------------------------------------- */}
      <section className="mb-4 rounded-2xl border border-charcoal/10 bg-linen p-5 shadow-card">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-serif text-2xl">{t("planning.step2")}</h3>
          <div className="flex gap-1">
            <button
              onClick={selectAllAttendants}
              className="h-10 rounded-lg px-3 text-sm text-gold hover:bg-parchment"
            >
              {t("planning.all")}
            </button>
            <button onClick={selectNoAttendants} className="h-10 rounded-lg px-3 text-sm text-gold hover:bg-parchment">
              {t("planning.none")}
            </button>
          </div>
        </div>
        <p className="mb-3 text-sm text-graphite/60">{t("planning.selectedOfTotal", { on: onShift.size, total: attendants.length })}</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {attendants.map((a) => {
            const on = onShift.has(a.id);
            return (
              <button
                key={a.id}
                onClick={() => toggleAttendant(a.id)}
                aria-pressed={on}
                className={`h-14 rounded-xl border px-5 text-left transition ${
                  on ? "border-gold-line bg-parchment shadow-sm" : "border-charcoal/15 bg-white opacity-45"
                }`}
              >
                <div className="text-sm font-semibold">
                  {on ? "✓ " : ""}
                  {a.name}
                </div>
                <div className="text-xs text-graphite/60">{a.section ? t("planning.prefersSection", { section: a.section }) : t("planning.noPreference")}</div>
              </button>
            );
          })}
        </div>

        <h4 className="mb-2 font-serif text-xl">{t("planning.shiftLength")}</h4>
        <div className="flex flex-wrap gap-2">
          {SHIFT_PRESETS.map((p) => (
            <button
              key={p.minutes}
              onClick={() => selectCapacity(p.minutes)}
              className={`h-14 rounded-xl border px-5 text-sm transition ${
                capacity === p.minutes ? "border-gold-line bg-parchment font-semibold" : "border-charcoal/15 bg-white"
              }`}
            >
              <div>{p.label}</div>
              <div className="text-xs text-graphite/60">{p.detail}</div>
            </button>
          ))}
        </div>
      </section>

      {/* The panels above already recalculate themselves on every change; this
          stays as an explicit fallback for the very first proposal and for
          forcing a fresh read if the underlying board moved on. */}
      {!plan ? (
        <button
          onClick={() => createPlan()}
          disabled={busy || onShift.size === 0}
          className="mb-4 h-14 w-full rounded-xl bg-navy text-base font-semibold tracking-wide text-ivory transition hover:bg-navy-line disabled:opacity-40 sm:w-auto sm:px-12"
        >
          {busy ? t("planning.calculating") : t("planning.createProposal")}
        </button>
      ) : (
        <div className="mb-4 flex items-center gap-3">
          <button
            onClick={() => createPlan()}
            disabled={busy || onShift.size === 0}
            className="h-11 rounded-xl border border-charcoal/15 bg-white px-5 text-sm transition hover:border-gold-line disabled:opacity-40"
          >
            {t("planning.refreshFromBoard")}
          </button>
          {refreshing && (
            <span className="flex items-center gap-1.5 text-sm text-graphite/60">
              <span className="h-2 w-2 animate-pulse rounded-full bg-gold" /> {t("planning.updating")}
            </span>
          )}
        </div>
      )}
      {onShift.size === 0 && <p className="mb-4 text-sm text-gold-soft">{t("planning.selectAtLeastOne")}</p>}

      {error && (
        <div className="mb-4 rounded-xl border border-status-out-of-order/30 bg-status-out-of-order/10 p-4 text-sm text-status-out-of-order">
          {error}
        </div>
      )}
      {applied && (
        <div className="mb-4 rounded-xl border border-status-clean/30 bg-status-clean/10 p-4 text-status-clean">✓ {applied}</div>
      )}

      {plan && (
        <>
          <section
            className={`mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4 transition-opacity ${refreshing ? "opacity-60" : ""}`}
          >
            <Stat label={t("planning.roomsToClean")} value={String(plan.summary.totalRooms)} sub={t("planning.ofKeys", { count: result?.totalRooms ?? 0 })} />
            <Stat label={t("planning.totalWork")} value={fmt(plan.summary.totalMinutes)} sub={t("planning.departureCleans", { count: figures?.departures ?? 0 })} />
            <Stat
              label={t("planning.teamCapacity")}
              value={fmt(totalCapacity)}
              sub={t("planning.onXCapacity", { count: onShift.size, capacity: fmt(capacity) })}
              tone={coverage > 1 ? "warn" : "good"}
            />
            <Stat label={t("planning.spread")} value={t("planning.minutes", { count: spread })} tone={spread > 90 ? "warn" : "good"} />
          </section>

          {coverage > 1 && (
            <div className="mb-4 rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm text-gold-soft">
              {t("planning.coverageWarning", { minutes: fmt(plan.summary.totalMinutes - totalCapacity) })}
            </div>
          )}

          {/* The shading on room chips below means something — say what before
              the grid, not buried inside every card's collapsed explanation. */}
          <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-graphite/60">
            <span className="flex items-center gap-1.5">
              <span className="h-3.5 w-3.5 rounded border border-charcoal/30 bg-parchment" /> {t("planning.departureLegend")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3.5 w-3.5 rounded border border-charcoal/15 bg-white" /> {t("planning.stayoverLegend")}
            </span>
          </div>

          <div className={`mb-4 grid gap-3 transition-opacity lg:grid-cols-2 xl:grid-cols-3 ${refreshing ? "opacity-60" : ""}`}>
            {live.map((a) => (
              <AttendantCard
                key={a.attendantId}
                assignment={a}
                rooms={rooms}
                capacity={plan.summary.capacityMinutes}
                onMoveRoom={(roomId) => setMoving({ roomId, fromId: a.attendantId })}
              />
            ))}
          </div>

          <div className="sticky bottom-3 rounded-2xl border border-charcoal/10 bg-linen/95 p-4 shadow-lift backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-graphite/70">
                {edited ? t("planning.movedByHand") : ""}
                {t("planning.nothingSavedYet")}
              </p>
              <button
                onClick={apply}
                disabled={busy}
                className="h-14 rounded-xl bg-gold px-8 text-base font-semibold text-charcoal transition hover:brightness-95 disabled:opacity-40"
              >
                {busy ? t("planning.applying") : t("planning.applyPlan")}
              </button>
            </div>
          </div>
        </>
      )}

      {moving && plan && (
        <Modal
          title={t("planning.moveRoomTitle", { number: rooms[moving.roomId]?.number ?? "" })}
          subtitle={t("planning.moveRoomSubtitle")}
          onClose={() => setMoving(null)}
        >
          <div className="grid gap-2">
            {plan.assignments.map((a) => (
              <button
                key={a.attendantId}
                onClick={() => moveRoom(moving.roomId, moving.fromId, a.attendantId)}
                disabled={a.attendantId === moving.fromId}
                className="flex h-14 items-center justify-between rounded-xl border border-charcoal/15 px-4 text-left hover:border-gold-line disabled:opacity-40"
              >
                <span className="font-medium">{a.attendantName}</span>
                <span className="text-sm text-graphite/60">{t("planning.roomsAndMinutes", { count: a.roomCount, minutes: fmt(a.totalMinutes) })}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Big touch targets: a supervisor sets these standing at a desk with an iPad. */
function Stepper({
  label,
  hint,
  value,
  step,
  onChange,
  warning,
}: {
  label: string;
  hint: string;
  value: number;
  step: number;
  /** `immediate` marks a finished intent (a tap) versus in-progress typing. */
  onChange: (v: number, immediate: boolean) => void;
  warning?: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 transition-colors ${warning ? "border-gold/40 bg-gold/10" : "border-charcoal/15 bg-white"}`}>
      <div className="text-[0.7rem] uppercase tracking-[0.14em] text-graphite/55">{label}</div>
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => onChange(value - step, true)}
          aria-label={`${label} minus`}
          className="h-14 w-14 shrink-0 rounded-xl border border-charcoal/20 text-2xl leading-none hover:border-gold-line"
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0, false)}
          onBlur={(e) => onChange(Number(e.target.value) || 0, true)}
          aria-label={label}
          className="h-14 w-full min-w-0 rounded-xl border border-charcoal/15 bg-transparent text-center font-serif text-3xl outline-none focus:border-gold"
        />
        <button
          onClick={() => onChange(value + step, true)}
          aria-label={`${label} plus`}
          className="h-14 w-14 shrink-0 rounded-xl border border-charcoal/20 text-2xl leading-none hover:border-gold-line"
        >
          +
        </button>
      </div>
      <p className="mt-2 text-xs text-graphite/60">{hint}</p>
      {warning && <p className="mt-1 text-xs font-medium text-gold-soft">{warning}</p>}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "warn" }) {
  return (
    <div className="rounded-2xl border border-charcoal/10 bg-linen p-4 shadow-card">
      <div className="text-[0.7rem] uppercase tracking-[0.14em] text-graphite/55">{label}</div>
      <div
        className={`mt-1 font-serif text-3xl ${
          tone === "warn" ? "text-gold-soft" : tone === "good" ? "text-status-clean" : ""
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-graphite/55">{sub}</div>}
    </div>
  );
}

function AttendantCard({
  assignment,
  rooms,
  capacity,
  onMoveRoom,
}: {
  assignment: Assignment;
  rooms: Record<string, RoomDetail>;
  capacity: number;
  onMoveRoom: (roomId: string) => void;
}) {
  const { t } = useLocale();
  // The house is read floor by floor, so the plan is grouped that way too.
  const byFloor = useMemo(() => {
    const map = new Map<number, { id: string; detail: RoomDetail }[]>();
    for (const id of assignment.roomIds) {
      const detail = rooms[id];
      if (!detail) continue;
      if (!map.has(detail.floor)) map.set(detail.floor, []);
      map.get(detail.floor)!.push({ id, detail });
    }
    for (const list of map.values()) list.sort((a, b) => a.detail.number.localeCompare(b.detail.number));
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [assignment.roomIds, rooms]);

  const departures = assignment.roomIds.filter((id) => rooms[id]?.isDeparture).length;
  const pct = Math.min(100, Math.round(assignment.load * 100));

  return (
    <div className="rounded-2xl border border-charcoal/10 bg-linen p-4 shadow-card">
      <div className="flex items-baseline justify-between">
        <h4 className="font-serif text-2xl">{assignment.attendantName}</h4>
        <span className={`text-sm font-semibold ${assignment.overbooked ? "text-status-dirty" : "text-graphite/70"}`}>
          {fmt(assignment.totalMinutes)} / {fmt(capacity)}
        </span>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-parchment">
        <div
          className={`h-full rounded-full transition-all ${assignment.overbooked ? "bg-status-dirty" : "bg-gold"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="mt-2 text-xs text-graphite/60">
        {t("planning.roomsDeparturesSections", { count: assignment.roomCount, departures, sections: assignment.sections.join(", ") })}
      </p>

      <div className="mt-3 space-y-1.5">
        {byFloor.map(([floor, list], floorIdx) => (
          <Collapsible
            key={floor}
            defaultOpen={floorIdx === 0}
            summary={
              <div className="text-[0.7rem] uppercase tracking-[0.14em] text-graphite/50">
                {t("attendant.floor", { floor })} · {list.length}
              </div>
            }
          >
            <div className="flex flex-wrap gap-1.5">
              {list.map(({ id, detail }) => (
                <button
                  key={id}
                  onClick={() => onMoveRoom(id)}
                  title={`${detail.number} · ~${detail.minutes} min`}
                  className={`h-10 rounded-lg border px-2.5 text-sm font-medium tabular-nums hover:border-gold-line ${
                    detail.isDeparture ? "border-charcoal/30 bg-parchment" : "border-charcoal/15 bg-white"
                  }`}
                >
                  {detail.number}
                </button>
              ))}
            </div>
          </Collapsible>
        ))}
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-gold">{t("planning.whySplit")}</summary>
        <ul className="mt-2 space-y-1 rounded-lg border border-gold-line/40 bg-ivory p-3 text-xs text-graphite">
          {assignment.reasons.map((r, i) => (
            <li key={i}>· {r}</li>
          ))}
          <li>· {t("planning.shadedLegend")}</li>
        </ul>
      </details>
    </div>
  );
}
