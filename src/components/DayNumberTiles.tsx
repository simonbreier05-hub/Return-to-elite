"use client";

import { useLocale } from "@/lib/i18n/LocaleContext";
import type { DayNumbers } from "@/lib/dayplan/dayNumbers";
import type { DayTileKey } from "@/lib/dayplan/glanceDetails";

/**
 * Der Kachelsatz des Arbeitstags — nur aus `computeDayNumbers` (eine Quelle). Es gilt immer:
 * gereinigt ≤ zugeteilt ≤ zu reinigen ≤ belegt. Die Wäschewechsel-Kachel erscheint nur mit echter Datengrundlage.
 */
/** `compact`: kleiner und zurückgenommen — für die Hauszahlen als Orientierung unter den Etagenzahlen eines Supervisors. */
/** `onTile`: jede Zahl wird antippbar (Detailansicht der Startscreens, ≥ 44 px); ohne bleibt es die reine Anzeige. */
export default function DayNumberTiles({ numbers, onShowOpen, onTile, className = "", compact = false }: { numbers: DayNumbers; onShowOpen?: () => void; onTile?: (key: DayTileKey) => void; className?: string; compact?: boolean }) {
  const { t } = useLocale();
  const n = numbers;
  const reasons = [
    n.notCleaned.byReason.outOfOrder && t("dayNumbers.reasonOutOfOrder", { n: n.notCleaned.byReason.outOfOrder }),
    n.notCleaned.byReason.outOfService && t("dayNumbers.reasonOutOfService", { n: n.notCleaned.byReason.outOfService }),
    n.notCleaned.byReason.optOut && t("dayNumbers.reasonOptOut", { n: n.notCleaned.byReason.optOut }),
  ].filter(Boolean).join(", ");
  const valueSize = compact ? "text-lg leading-tight" : "text-2xl leading-tight sm:text-3xl";
  const width = compact ? "min-w-[5.5rem]" : "min-w-[7.5rem]";
  const tile = (label: string, value: string, tone = "", key?: DayTileKey) => {
    const inner = (
      <>
        <div className="text-[0.7rem] uppercase tracking-[0.14em] text-graphite/55">{label}</div>
        <div className={`mt-1 font-serif ${valueSize} ${tone}`}>{value}</div>
      </>
    );
    return onTile && key
      ? <button key={key} type="button" onClick={() => onTile(key)} className={`${width} min-h-11 rounded-lg text-left transition hover:bg-parchment focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold`}>{inner}</button>
      : <div key={label} className={width}>{inner}</div>;
  };
  return (
    <div className={`rounded-2xl border border-charcoal/10 ${compact ? "bg-white/60 p-3" : "bg-linen p-4 shadow-card"} ${className}`}>
      <div className={`flex flex-wrap items-start ${compact ? "gap-x-4 gap-y-2" : "gap-x-6 gap-y-3"}`}>
        {tile(t("dayNumbers.occupied"), t("dayNumbers.ofTotal", { n: n.occupied, total: n.inventory }), "", "occupied")}
        {tile(t("dayNumbers.toClean"), String(n.toClean), "", "toClean")}
        {tile(t("dayNumbers.assigned"), t("dayNumbers.xOfN", { x: n.assigned, n: n.toClean }), n.open > 0 ? "text-gold-soft" : "text-status-clean", "assigned")}
        {tile(t("dayNumbers.cleaned"), t("dayNumbers.xOfN", { x: n.cleaned, n: n.toClean }), "", "cleaned")}
        {onTile ? tile(t("dayNumbers.open"), String(n.open), n.open > 0 ? "text-gold-soft" : "text-status-clean", "open") : <div className={width}>
          <div className="text-[0.7rem] uppercase tracking-[0.14em] text-graphite/55">{t("dayNumbers.open")}</div>
          <div className={`mt-1 font-serif ${valueSize} ${n.open > 0 ? "text-gold-soft" : "text-status-clean"}`}>{n.open}</div>
          {n.open > 0 && onShowOpen && <button type="button" onClick={onShowOpen} className="min-h-11 text-sm font-medium text-gold-soft underline underline-offset-2">{t("dayNumbers.showOpen")}</button>}
        </div>}
        {n.doneUnassigned > 0 && tile(t("dayNumbers.doneUnassigned"), String(n.doneUnassigned), "", "cleaned")}
        {n.laundryDue && tile(t("dayNumbers.laundry"), String(n.laundryDue.count), "text-status-in-progress", "laundry")}
        {n.arrivalChecks.total > 0 && tile(t("dayNumbers.arrivalChecks"), t("dayNumbers.xOfN", { x: n.arrivalChecks.released, n: n.arrivalChecks.total }),
          n.arrivalChecks.released < n.arrivalChecks.total ? "text-gold-soft" : "text-status-clean", "arrivalChecks")}
      </div>
      {n.notCleaned.total > 0 && (onTile
        ? <button type="button" onClick={() => onTile("notCleaned")} className="mt-2 min-h-11 text-left text-sm text-graphite/75 underline-offset-2 hover:underline">{t("dayNumbers.notCleaned", { n: n.notCleaned.total, reasons })}</button>
        : <p className="mt-2 text-sm text-graphite/75">{t("dayNumbers.notCleaned", { n: n.notCleaned.total, reasons })}</p>)}
      {n.outsideTeam > 0 && <p role="status" className="mt-1 text-sm text-status-in-progress">{t("dayNumbers.outsideTeam", { n: n.outsideTeam })}</p>}
    </div>
  );
}
