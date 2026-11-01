"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import { CATEGORIES, hm, type Category, type PersonStats } from "@/lib/workdata/stats";

interface Resp {
  people: { id: string; name: string }[];
  usePlanning: boolean;
  since?: string;
  minSamples?: number;
  defaults?: Record<Category, number>;
  stats?: PersonStats;
}

/**
 * Arbeitsdaten (H3): eine Person auswählen → Durchschnitt/Median je Reinigungsart, Zimmer pro Tag, Datenmenge.
 * Bewusst keine Liste aller Personen nebeneinander (kein Ranking, kein Vergleich). Werte dienen nur der Planung.
 */
export default function WorkDataView() {
  const { t } = useLocale();
  const [data, setData] = useState<Resp | null>(null);
  const [person, setPerson] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Resp>(`/api/workdata${person ? `?userId=${encodeURIComponent(person)}` : ""}`).then(setData).catch((e) => setError(e instanceof Error ? e.message : "?"));
  }, [person]);
  const toggle = async (on: boolean) => {
    await api("/api/workdata", { method: "PATCH", body: { usePlanning: on } }).catch(() => {});
    setData((d) => (d ? { ...d, usePlanning: on } : d));
  };
  const s = data?.stats;
  return (
    <section className="rounded-2xl border border-charcoal/10 bg-linen p-5 shadow-card">
      <h2 className="mb-1 font-serif text-3xl">{t("workdata.title")}</h2>
      <p className="mb-4 max-w-2xl text-sm text-graphite/70">{t("workdata.hint")}</p>
      {error && <p role="alert" className="mb-2 text-sm text-status-out-of-order">{error}</p>}
      {data && (
        <>
          <label className="mb-4 flex min-h-11 items-center gap-3 text-sm font-medium">
            <input type="checkbox" className="h-5 w-5" checked={data.usePlanning} onChange={(e) => void toggle(e.target.checked)} />
            {t("workdata.usePlanning")}
          </label>
          <label className="mb-4 block text-sm">
            <span className="mb-1 block font-medium">{t("workdata.person")}</span>
            <select value={person} onChange={(e) => setPerson(e.target.value)} className="h-11 w-full max-w-sm rounded-lg border border-charcoal/20 bg-white px-2">
              <option value="">{t("workdata.choose")}</option>
              {data.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          {s && (
            <div>
              <p className="mb-3 text-sm text-graphite/80">{t("workdata.basis", { n: s.samples, days: s.days, since: data.since ?? "" })}</p>
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-charcoal/10 bg-white p-3"><div className="text-xs text-graphite/60">{t("workdata.roomsPerDay")}</div><div className="font-serif text-2xl">{s.roomsPerDay.toString().replace(".", ",")}</div></div>
                <div className="rounded-xl border border-charcoal/10 bg-white p-3"><div className="text-xs text-graphite/60">{t("workdata.workPerDay")}</div><div className="font-serif text-2xl">{s.days ? `${hm(s.workMinutesPerDay)} h` : "—"}</div></div>
                <div className="rounded-xl border border-charcoal/10 bg-white p-3"><div className="text-xs text-graphite/60">{t("workdata.trend")}</div><div className="font-serif text-2xl">{s.trendPct === null ? t("workdata.tooLittle") : `${s.trendPct > 0 ? "+" : ""}${s.trendPct} %`}</div></div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[22rem] text-start text-sm">
                  <thead className="text-xs text-graphite/60"><tr><th className="py-1 pe-3">{t("workdata.colKind")}</th><th className="pe-3">{t("workdata.colMean")}</th><th className="pe-3">{t("workdata.colMedian")}</th><th>{t("workdata.colN")}</th></tr></thead>
                  <tbody>
                    {CATEGORIES.map((c) => {
                      const x = s.byCategory[c];
                      return (
                        <tr key={c} className="border-t border-charcoal/5">
                          <td className="py-2 pe-3 font-medium">{t(`workdata.cat_${c}` as TKey)}</td>
                          <td className="pe-3">{x.enough ? `${x.mean} min` : "—"}</td>
                          <td className="pe-3">{x.enough ? `${x.median} min` : <span className="text-graphite/70">{t("workdata.tooLittleUsing", { min: Math.round(data.defaults?.[c] ?? 0) })}</span>}</td>
                          <td>{x.n}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-xs text-graphite/60 sm:hidden">{t("frontOffice.swipeHint")}</p>
            </div>
          )}
          <p className="mt-4 text-xs text-graphite/60">{t("workdata.privacy")}</p>
        </>
      )}
    </section>
  );
}
