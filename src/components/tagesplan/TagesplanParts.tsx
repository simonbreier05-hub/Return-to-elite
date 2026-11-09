"use client";

import type { ReactNode } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import {
  CLEAN_KIND_UI, HINT_UI, LOAD_UI, PLAN_STATE_UI, mixEntries,
  type CleanKind, type CrewSummary, type FloorLaneData, type KindMix, type LoadState, type PlanHint, type PlanRoom, type PlanState,
} from "@/lib/ui/tagesplan";
import { CONFIRM_BY } from "@/lib/ui/tagesplanConfig";
import { Glyph, Pill } from "@/components/ui";
import { cx, FOCUS_RING, TONE_FG } from "@/components/ui/primitives";

/** Füllung je Art im Last-Balken (Token, keine harten Farben). Bedeutung steht zusätzlich als Zähler mit Symbol + Wort daneben. */
const KIND_FILL: Record<CleanKind, string> = {
  turn: "bg-accent-default",
  linen: "bg-status-info-fg",
  tidy: "bg-status-success-fg",
  deep: "bg-status-warning-fg",
  arrival: "bg-text-muted",
};

const num1 = (fmt: ReturnType<typeof useLocale>["fmt"], n: number) => fmt.number(n, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Status mit Symbol + Wort (nie nur Farbe). */
export function LoadBadge({ state, compact }: { state: LoadState; compact?: boolean }) {
  const { t } = useLocale();
  const ui = LOAD_UI[state];
  return (
    <span className={cx("text-label inline-flex items-center gap-1 whitespace-nowrap", TONE_FG[ui.tone])}>
      <Glyph name={ui.icon} size={16} />
      <span className={compact ? "sr-only sm:not-sr-only" : undefined}>{t(ui.labelKey)}</span>
    </span>
  );
}

// ── Tageskopf ─────────────────────────────────────────────────────────────

export interface DayStat { key: string; icon: Parameters<typeof Glyph>[0]["name"]; label: string; value: string }

export function DayHeader({
  dateText, state, live, release, stats, actions,
}: {
  dateText: string;
  state: PlanState;
  live: { done: number; total: number };
  release: number;
  stats: DayStat[];
  actions?: ReactNode;
}) {
  const { t } = useLocale();
  const ui = PLAN_STATE_UI[state];
  return (
    <header className="glass flex flex-col gap-3 rounded-(--glass-radius-lg) px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-title-22 text-text-primary">{dateText}</h2>
        <Pill tone={ui.tone}><Glyph name={ui.icon} size={16} className="me-1.5" />{t(ui.labelKey)}</Pill>
        {state !== "confirmed" && state !== "live" && (
          <span className="text-label inline-flex items-center gap-1 text-text-secondary"><Glyph name="clock" size={16} />{t("tagesplan.confirmBy", { time: CONFIRM_BY })}</span>
        )}
        <span className="ms-auto flex flex-wrap gap-2">
          {/* Plan-1: nur Anzeige — die Chips öffnen erst mit Plan-2 etwas. */}
          <span className="text-label inline-flex h-12 items-center gap-1.5 rounded-pill border border-pill-neutral-border bg-pill-neutral-bg px-4 text-text-primary" aria-label={t("tagesplan.liveChipLabel", { done: live.done, total: live.total })}>
            <Glyph name="play" size={16} />{t("tagesplan.liveChip", { done: live.done, total: live.total })}
          </span>
          <span className="text-label inline-flex h-12 items-center gap-1.5 rounded-pill border border-pill-neutral-border bg-pill-neutral-bg px-4 text-text-primary" aria-label={t("tagesplan.releaseChipLabel", { n: release })}>
            <Glyph name="check" size={16} />{t("tagesplan.releaseChip", { n: release })}
          </span>
          {actions}
        </span>
      </div>
      <dl className="flex flex-wrap gap-x-5 gap-y-1">
        {stats.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <Glyph name={s.icon} size={16} className="text-text-secondary" />
            <dt className="text-label text-text-secondary">{s.label}</dt>
            <dd className="text-body-16 text-text-primary">{s.value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}

// ── Kraft-Chip und Team-Leiste ────────────────────────────────────────────

export function CrewChip({
  name, rooms, credits, state, selected, assigning, onClick, compact,
}: {
  name: string; rooms: number; credits: number; state: LoadState; selected?: boolean; assigning?: boolean; onClick: () => void; compact?: boolean;
}) {
  const { t, fmt } = useLocale();
  const label = [name, t("tagesplan.roomsN", { n: rooms }), `${num1(fmt, credits)} ${t("planning.floorPlanCreditsShort")}`, t(LOAD_UI[state].labelKey), assigning ? t("tagesplan.assigningTo", { name }) : null].filter(Boolean).join(", ");
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!selected}
      aria-label={label}
      className={cx(
        "press glass flex min-h-12 shrink-0 items-center gap-2 rounded-pill px-4 text-start",
        selected && "glass-selected",
        assigning && "outline-2 outline-solid outline-accent-default",
        FOCUS_RING,
      )}
    >
      <span className={cx("text-body-16 truncate text-text-primary", compact ? "max-w-28" : "max-w-40")}>{name}</span>
      <span className="text-label whitespace-nowrap text-text-secondary">{rooms} · {num1(fmt, credits)}</span>
      <LoadBadge state={state} compact={compact} />
    </button>
  );
}

export function TeamBar({
  crew, selectedId, assigningId, available, onSelect,
}: {
  crew: CrewSummary[];
  selectedId: string | null;
  assigningId: string | null;
  available: { id: string; name: string }[];
  onSelect: (id: string) => void;
}) {
  const { t } = useLocale();
  const working = crew.filter((c) => c.rooms > 0);
  return (
    <section aria-labelledby="tp-team-title" className="flex flex-col gap-2">
      <h2 id="tp-team-title" className="text-label text-text-secondary">{t("tagesplan.teamTitle", { n: working.length })}</h2>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {working.map((c) => (
          <CrewChip key={c.id} name={c.name} rooms={c.rooms} credits={c.credits} state={c.state} selected={c.id === selectedId} assigning={c.id === assigningId} onClick={() => onSelect(c.id)} />
        ))}
        <div role="group" aria-label={t("tagesplan.available")} className="flex shrink-0 items-center gap-2 rounded-pill border border-dashed border-border-default ps-4 pe-1">
          <span className="text-label whitespace-nowrap text-text-secondary">{t("tagesplan.available")} ({available.length})</span>
          {available.length === 0 ? <span className="text-label pe-3 text-text-muted">–</span> : available.map((a) => (
            <button key={a.id} type="button" onClick={() => onSelect(a.id)} aria-pressed={a.id === selectedId}
              className={cx("press text-label min-h-12 rounded-pill px-3 text-text-primary", a.id === selectedId && "glass-selected", FOCUS_RING)}>
              {a.name}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Etagen-Zeile ──────────────────────────────────────────────────────────

function LoadBar({ mix, total, label }: { mix: KindMix; total: number; label: string }) {
  const entries = mixEntries(mix);
  return (
    <div role="img" aria-label={label} className="flex h-3 w-full overflow-hidden rounded-pill bg-surface-progress-track">
      {total > 0 && entries.map((e) => <span key={e.kind} className={cx("h-full", KIND_FILL[e.kind])} style={{ width: `${(e.count / total) * 100}%` }} />)}
    </div>
  );
}

export function KindCounters({ mix, short }: { mix: KindMix; short?: boolean }) {
  const { t } = useLocale();
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5">
      {mixEntries(mix).map((e) => (
        <span key={e.kind} className="text-label inline-flex items-center gap-1 text-text-secondary">
          <Glyph name={CLEAN_KIND_UI[e.kind].icon} size={14} className={TONE_FG[CLEAN_KIND_UI[e.kind].tone]} />
          {e.count} {t(short ? CLEAN_KIND_UI[e.kind].shortKey : CLEAN_KIND_UI[e.kind].labelKey)}
        </span>
      ))}
    </span>
  );
}

const MAX_LANE_CHIPS = 3;

/**
 * Eine Zeile je Etage. Zugeklappt höchstens 5 Informationen: Etage · Last-Balken mit Zählern · Kraft-Chips · Ø je Kraft mit
 * Status · „N offen“. Aufgeklappt (immer nur eine Zeile) kommt der Inhalt (Grundriss + Zimmer je Kraft) als `children`.
 */
export function FloorLane({
  lane, open, onToggle, selectedId, onSelectCrew, children,
}: {
  lane: FloorLaneData;
  open: boolean;
  onToggle: () => void;
  selectedId: string | null;
  onSelectCrew: (id: string) => void;
  children?: ReactNode;
}) {
  const { t, fmt } = useLocale();
  const floor = lane.floor!;
  const bodyId = `tp-lane-${floor}-body`;
  const extra = Math.max(0, lane.crew.length - MAX_LANE_CHIPS);
  const barLabel = [t("board.floor", { n: floor }), ...mixEntries(lane.mix).map((e) => `${e.count} ${t(CLEAN_KIND_UI[e.kind].labelKey)}`)].join(", ");
  return (
    <section id={`tp-lane-${floor}`} className={cx("glass flex flex-col rounded-(--glass-radius-md)", open && "glass-selected")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3 [@media(max-height:700px)]:py-2 sm:px-4">
        <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={bodyId}
          className={cx("press flex min-h-12 min-w-0 flex-1 basis-64 items-center gap-3 rounded-(--glass-radius-sm) text-start", FOCUS_RING)}>
          <Glyph name="chevron-down" size={20} className={cx("text-text-secondary transition-transform", open && "rotate-180")} />
          <span className="text-title-22 w-8 text-center text-text-primary" aria-label={t("board.floor", { n: floor })}>{floor}</span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <LoadBar mix={lane.mix} total={lane.total} label={barLabel} />
            <KindCounters mix={lane.mix} short />
          </span>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {lane.crew.slice(0, MAX_LANE_CHIPS).map((c) => (
            <button key={c.id} type="button" onClick={() => onSelectCrew(c.id)} aria-pressed={c.id === selectedId}
              aria-label={`${c.name}, ${t("tagesplan.roomsN", { n: c.rooms })}, ${num1(fmt, c.credits)} ${t("planning.floorPlanCreditsShort")}`}
              className={cx("press text-label inline-flex min-h-12 items-center gap-1.5 rounded-pill border border-border-subtle px-3 text-text-primary", c.id === selectedId && "glass-selected", FOCUS_RING)}>
              <span className="max-w-24 truncate">{c.name}</span>
              <span className="text-text-secondary">{num1(fmt, c.credits)}</span>
            </button>
          ))}
          {extra > 0 && <span className="text-label text-text-secondary">+{extra}</span>}
        </div>
        <span className="flex items-center gap-3">
          {lane.avgCredits != null && (
            <span className="text-label inline-flex items-center gap-2 text-text-secondary">
              {t("tagesplan.avgPerCrew", { n: num1(fmt, lane.avgCredits) })}
              {lane.state && <LoadBadge state={lane.state} compact />}
            </span>
          )}
          {lane.open > 0 && <Pill tone="accent">{t("tagesplan.openN", { n: lane.open })}</Pill>}
        </span>
      </div>
      {open && <div id={bodyId} className="flex flex-col gap-4 border-t border-border-subtle px-3 py-4 sm:px-4">{children}</div>}
    </section>
  );
}

/** Zimmer einer Gruppe als antippbare Nummern (→ `openRoom`). */
export function RoomChips({ rooms, onOpen }: { rooms: PlanRoom[]; onOpen: (id: string) => void }) {
  const { t } = useLocale();
  return (
    <ul className="flex flex-wrap gap-2">
      {rooms.map((r) => (
        <li key={r.id}>
          <button type="button" onClick={() => onOpen(r.id)} aria-label={t("tagesplan.openRoom", { number: r.number, kind: t(CLEAN_KIND_UI[r.kind].labelKey) })}
            className={cx("press text-label inline-flex min-h-12 min-w-12 items-center justify-center gap-1 rounded-(--glass-radius-sm) border px-3 text-text-primary", r.open ? "border-accent-default" : "border-border-subtle", FOCUS_RING)}>
            <Glyph name={CLEAN_KIND_UI[r.kind].icon} size={14} className={TONE_FG[CLEAN_KIND_UI[r.kind].tone]} />
            {r.number}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── Kraft-Detail ──────────────────────────────────────────────────────────

export function CrewDetailBody({
  crew, rooms, hints, kindLabel, onOpenRoom, onHint,
}: {
  crew: CrewSummary;
  rooms: PlanRoom[];
  hints: PlanHint[];
  kindLabel: string;
  onOpenRoom: (id: string) => void;
  onHint: (h: PlanHint) => void;
}) {
  const { t, fmt } = useLocale();
  const mine = rooms.filter((r) => r.assignedToId === crew.id);
  const floors = [...new Set(mine.map((r) => r.floor))].sort((a, b) => (a ?? 99) - (b ?? 99));
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <LoadBadge state={crew.state} />
        <span className="text-label text-text-secondary">{kindLabel} · {t("tagesplan.bandRooms", { lo: crew.band.lo, hi: crew.band.hi })}</span>
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <div className="glass-fill rounded-(--glass-radius-sm) p-3"><dt className="text-label text-text-secondary">{t("tagesplan.rooms")}</dt><dd className="text-title-28 text-text-primary">{crew.rooms}</dd></div>
        <div className="glass-fill rounded-(--glass-radius-sm) p-3"><dt className="text-label text-text-secondary">{t("tagesplan.credits")}</dt><dd className="text-title-28 text-text-primary">{num1(fmt, crew.credits)}</dd></div>
      </dl>
      <section aria-labelledby="tp-detail-mix" className="flex flex-col gap-2">
        <h3 id="tp-detail-mix" className="text-label text-text-secondary">{t("tagesplan.mixTitle")}</h3>
        {crew.rooms ? <KindCounters mix={crew.mix} /> : <p className="text-body-16 text-text-muted">{t("tagesplan.noRooms")}</p>}
      </section>
      {hints.length > 0 && (
        <section aria-labelledby="tp-detail-hints" className="flex flex-col gap-2">
          <h3 id="tp-detail-hints" className="text-label text-text-secondary">{t("tagesplan.warnings")}</h3>
          {hints.map((h, i) => <HintRow key={i} hint={h} onClick={() => onHint(h)} />)}
        </section>
      )}
      {floors.map((f) => (
        <section key={String(f)} className="flex flex-col gap-2">
          <h3 className="text-label text-text-secondary">
            {f == null ? t("tagesplan.noFloor") : t("board.floor", { n: f })}
            {f != null && crew.byFloor[f] ? ` · ${t("tagesplan.roomsN", { n: crew.byFloor[f].rooms })} · ${num1(fmt, crew.byFloor[f].credits)} ${t("planning.floorPlanCreditsShort")}` : ""}
          </h3>
          <RoomChips rooms={mine.filter((r) => r.floor === f)} onOpen={onOpenRoom} />
        </section>
      ))}
    </div>
  );
}

export function hintText(t: ReturnType<typeof useLocale>["t"], h: PlanHint): string {
  switch (h.kind) {
    case "overload": return t("tagesplan.hintOverload", { name: h.name ?? "", n: h.count ?? 0 });
    case "floors": return t("tagesplan.hintFloors", { name: h.name ?? "", list: (h.floors ?? []).join(", ") });
    case "level": return t("tagesplan.hintLevel", { name: h.name ?? "" });
    case "unassigned": return t("tagesplan.hintUnassigned", { n: h.count ?? 0, list: (h.floors ?? []).join(", ") });
  }
}

export function HintRow({ hint, onClick }: { hint: PlanHint; onClick: () => void }) {
  const { t } = useLocale();
  const ui = HINT_UI[hint.kind];
  return (
    <button type="button" onClick={onClick}
      className={cx("press glass flex min-h-12 w-full items-center gap-3 rounded-(--glass-radius-sm) px-4 py-2 text-start", FOCUS_RING)}>
      <Glyph name={ui.icon} size={20} className={TONE_FG[ui.tone]} />
      <span className="text-body-16 min-w-0 flex-1 text-text-primary">{hintText(t, hint)}</span>
      <Glyph name="chevron-right" size={18} className="text-text-secondary rtl:-scale-x-100" />
    </button>
  );
}
