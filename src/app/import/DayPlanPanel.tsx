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
interface MergeResponse { issues: ParseIssue[]; counts: { stays: number; traces: number; roomTasks: number }; board?: { rooms: number; changedRooms: number; arrivalsCreated: number; notes: string[] } }

const TYPES: DayCleaningType[] = ["DEPARTURE", "SAME_DAY_TURN", "STAYOVER", "ARRIVAL"];
const ICON = { CRITICAL: "✖", WARNING: "⚠", INFO: "ℹ" } as const;
const TONE = { CRITICAL: "text-status-danger-fg", WARNING: "text-status-in-progress", INFO: "text-text-secondary" } as const;

/** Tagesplan aus den übernommenen Listen: berechnen (geht automatisch aufs Board) → prüfen. */
export default function DayPlanPanel({ date, refreshKey }: { date: string | null; refreshKey: string }) {
  const { t } = useLocale();
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [mergeInfo, setMergeInfo] = useState<MergeResponse | null>(null);
  const [busy, setBusy] = useState(false);
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
    const r = await api<MergeResponse>("/api/dayplan/merge", { body: {} });
    setMergeInfo(r);
    setApplied(r.board ? t("importPage.dpApplied", { rooms: r.board.rooms, changed: r.board.changedRooms, arrivals: r.board.arrivalsCreated }) + (r.board.notes.length ? " " + r.board.notes.join(" ") : "") : null);
    load();
  });

  const override = (room: string, cleaningType: DayCleaningType) => run(async () => {
    await api("/api/dayplan/override", { body: { date, room, cleaningType } }); load(); setApplied(null);
  });

  if (!date) return null;
  const tile = (label: string, v: number | undefined) => (
    <div className="rounded-(--glass-radius-md) border border-border-subtle bg-surface-card-raised px-4 py-2 text-center">
      <div className="text-title-28 text-text-primary leading-none">{v ?? "—"}</div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  );
  const issues = [...(mergeInfo?.issues ?? plan?.issues ?? [])];

  return (
    <section className="mt-4 rounded-(--glass-radius-lg) border border-border-subtle bg-surface-card-raised p-4">
      <h3 className="text-title-22 text-text-primary">{t("importPage.dpTitle")}</h3>
      <p className="mb-3 max-w-2xl text-xs text-text-muted">{t("importPage.dpHint")}</p>
      <button type="button" disabled={busy} onClick={compute}
        className="h-12 rounded-(--glass-radius-md) bg-champagne border border-border-accent px-6 text-sm font-medium text-text-on-accent disabled:opacity-40">
        {busy ? t("importPage.dpComputing") : t("importPage.dpCompute")}
      </button>
      {error && <p className="mt-2 text-sm text-status-danger-fg">{error}</p>}

      {plan && plan.rooms.length === 0 && !busy && <p className="mt-3 text-sm text-text-muted">{t("importPage.dpNone")}</p>}
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
          {mergeInfo && <p className="mt-2 text-xs text-text-muted">{t("importPage.dpMerged", { stays: mergeInfo.counts.stays, traces: mergeInfo.counts.traces, tasks: mergeInfo.counts.roomTasks })}</p>}
          {issues.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {issues.map((i, k) => <li key={k} className={TONE[i.severity]}>{ICON[i.severity]} {i.message}</li>)}
            </ul>
          )}

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead className="text-text-muted">
                <tr>
                  <th className="pe-3">{t("importPage.colRoom")}</th><th className="pe-3">{t("importPage.dpColType")}</th>
                  <th className="pe-3">{t("importPage.dpColLinen")}</th><th className="pe-3">{t("importPage.dpColEta")}</th>
                  <th className="pe-3">{t("importPage.dpColTraces")}</th><th>{t("importPage.dpColAssigned")}</th>
                </tr>
              </thead>
              <tbody>
                {plan.rooms.map((r) => (
                  <tr key={r.room} className="border-t border-border-subtle">
                    <td className="py-1 pe-3 font-medium">{r.room}{r.vip ? " ★" : ""}</td>
                    <td className="pe-3">
                      {(r.cleaningType as string) === "CARRYOVER" ? <span className="font-medium">{t("lists.kindCARRYOVER")}</span> : (
                      <select value={r.cleaningType} disabled={busy} onChange={(e) => override(r.room, e.target.value as DayCleaningType)}
                        className="h-10 rounded-(--glass-radius-sm) border border-border-subtle bg-surface-card-raised px-2">
                        {TYPES.map((ty) => <option key={ty} value={ty}>{t(`importPage.type${ty}` as "importPage.typeDEPARTURE")}</option>)}
                      </select>)}
                      {r.overridden && r.derivedType && (
                        <div className="text-[11px] text-accent-text">{t("importPage.dpOverridden", { type: t(`importPage.type${r.derivedType}` as "importPage.typeDEPARTURE") })}</div>
                      )}
                    </td>
                    <td className="pe-3">{r.laundryDue ? t("importPage.dpLinenDue") : ""}</td>
                    <td className="pe-3">{r.eta ?? ""}</td>
                    <td className="pe-3">{r.openTraces || ""}</td>
                    <td>{r.assigned ? "✓" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {applied && (
              <>
                <span className="text-sm text-status-success-fg">{applied}</span>
                <Link href="/floor-plan" className="text-sm font-medium text-accent-text hover:underline">{t("importPage.dpToPlanning")}</Link>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
