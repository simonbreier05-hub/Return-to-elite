"use client";

import { useEffect, useId, useState } from "react";
import { api } from "@/components/api";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { errorText } from "@/lib/i18n/errorText";
import type { TKey } from "@/lib/i18n/translations";
import { CATEGORIES, hm, type Category, type PersonStats } from "@/lib/workdata/stats";
import { Banner, GlassCard, SectionLabel } from "@/components/ui";
import { cx, FOCUS_RING } from "@/components/ui/primitives";

interface Resp {
  people: { id: string; name: string }[];
  usePlanning: boolean;
  since?: string;
  minSamples?: number;
  defaults?: Record<Category, number>;
  stats?: PersonStats;
}

const SELECT = "text-body-16 w-full max-w-sm min-h-(--size-touch-min) rounded-(--glass-radius-md) border border-border-subtle bg-surface-progress-track px-4 py-3 text-text-primary";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-(--glass-radius-md) bg-surface-card-raised p-4">
      <span className="text-label text-text-muted">{label}</span>
      <span className="text-title-28 text-text-primary">{value}</span>
    </div>
  );
}

/**
 * Arbeitsdaten (H3): eine Person auswählen → Durchschnitt/Median je Reinigungsart, Zimmer pro Tag, Datenmenge.
 * Bewusst keine Liste aller Personen nebeneinander (kein Ranking, kein Vergleich). Werte dienen nur der Planung.
 * Simon-Feedback 19.11.2026: im Design der App („Glas & Premium“).
 */
export default function WorkDataView() {
  const { t } = useLocale();
  const selectId = useId();
  const [data, setData] = useState<Resp | null>(null);
  const [person, setPerson] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Resp>(`/api/workdata${person ? `?userId=${encodeURIComponent(person)}` : ""}`).then(setData).catch((e) => setError(errorText(e, t)));
  }, [person, t]);
  const toggle = async (on: boolean) => {
    await api("/api/workdata", { method: "PATCH", body: { usePlanning: on } }).catch(() => {});
    setData((d) => (d ? { ...d, usePlanning: on } : d));
  };
  const s = data?.stats;
  return (
    <div className="theme-glass flex flex-col gap-4 sm:gap-6" data-testid="workdata">
      <GlassCard as="section" aria-label={t("workdata.title")} className="flex flex-col gap-4">
        <SectionLabel as="h2" icon="chart" title={t("workdata.title")} />
        <p className="text-body-16 max-w-2xl text-text-muted">{t("workdata.hint")}</p>
        {error && <Banner tone="warning" title={error} />}
        {data && (
          <>
            <label className={cx("text-body-16 flex min-h-(--size-touch-min) items-center gap-3 text-text-primary", FOCUS_RING)}>
              <input type="checkbox" className="size-5 accent-[var(--color-accent-text)]" checked={data.usePlanning} onChange={(e) => void toggle(e.target.checked)} />
              {t("workdata.usePlanning")}
            </label>
            <div className="flex flex-col gap-2">
              <label htmlFor={selectId} className="text-label text-text-muted">{t("workdata.person")}</label>
              <select id={selectId} value={person} onChange={(e) => setPerson(e.target.value)} className={cx(SELECT, FOCUS_RING)}>
                <option value="">{t("workdata.choose")}</option>
                {data.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </>
        )}
      </GlassCard>

      {data && s && (
        <GlassCard as="section" aria-label={t("workdata.title")} className="flex flex-col gap-4">
          <p className="text-body-16 text-text-secondary">{t("workdata.basis", { n: s.samples, days: s.days, since: data.since ?? "" })}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label={t("workdata.roomsPerDay")} value={s.roomsPerDay.toString().replace(".", ",")} />
            <Stat label={t("workdata.workPerDay")} value={s.days ? `${hm(s.workMinutesPerDay)} h` : "—"} />
            <Stat label={t("workdata.trend")} value={s.trendPct === null ? t("workdata.tooLittle") : `${s.trendPct > 0 ? "+" : ""}${s.trendPct} %`} />
          </div>
          <div className="overflow-x-auto">
            <table className="text-body-16 w-full min-w-[22rem] text-start">
              <thead className="text-label text-text-muted">
                <tr><th className="py-2 pe-3 text-start">{t("workdata.colKind")}</th><th className="pe-3 text-start">{t("workdata.colMean")}</th><th className="pe-3 text-start">{t("workdata.colMedian")}</th><th className="text-start">{t("workdata.colN")}</th></tr>
              </thead>
              <tbody>
                {CATEGORIES.map((c) => {
                  const x = s.byCategory[c];
                  return (
                    <tr key={c} className="border-t border-border-subtle text-text-primary">
                      <td className="py-3 pe-3">{t(`workdata.cat_${c}` as TKey)}</td>
                      <td className="pe-3">{x.enough ? `${x.mean} min` : "—"}</td>
                      <td className="pe-3">{x.enough ? `${x.median} min` : <span className="text-text-muted">{t("workdata.tooLittleUsing", { min: Math.round(data.defaults?.[c] ?? 0) })}</span>}</td>
                      <td>{x.n}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-label text-text-muted sm:hidden">{t("frontOffice.swipeHint")}</p>
        </GlassCard>
      )}
      {data && <p className="text-label text-text-muted">{t("workdata.privacy")}</p>}
    </div>
  );
}
