"use client";

import { useLocale } from "@/lib/i18n/LocaleContext";
import { PLAN_PHASES, type PhaseState, type PlanCounts, type PlanPhase } from "@/lib/planung/team";
import type { IconName } from "@/lib/ui/icons";
import type { Tone } from "@/lib/ui/tone";
import { Banner, Button, ListRow, Pill, ProgressBar } from "@/components/ui";
import { Glyph } from "@/components/ui/primitives";

const PH_LABEL: Record<PlanPhase, "planungTool.phMerge" | "planungTool.phPropose" | "planungTool.phRooms" | "planungTool.phSupervisors" | "planungTool.phHouseman"> = {
  merge: "planungTool.phMerge", propose: "planungTool.phPropose", rooms: "planungTool.phRooms", supervisors: "planungTool.phSupervisors", houseman: "planungTool.phHouseman",
};

/** Zustand einer Statuszeile: Symbol + Ton + Zeichen (Status nie nur über Farbe). */
const PH_UI: Record<PhaseState, { icon: IconName; tone: Tone; mark: string }> = {
  waiting: { icon: "circle", tone: "neutral", mark: "" },
  running: { icon: "refresh", tone: "accent", mark: "…" },
  done: { icon: "check", tone: "success", mark: "✓" },
  error: { icon: "x", tone: "danger", mark: "✖" },
};

const FOCUS = "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-accent-default";

/**
 * Schritt „Plan" (Design „Glas & Premium“, Figma `34:1410`): Statusliste mit dem echten Fortschritt (jede Zeile wechselt
 * erst, wenn die Berechnung sie liefert), danach drei gefächerte Karten (Entwurf), Zusammenfassung mit Fortschrittsbalken,
 * Kräfte als Listenzeilen, Warnungen aus dem Vorschlag und der Hinweis „Nichts ist live". Reine Darstellung.
 */
export default function PlanStep({
  states, counts, warnings, error, started, summary, hkRows, onEdit, onToggleHk, onOpen, confirmed,
}: {
  states: Record<PlanPhase, PhaseState>; counts: PlanCounts | null; warnings: { severity: "WARNING" | "INFO"; message: string }[]; error: string | null; started: boolean;
  /** Entwurf: zugeteilt/offen/gesamt. */
  summary: { assigned: number; total: number; open: number } | null;
  /** Je Kraft: Zimmer/Credits/Zielband und ob sie bewusst nicht eingeplant ist. */
  hkRows: { id: string; name: string; rooms: number; credits: number; lo: number; hi: number; excluded: boolean }[];
  onEdit: () => void;
  onToggleHk: (id: string) => void;
  /** Karte, Kraft-Zeile oder „offen“ angetippt: öffnet die Detailansicht (Tab, Ansicht). */
  onOpen: (tab: "rooms" | "supervisors" | "houseman" | "overview", view?: "plan" | "list") => void;
  confirmed: { assigned: number; open: number } | null;
}) {
  const { t } = useLocale();
  const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");
  const cards = counts ? [
    { text: counts.roomLists === 1 ? t("planungTool.cardRoomsOne") : t("planungTool.cardRooms", { n: counts.roomLists }), rot: -4, tab: "rooms" as const },
    { text: counts.supervisorLists === 1 ? t("planungTool.cardSupervisorsOne") : t("planungTool.cardSupervisors", { n: counts.supervisorLists }), rot: 0, tab: "supervisors" as const },
    { text: counts.hausmannLists === 1 ? t("planungTool.cardHousemanOne") : t("planungTool.cardHouseman", { n: counts.hausmannLists }), rot: 4, tab: "houseman" as const },
  ] : [];
  return (
    <div className="mt-3">
      <p className="pl-rise text-body-16 mb-4 max-w-md text-text-secondary" style={{ ["--i" as string]: 1 }}>{t("planungTool.planIntro")}</p>
      {started && (
        <ul className="flex flex-col gap-2" aria-label={t("planungTool.progressLabel")}>
          {PLAN_PHASES.map((p) => {
            const s = states[p];
            const ui = PH_UI[s];
            return (
              <li key={p} data-state={s} role="status" className="glass flex min-h-12 items-center gap-3 rounded-(--glass-radius-sm) px-4 py-2">
                <span aria-hidden className="flex size-6 shrink-0 items-center justify-center">
                  {s === "running"
                    ? <span className="pl-spin inline-block size-5 rounded-full border-2 border-border-subtle border-t-accent-default" />
                    : <Glyph name={ui.icon} size={20} className={s === "done" ? "pl-pop text-status-success-fg" : s === "error" ? "text-status-danger-fg" : "text-text-muted"} />}
                </span>
                <span className={s === "waiting" ? "text-body-16 text-text-muted" : "text-body-18 text-text-primary"}>{t(PH_LABEL[p])}</span>
                {ui.mark && <Pill tone={ui.tone} className="ms-auto">{ui.mark}</Pill>}
              </li>
            );
          })}
        </ul>
      )}
      {error && <div role="alert" className="mt-3"><Banner tone="warning" icon="triangle-alert" title={t("planungTool.planFailed")} detail={error} /></div>}
      {counts && (
        <>
          <div className="relative mx-auto mt-6 h-36 max-w-md" role="list" aria-label={t("planungTool.draft")}>
            {cards.map((c, i) => (
              <div key={i} role="listitem" className="pl-fan absolute bottom-0 start-[34%] w-[32%]"
                style={{ ["--i" as string]: i, transform: `translateX(${(i - 1) * 104}%) translateY(${i === 1 ? 0 : 8}px) rotate(${c.rot}deg)`, zIndex: i === 1 ? 2 : 1 }}>
                <button type="button" onClick={() => onOpen(c.tab)} aria-label={`${c.text} — ${t("planungTool.openDetails")}`}
                  className={`glass press block min-h-12 w-full rounded-(--glass-radius-md) p-3 text-start ${FOCUS}`}>
                  <div className="text-body-18 leading-tight text-text-primary">{c.text}</div>
                  <Pill tone="accent" className="mt-2">{t("planungTool.draft")} ›</Pill>
                </button>
              </div>
            ))}
          </div>
          {summary && (
            <section className="glass mt-6 flex flex-col gap-3 rounded-(--glass-radius-lg) p-4 sm:p-5" aria-label={t("planungTool.draftSummary", { assigned: summary.assigned, total: summary.total })}>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-title-22 me-auto text-text-primary">{t("planungTool.draftSummary", { assigned: summary.assigned, total: summary.total })}</h2>
                {summary.open > 0 && (
                  <button type="button" onClick={() => onOpen("rooms", "plan")} className={`press inline-flex min-h-12 items-center rounded-pill ${FOCUS}`}>
                    <Pill tone="warning">⚠ {t("planungTool.openBadge", { n: summary.open })} ›</Pill>
                  </button>
                )}
                {confirmed && <Pill tone="success">✓ {t("planungTool.confirmedTitle")}</Pill>}
              </div>
              <ProgressBar value={summary.assigned} max={summary.total} label={t("planungTool.draftSummary", { assigned: summary.assigned, total: summary.total })} />
              <ul className="flex flex-col">
                {hkRows.map((h) => {
                  const meta = `${h.rooms} ${t("planungTool.roomsShort")} · ${fmt(h.credits)} / ${fmt(h.lo)}–${fmt(h.hi)}`;
                  return (
                    <li key={h.id} className="flex items-center gap-2">
                      {h.excluded
                        ? <ListRow icon="user" title={h.name} subtitle={t("planungTool.skippedNote")} state="done" className="min-w-0 flex-1" />
                        : <ListRow icon="user" title={`${h.name} ›`} meta={meta} onClick={() => onOpen("rooms", "list")} className="min-w-0 flex-1" />}
                      <button type="button" onClick={() => onToggleHk(h.id)} className={`press text-label min-h-12 shrink-0 rounded-pill px-3 text-accent-text underline-offset-2 hover:underline ${FOCUS}`}>
                        {h.excluded ? t("planungTool.unskipHk") : t("planungTool.skipHk")}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={onEdit}>{summary.open > 0 ? t("planungTool.openAssign") : t("planungTool.editDraft")}</Button>
                <Button variant="secondary" onClick={() => onOpen("overview")}>{t("service.title")}</Button>
              </div>
            </section>
          )}
          <section className="mt-5" aria-labelledby="plan-warn">
            <h2 id="plan-warn" className="text-section mb-2 text-text-muted">{t("planungTool.warningsTitle")}</h2>
            {warnings.length === 0 ? <p className="text-body-16 text-text-secondary">{t("planungTool.noWarnings")}</p> : (
              <ul className="text-body-16 flex flex-col gap-1">
                {warnings.map((w, i) => (
                  <li key={i} className={`flex items-start gap-2 ${w.severity === "INFO" ? "text-text-secondary" : "text-status-warning-fg"}`}>
                    <Glyph name={w.severity === "INFO" ? "info" : "triangle-alert"} size={20} className="mt-0.5 shrink-0" /> <span>{w.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {!confirmed && <Banner tone="accent" icon="info" title={t("planungTool.notLive")} className="mt-4" />}
        </>
      )}
    </div>
  );
}
