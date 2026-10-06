"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/components/api";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { DayCleaningType } from "@/lib/dayplan/derive";
import type { ParseIssue } from "@/lib/import/types";

interface PlanRow {
  room: string; cleaningType: DayCleaningType; derivedType: DayCleaningType | null; overridden: boolean;
  laundryDue: boolean; nights: number | null; vip: boolean; eta: string | null; assigned: boolean; openTraces: number;
}
interface Figures { departures: number; arrivals: number; stayovers: number; eveningOccupancy: number; cleaningCount: number }
interface PlanResponse { date: string | null; rooms: PlanRow[]; figures: Figures | null; issues: ParseIssue[] }
interface MergeResponse { issues: ParseIssue[]; counts: { stays: number; traces: number; roomTasks: number } }

const TYPES: DayCleaningType[] = ["DEPARTURE", "SAME_DAY_TURN", "STAYOVER", "ARRIVAL"];
const ICON = { CRITICAL: "✖", WARNING: "⚠", INFO: "ℹ" } as const;
const TONE = { CRITICAL: "text-status-out-of-order", WARNING: "text-status-in-progress", INFO: "text-graphite/70" } as const;

/** Tagesplan aus den übernommenen Listen: berechnen → prüfen → auf das Board übernehmen. */
export default function DayPlanPanel({ date, refreshKey }: { date: string | null; refreshKey: string }) {
  const { t } = useLocale();
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [mergeInfo, setMergeInfo] = useState<MergeResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!date) return;
    api<PlanResponse>(`/api/dayplan?date=${date}`).then(setPlan).catch(() => {});
  }, [date]);
  useEffect(() => { setMergeInfo(null); setApplied(null); load(); }, [load, refreshKey]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "?"); } finally { setBusy(false); }
  };
  const compute = () => run(async () => {
    setMergeInfo(await api<MergeResponse>("/api/dayplan/merge", { body: { date } }));
    setApplied(null); load();
  });
  const apply = () => run(async () => {
    const r = await api<{ rooms: number; changedRooms: number; arrivalsCreated: number; notes: string[] }>("/api/dayplan/apply", { body: { date } });
    setApplied(t("importPage.dpApplied", { rooms: r.rooms, changed: r.changedRooms, arrivals: r.arrivalsCreated }) + (r.notes.length ? " " + r.notes.join(" ") : ""));
    setConfirm(false);
  });
  const override = (room: string, cleaningType: DayCleaningType) => run(async () => {
    await api("/api/dayplan/override", { body: { date, room, cleaningType } }); load(); setApplied(null);
  });

  if (!date) return null;
  const tile = (label: string, v: number | undefined) => (
    <div className="rounded-xl border border-charcoal/10 bg-white px-4 py-2 text-center">
      <div className="font-serif text-3xl leading-none">{v ?? "—"}</div>
      <div className="text-xs text-graphite/60">{label}</div>
    </div>
  );
  const issues = [...(mergeInfo?.issues ?? plan?.issues ?? [])];

  return (
    <section className="mt-4 rounded-2xl border border-charcoal/10 bg-linen p-4 shadow-card">
      <h3 className="font-serif text-2xl">{t("importPage.dpTitle")}</h3>
      <p className="mb-3 max-w-2xl text-xs text-graphite/60">{t("importPage.dpHint")}</p>
      <button type="button" disabled={busy} onClick={compute}
        className="h-12 rounded-xl bg-navy px-6 text-sm font-medium text-white hover:bg-navy-line disabled:opacity-40">
        {busy ? t("importPage.dpComputing") : t("importPage.dpCompute")}
      </button>
      {error && <p className="mt-2 text-sm text-status-out-of-order">{error}</p>}

      {plan && plan.rooms.length === 0 && !busy && <p className="mt-3 text-sm text-graphite/60">{t("importPage.dpNone")}</p>}
      {plan && plan.figures && plan.rooms.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-sm font-medium">{t("importPage.dpFor", { date: plan.date! })}</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {tile(t("importPage.dpDepartures"), plan.figures.departures)}
            {tile(t("importPage.dpArrivals"), plan.figures.arrivals)}
            {tile(t("importPage.dpStayovers"), plan.figures.stayovers)}
            {tile(t("importPage.dpEvening"), plan.figures.eveningOccupancy)}
            {tile(t("importPage.dpToClean"), plan.figures.cleaningCount)}
          </div>
          {mergeInfo && <p className="mt-2 text-xs text-graphite/60">{t("importPage.dpMerged", { stays: mergeInfo.counts.stays, traces: mergeInfo.counts.traces, tasks: mergeInfo.counts.roomTasks })}</p>}
          {issues.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {issues.map((i, k) => <li key={k} className={TONE[i.severity]}>{ICON[i.severity]} {i.message}</li>)}
            </ul>
          )}

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-graphite/60">
                <tr>
                  <th className="pr-3">{t("importPage.colRoom")}</th><th className="pr-3">{t("importPage.dpColType")}</th>
                  <th className="pr-3">{t("importPage.dpColLinen")}</th><th className="pr-3">{t("importPage.dpColEta")}</th>
                  <th className="pr-3">{t("importPage.dpColTraces")}</th><th>{t("importPage.dpColAssigned")}</th>
                </tr>
              </thead>
              <tbody>
                {plan.rooms.map((r) => (
                  <tr key={r.room} className="border-t border-charcoal/5">
                    <td className="py-1 pr-3 font-medium">{r.room}{r.vip ? " ★" : ""}</td>
                    <td className="pr-3">
                      <select value={r.cleaningType} disabled={busy} onChange={(e) => override(r.room, e.target.value as DayCleaningType)}
                        className="h-10 rounded-lg border border-charcoal/20 bg-white px-2">
                        {TYPES.map((ty) => <option key={ty} value={ty}>{t(`importPage.type${ty}` as "importPage.typeDEPARTURE")}</option>)}
                      </select>
                      {r.overridden && r.derivedType && (
                        <div className="text-[11px] text-gold-soft">{t("importPage.dpOverridden", { type: t(`importPage.type${r.derivedType}` as "importPage.typeDEPARTURE") })}</div>
                      )}
                    </td>
                    <td className="pr-3">{r.laundryDue ? t("importPage.dpLinenDue") : ""}</td>
                    <td className="pr-3">{r.eta ?? ""}</td>
                    <td className="pr-3">{r.openTraces || ""}</td>
                    <td>{r.assigned ? "✓" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!confirm ? (
              <button type="button" disabled={busy} onClick={() => setConfirm(true)}
                className="h-12 rounded-xl bg-navy px-6 text-sm font-medium text-white hover:bg-navy-line disabled:opacity-40">{t("importPage.dpApply")}</button>
            ) : (
              <>
                <button type="button" disabled={busy} onClick={apply}
                  className="h-12 rounded-xl bg-gold-soft px-6 text-sm font-medium text-white disabled:opacity-40">{t("importPage.dpApplyConfirm")}</button>
                <button type="button" onClick={() => setConfirm(false)}
                  className="h-12 rounded-xl border border-charcoal/15 bg-white px-5 text-sm">{t("common.cancel")}</button>
              </>
            )}
            {applied && (
              <>
                <span className="text-sm text-status-clean">{applied}</span>
                <Link href="/supervisor/planning" className="text-sm font-medium text-gold-soft hover:underline">{t("importPage.dpToPlanning")}</Link>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
