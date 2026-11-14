"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { errorText } from "@/lib/i18n/errorText";
import TwoTapButton from "@/components/TwoTapButton";
import { Banner, Button, Field, GlassCard, Pill, SectionLabel } from "@/components/ui";

interface RecurringView { id: string; roomNumber: string; floor: number; label: string; everyDays: number; startDate: string; active: boolean; lastCreatedOn: string | null }

/**
 * Betrieb L2 (Punkt 9): wiederkehrende Hausmann-Aufgaben anlegen und verwalten (Zimmer + Text + alle N Tage, ab Datum).
 * Daraus entsteht an jedem fälligen Tag eine feste Aufgabe auf der Hausmann-Liste (`src/lib/houseman/recurring.ts`).
 * Ein Baustein für Hausmann-Hub und Einstellungen (Supervisor/Duty Manager); Wege nur `/api/recurring-tasks`.
 */
export function RecurringTasksPanel() {
  const { t } = useLocale();
  const [tasks, setTasks] = useState<RecurringView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ roomNumber: "", label: "", everyDays: "2" });

  const load = useCallback(async () => {
    try {
      const d = await api<{ tasks?: RecurringView[] }>("/api/recurring-tasks");
      setTasks(Array.isArray(d?.tasks) ? d.tasks : []);
    } catch (e) {
      setError(errorText(e, t));
    }
  }, [t]);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try { await fn(); await load(); return true; } catch (e) { setError(errorText(e, t)); return false; } finally { setBusy(false); }
  };
  const every = Number(f.everyDays);
  const valid = f.roomNumber.trim() && f.label.trim() && Number.isInteger(every) && every >= 1 && every <= 60;

  return (
    <GlassCard as="section" aria-label={t("lists.recurringTitle")} className="flex flex-col gap-3">
      <SectionLabel as="h2" icon="calendar-days" title={t("lists.recurringTitle")} />
      <p className="text-label text-text-muted">{t("lists.recurringHint")}</p>
      {error && <div role="alert"><Banner tone="warning" icon="triangle-alert" title={error} /></div>}
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr_8rem_auto] sm:items-end">
        <Field label={t("frontOffice.roomNumber")} inputMode="numeric" value={f.roomNumber} onChange={(e) => setF({ ...f, roomNumber: e.target.value })} />
        <Field label={t("lists.recurringLabel")} maxLength={80} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
        <Field label={t("lists.recurringEveryDays")} type="number" min={1} max={60} value={f.everyDays} onChange={(e) => setF({ ...f, everyDays: e.target.value })} />
        <Button icon="check" disabled={!valid || busy} onClick={() => void run(async () => {
          await api("/api/recurring-tasks", { body: { roomNumber: f.roomNumber.trim(), label: f.label.trim(), everyDays: every } });
          setF({ roomNumber: "", label: "", everyDays: f.everyDays });
        })}>{t("lists.recurringAdd")}</Button>
      </div>
      {tasks && tasks.length === 0 && <p className="text-body-16 text-text-muted">{t("lists.recurringNone")}</p>}
      <ul className="flex flex-col divide-y divide-border-subtle">
        {(tasks ?? []).map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 py-2">
            <span className="text-number text-text-primary">{r.roomNumber}</span>
            <span className="text-body-16 min-w-0 flex-1 text-text-primary">{r.label}</span>
            <Pill tone={r.active ? "info" : "neutral"}>{t("lists.recurringEvery", { n: r.everyDays })}</Pill>
            {!r.active && <Pill tone="neutral">{t("lists.recurringPaused")}</Pill>}
            <TwoTapButton disabled={busy} onConfirm={() => void run(() => api(`/api/recurring-tasks/${r.id}`, { method: "PATCH", body: { active: !r.active } }))}>
              {r.active ? t("lists.recurringPause") : t("lists.recurringResume")}
            </TwoTapButton>
            <TwoTapButton disabled={busy} onConfirm={() => void run(() => api(`/api/recurring-tasks/${r.id}`, { method: "DELETE" }))}>{t("lists.recurringRemove")}</TwoTapButton>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
