"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Overlay } from "@/components/shell/Overlay";
import { GlassIconButton } from "@/components/shell/GlassIconButton";
import { Banner, Button, ListRow, ProgressBar } from "@/components/ui";
import { FOCUS_RING, Glyph } from "@/components/ui/primitives";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { PlanResult } from "@/lib/autoplan/types";
import type { ConfirmOutcome } from "./usePlanungFlow";

const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");

/**
 * „Plan prüfen und bestätigen“ (Glas-Fenster, D4): Zusammenfassung (zugeteilt/offen, Credits je Kraft, Warnungen).
 * Offene Zimmer und begonnene Zimmer verhindern die Bestätigung nicht, müssen aber ausdrücklich bestätigt werden.
 */
export default function PlanConfirmDialog({
  view, names, confirming, onConfirm, onClose,
}: {
  view: PlanResult;
  names: Record<string, string>;
  confirming: boolean;
  onConfirm: (opts: { acceptOpen?: boolean; confirmStarted?: boolean; housemanAssignments?: { traceId: string; userId: string | null }[] }) => Promise<ConfirmOutcome>;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const id = useId();
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
    <Overlay placement="center" onClose={onClose} labelledBy={`${id}-title`} className="w-full max-w-[560px]">
      <div className="glass flex max-h-[calc(100dvh-2rem)] flex-col gap-4 overflow-y-auto rounded-(--glass-radius-lg) p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <h2 id={`${id}-title`} className="text-title-28 min-w-0 flex-1 text-text-primary">{done ? t("planungTool.confirmedTitle") : t("planungTool.confirmTitle")}</h2>
          <GlassIconButton icon="x" label={t("common.close")} onClick={onClose} />
        </div>
        {done ? (
          <>
            <Banner tone="accent" icon="check" title={t("planungTool.confirmedBody", { assigned: done.assigned, open: done.open })} detail={t("planungTool.confirmedNotified")} />
            <Link href="/floor-plan" className={`press text-body-18 inline-flex min-h-(--size-button-height) items-center justify-center gap-3 rounded-(--glass-radius-md) border border-border-accent bg-champagne px-8 text-text-on-accent ${FOCUS_RING}`}>
              {t("planungTool.toAssignment")}
            </Link>
          </>
        ) : (
          <>
            <p className="text-body-18 text-text-primary">{t("planning.floorPlanAssignedOf", { assigned: total - open, total })}</p>
            <ProgressBar value={total - open} max={total} label={t("planning.floorPlanAssignedOf", { assigned: total - open, total })} />
            <ul className="flex flex-col">
              {view.metrics.filter((m) => names[m.hkId]).map((m) => {
                const off = m.credits > m.hi + 0.25 || (m.rooms > 0 && m.credits < m.lo - 0.25);
                return (
                  <li key={m.hkId}>
                    <ListRow icon="user" title={names[m.hkId]} meta={`${m.rooms} ${t("planungTool.roomsShort")} · ${fmt(m.credits)} / ${fmt(m.lo)}–${fmt(m.hi)}`}
                      pill={off ? { tone: "warning", label: "⚠" } : undefined} />
                  </li>
                );
              })}
            </ul>
            {view.warnings.length > 0 && (
              <ul className="text-body-16 flex flex-col gap-1">
                {view.warnings.map((w, i) => (
                  <li key={i} className={`flex items-start gap-2 ${w.severity === "WARNING" ? "text-status-warning-fg" : "text-text-secondary"}`}>
                    <Glyph name={w.severity === "WARNING" ? "triangle-alert" : "info"} size={20} className="mt-0.5 shrink-0" /><span>{w.message}</span>
                  </li>
                ))}
              </ul>
            )}
            {open > 0 && <div role="alert"><Banner tone="warning" title={t("planungTool.openAsk", { n: open })} /></div>}
            {startedAsk && <div role="alert"><Banner tone="warning" title={t("planungTool.startedAsk", { n: startedAsk.length, rooms: startedAsk.join(", ") })} /></div>}
            {error && <p role="alert" className="text-body-16 text-status-danger-fg"><span aria-hidden>✖ </span>{error}</p>}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <Button variant="secondary" icon="x" onClick={onClose}>{t("common.cancel")}</Button>
              <Button icon="check" disabled={confirming} onClick={() => void go(!!startedAsk)}>
                {startedAsk ? t("planungTool.startedConfirm") : open > 0 ? t("planungTool.confirmAnyway") : t("planungTool.confirmNow")}
              </Button>
            </div>
          </>
        )}
      </div>
    </Overlay>
  );
}
