"use client";

import { useState } from "react";
import Link from "next/link";
import Modal from "@/components/Modal";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { PlanResult } from "@/lib/autoplan/types";
import type { ConfirmOutcome } from "./usePlanungFlow";

const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");

/**
 * „Plan prüfen und bestätigen“: Zusammenfassung (zugeteilt/offen, Credits je Kraft, Warnungen).
 * Offene Zimmer und begonnene Zimmer verhindern die Bestätigung nicht, müssen aber ausdrücklich bestätigt werden.
 */
export default function PlanConfirmDialog({
  view, names, confirming, onConfirm, onClose,
}: {
  view: PlanResult;
  names: Record<string, string>;
  confirming: boolean;
  onConfirm: (opts: { acceptOpen?: boolean; confirmStarted?: boolean }) => Promise<ConfirmOutcome>;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const total = Object.keys(view.assignment).length;
  const open = view.unassigned.length;
  const [startedAsk, setStartedAsk] = useState<string[] | null>(null);
  const [done, setDone] = useState<{ assigned: number; open: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = async (confirmStarted = false) => {
    setError(null);
    const r = await onConfirm({ acceptOpen: open > 0, confirmStarted });
    if (r.ok) setDone({ assigned: r.assigned, open: r.open });
    else if (r.code === "STARTED_ROOMS") setStartedAsk(r.rooms ?? []);
    else setError(r.message);
  };

  return (
    <Modal title={done ? t("planungTool.confirmedTitle") : t("planungTool.confirmTitle")} onClose={onClose}>
      {done ? (
        <div className="text-sm">
          <p className="mb-3 font-medium text-status-clean">✓ {t("planungTool.confirmedBody", { assigned: done.assigned, open: done.open })}</p>
          <p className="mb-4 text-graphite/70">{t("planungTool.confirmedNotified")}</p>
          <Link href="/floor-plan" className="inline-flex h-12 items-center rounded-xl bg-navy px-6 text-sm font-medium text-white hover:bg-navy-line">{t("planungTool.toAssignment")}</Link>
        </div>
      ) : (
        <div className="text-sm">
          <p className="mb-2 font-serif text-xl">{t("planning.floorPlanAssignedOf", { assigned: total - open, total })}</p>
          <ul className="mb-3 space-y-1">
            {view.metrics.filter((m) => names[m.hkId]).map((m) => (
              <li key={m.hkId} className="flex justify-between gap-3 border-b border-charcoal/5 py-1">
                <span>{names[m.hkId]}</span>
                <span className={m.credits > m.hi + 0.25 || (m.rooms > 0 && m.credits < m.lo - 0.25) ? "font-medium text-status-in-progress" : "text-graphite/70"}>
                  {m.rooms} {t("planungTool.roomsShort")} · {fmt(m.credits)} / {fmt(m.lo)}–{fmt(m.hi)}
                </span>
              </li>
            ))}
          </ul>
          {view.warnings.length > 0 && (
            <ul className="mb-3 space-y-1 rounded-xl border border-charcoal/10 bg-white p-3">
              {view.warnings.map((w, i) => <li key={i} className={w.severity === "WARNING" ? "text-status-in-progress" : "text-graphite/70"}>{w.severity === "WARNING" ? "⚠" : "ℹ"} {w.message}</li>)}
            </ul>
          )}
          {open > 0 && <p role="alert" className="mb-3 rounded-xl border border-status-in-progress/40 bg-status-in-progress/10 p-3 font-medium">{t("planungTool.openAsk", { n: open })}</p>}
          {startedAsk && <p role="alert" className="mb-3 rounded-xl border border-status-in-progress/40 bg-status-in-progress/10 p-3 font-medium">{t("planungTool.startedAsk", { n: startedAsk.length, rooms: startedAsk.join(", ") })}</p>}
          {error && <p role="alert" className="mb-3 text-status-out-of-order">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={confirming} onClick={() => void go(!!startedAsk)} className="h-12 rounded-xl bg-navy px-6 text-sm font-medium text-white hover:bg-navy-line disabled:opacity-40">
              {startedAsk ? t("planungTool.startedConfirm") : open > 0 ? t("planungTool.confirmAnyway") : t("planungTool.confirmNow")}
            </button>
            <button type="button" onClick={onClose} className="h-12 rounded-xl border border-charcoal/15 bg-white px-5 text-sm">{t("common.cancel")}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
