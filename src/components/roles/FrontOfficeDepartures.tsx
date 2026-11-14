"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import TwoTapButton from "@/components/TwoTapButton";
import { Banner, Field, GlassCard, Pill, SectionLabel } from "@/components/ui";
import { kindPill } from "@/lib/ui/hkHub";

export interface DepartureView {
  roomId: string;
  number: string;
  floor: number;
  status: string;
  kind: "DEPARTURE" | "SAME_DAY_TURN";
  /** Nur „Anrede Titel Nachname“. */
  guest: string | null;
  checkedOut: boolean;
  lateCheckout: string | null;
  lateCheckoutManual: boolean;
}

/**
 * Betrieb L2 (Punkt 3): „Abreisen heute“ im Front-Office-Hub — Abreise als ausgecheckt melden (zweiter Tipp speichert,
 * meldet Housekeeperin + Supervisor/DM) und Late Check-out von Hand setzen/zurücknehmen. Reine Darstellung; Wege in
 * `app/front-office/view.tsx` (`POST /api/rooms/[id]/checkout`, `PATCH /api/rooms/[id]/late-checkout`).
 */
export function FrontOfficeDepartures({ rows, busyId, error, onCheckout, onLateCheckout }: {
  rows: DepartureView[];
  busyId: string | null;
  error: string | null;
  onCheckout: (roomId: string) => void;
  onLateCheckout: (roomId: string, time: string | null) => void;
}) {
  const { t } = useLocale();
  const [times, setTimes] = useState<Record<string, string>>({});
  if (!rows.length) return null;
  const open = rows.filter((r) => !r.checkedOut).length;
  return (
    <GlassCard as="section" aria-label={t("frontOffice.departuresTitle", { open, total: rows.length })} className="flex flex-col gap-3">
      <SectionLabel as="h2" icon="log-out" title={t("frontOffice.departuresTitle", { open, total: rows.length })} />
      {error && <div role="alert"><Banner tone="warning" icon="triangle-alert" title={error} /></div>}
      <ul className="flex flex-col divide-y divide-border-subtle">
        {rows.map((r) => {
          const pill = kindPill(r.kind);
          const busy = busyId === r.roomId;
          const time = times[r.roomId] ?? r.lateCheckout ?? "";
          return (
            <li key={r.roomId} className="flex flex-col gap-2 py-3" data-room={r.number}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-number text-text-primary">{r.number}</span>
                <span className="text-body-16 min-w-0 flex-1 truncate text-text-primary">{r.guest ?? t("roleHub.unknown")}</span>
                {pill && <Pill tone={pill.tone} edge={pill.edge}>{t(pill.labelKey)}</Pill>}
                {r.lateCheckout && <Pill tone="warning">{t("lists.lateCheckout", { time: r.lateCheckout })}</Pill>}
                {r.checkedOut ? <Pill tone="success">✓ {t("lists.checkedOut")}</Pill> : <Pill tone="neutral">{t(`status.${r.status}` as TKey)}</Pill>}
              </div>
              {!r.checkedOut && (
                <div className="flex flex-wrap items-end gap-3">
                  <TwoTapButton disabled={busy} onConfirm={() => onCheckout(r.roomId)}>{t("roomEdit.checkedOut")}</TwoTapButton>
                  <div className="w-36">
                    <Field label={t("frontOffice.lateCheckoutField")} type="time" value={time} onChange={(e) => setTimes((m) => ({ ...m, [r.roomId]: e.target.value }))} />
                  </div>
                  <TwoTapButton disabled={busy || !time || time === r.lateCheckout} onConfirm={() => onLateCheckout(r.roomId, time)}>{t("frontOffice.lateCheckoutSave")}</TwoTapButton>
                  {r.lateCheckoutManual && <TwoTapButton disabled={busy} onConfirm={() => { setTimes((m) => ({ ...m, [r.roomId]: "" })); onLateCheckout(r.roomId, null); }}>{t("frontOffice.lateCheckoutClear")}</TwoTapButton>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}
