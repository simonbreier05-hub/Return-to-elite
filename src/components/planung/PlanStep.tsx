"use client";

import { useLocale } from "@/lib/i18n/LocaleContext";
import { PLAN_PHASES, type PhaseState, type PlanCounts, type PlanPhase } from "@/lib/planung/team";

const PH_LABEL: Record<PlanPhase, "planungTool.phMerge" | "planungTool.phPropose" | "planungTool.phRooms" | "planungTool.phSupervisors" | "planungTool.phHouseman"> = {
  merge: "planungTool.phMerge", propose: "planungTool.phPropose", rooms: "planungTool.phRooms", supervisors: "planungTool.phSupervisors", houseman: "planungTool.phHouseman",
};

/**
 * Schritt „Plan": Statusliste mit dem echten Fortschritt (jede Zeile wechselt erst, wenn die Berechnung sie liefert),
 * danach drei gefächerte Karten (Entwurf), Warnungen aus dem Vorschlag und der Hinweis „Nichts ist live".
 */
export default function PlanStep({
  states, counts, warnings, error, started,
}: { states: Record<PlanPhase, PhaseState>; counts: PlanCounts | null; warnings: { severity: "WARNING" | "INFO"; message: string }[]; error: string | null; started: boolean }) {
  const { t } = useLocale();
  const cards = counts ? [
    { text: counts.roomLists === 1 ? t("planungTool.cardRoomsOne") : t("planungTool.cardRooms", { n: counts.roomLists }), rot: -4 },
    { text: counts.supervisorLists === 1 ? t("planungTool.cardSupervisorsOne") : t("planungTool.cardSupervisors", { n: counts.supervisorLists }), rot: 0 },
    { text: counts.hausmannLists === 1 ? t("planungTool.cardHousemanOne") : t("planungTool.cardHouseman", { n: counts.hausmannLists }), rot: 4 },
  ] : [];
  return (
    <div className="mt-3">
      <p className="pl-rise mb-4 max-w-md text-[15px] text-pl-muted" style={{ ["--i" as string]: 1 }}>{t("planungTool.planIntro")}</p>
      {started && (
        <ul className="space-y-1.5" aria-label={t("planungTool.progressLabel")}>
          {PLAN_PHASES.map((p) => {
            const s = states[p];
            return (
              <li key={p} data-state={s} className="flex min-h-11 items-center gap-3 rounded-full border border-line-1 bg-night-600 px-4 text-sm" role="status">
                <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center">
                  {s === "running" && <span className="pl-spin inline-block h-4 w-4 rounded-full border-2 border-line-2 border-t-brass-light" />}
                  {s === "done" && <svg key="d" className="pl-pop h-5 w-5 text-brass-ink" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5l4 4 8-9" /></svg>}
                  {s === "error" && <span className="text-badge-3">✖</span>}
                  {s === "waiting" && <span className="inline-block h-2 w-2 rounded-full bg-line-2" />}
                </span>
                <span className={s === "waiting" ? "text-pl-muted" : "font-medium"}>{t(PH_LABEL[p])}</span>
                <span className="ml-auto text-xs text-pl-muted">{s === "done" ? "✓" : s === "running" ? "…" : s === "error" ? "✖" : ""}</span>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p role="alert" className="mt-3 rounded-[14px] border border-line-2 bg-night-600 p-3 text-sm"><span aria-hidden>✖ </span>{t("planungTool.planFailed")} {error}</p>}
      {counts && (
        <>
          <div className="relative mx-auto mt-6 h-32 max-w-md" role="list" aria-label={t("planungTool.draft")}>
            {cards.map((c, i) => (
              <div key={i} role="listitem" className="pl-fan absolute bottom-0 left-[34%] w-[32%] rounded-[18px] border border-line-2 bg-night-600 p-3 shadow-lg"
                style={{ ["--i" as string]: i, transform: `translateX(${(i - 1) * 104}%) translateY(${i === 1 ? 0 : 8}px) rotate(${c.rot}deg)`, zIndex: i === 1 ? 2 : 1 }}>
                <div className="font-serif text-base font-semibold leading-tight">{c.text}</div>
                <div className="mt-1.5 inline-block rounded-full border border-line-2 px-2 text-[11px] text-pl-muted">{t("planungTool.draft")}</div>
              </div>
            ))}
          </div>
          <section className="mt-5" aria-labelledby="plan-warn">
            <h2 id="plan-warn" className="mb-1.5 text-xs font-medium uppercase tracking-[2px] text-pl-muted">{t("planungTool.warningsTitle")}</h2>
            {warnings.length === 0 ? <p className="text-sm text-pl-muted">{t("planungTool.noWarnings")}</p> : (
              <ul className="space-y-1 text-sm">{warnings.map((w, i) => <li key={i} className={w.severity === "INFO" ? "text-pl-muted" : "text-brass-ink"}><span aria-hidden>{w.severity === "INFO" ? "ℹ" : "⚠"}</span> {w.message}</li>)}</ul>
            )}
          </section>
          <p className="mt-4 rounded-[14px] border border-line-2 bg-night-600 p-3 text-sm font-medium">{t("planungTool.notLive")}</p>
        </>
      )}
    </div>
  );
}
