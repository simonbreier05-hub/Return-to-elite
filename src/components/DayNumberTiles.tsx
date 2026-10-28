"use client";

import { useLocale } from "@/lib/i18n/LocaleContext";
import type { DayNumbers } from "@/lib/dayplan/dayNumbers";

/**
 * Der Kachelsatz des Arbeitstags — nur aus `computeDayNumbers` (eine Quelle). Es gilt immer:
 * gereinigt ≤ zugeteilt ≤ zu reinigen ≤ belegt. Die Wäschewechsel-Kachel erscheint nur mit echter Datengrundlage.
 */
export default function DayNumberTiles({ numbers, onShowOpen, className = "" }: { numbers: DayNumbers; onShowOpen?: () => void; className?: string }) {
  const { t } = useLocale();
  const n = numbers;
  const reasons = [
    n.notCleaned.byReason.outOfOrder && t("dayNumbers.reasonOutOfOrder", { n: n.notCleaned.byReason.outOfOrder }),
    n.notCleaned.byReason.outOfService && t("dayNumbers.reasonOutOfService", { n: n.notCleaned.byReason.outOfService }),
    n.notCleaned.byReason.optOut && t("dayNumbers.reasonOptOut", { n: n.notCleaned.byReason.optOut }),
  ].filter(Boolean).join(", ");
  const tile = (label: string, value: string, tone = "") => (
    <div className="min-w-[7.5rem]">
      <div className="text-[0.7rem] uppercase tracking-[0.14em] text-graphite/55">{label}</div>
      <div className={`mt-1 font-serif text-2xl leading-tight sm:text-3xl ${tone}`}>{value}</div>
    </div>
  );
  return (
    <div className={`rounded-2xl border border-charcoal/10 bg-linen p-4 shadow-card ${className}`}>
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        {tile(t("dayNumbers.occupied"), t("dayNumbers.ofTotal", { n: n.occupied, total: n.inventory }))}
        {tile(t("dayNumbers.toClean"), String(n.toClean))}
        {tile(t("dayNumbers.assigned"), t("dayNumbers.xOfN", { x: n.assigned, n: n.toClean }), n.open > 0 ? "text-gold-soft" : "text-status-clean")}
        {tile(t("dayNumbers.cleaned"), t("dayNumbers.xOfN", { x: n.cleaned, n: n.toClean }))}
        <div className="min-w-[7.5rem]">
          <div className="text-[0.7rem] uppercase tracking-[0.14em] text-graphite/55">{t("dayNumbers.open")}</div>
          <div className={`mt-1 font-serif text-2xl leading-tight sm:text-3xl ${n.open > 0 ? "text-gold-soft" : "text-status-clean"}`}>{n.open}</div>
          {n.open > 0 && onShowOpen && <button type="button" onClick={onShowOpen} className="min-h-11 text-sm font-medium text-gold-soft underline underline-offset-2">{t("dayNumbers.showOpen")}</button>}
        </div>
        {n.doneUnassigned > 0 && tile(t("dayNumbers.doneUnassigned"), String(n.doneUnassigned))}
        {n.laundryDue && tile(t("dayNumbers.laundry"), String(n.laundryDue.count), "text-status-in-progress")}
        {n.arrivalChecks.total > 0 && tile(t("dayNumbers.arrivalChecks"), t("dayNumbers.xOfN", { x: n.arrivalChecks.released, n: n.arrivalChecks.total }),
          n.arrivalChecks.released < n.arrivalChecks.total ? "text-gold-soft" : "text-status-clean")}
      </div>
      {n.notCleaned.total > 0 && <p className="mt-2 text-sm text-graphite/75">{t("dayNumbers.notCleaned", { n: n.notCleaned.total, reasons })}</p>}
      {n.outsideTeam > 0 && <p role="status" className="mt-1 text-sm text-status-in-progress">{t("dayNumbers.outsideTeam", { n: n.outsideTeam })}</p>}
    </div>
  );
}
