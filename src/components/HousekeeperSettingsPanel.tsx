"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { AUTOPLAN_WEIGHTS } from "@/lib/autoplan/weights";
import { DEFAULT_SETTINGS } from "@/lib/domain";
import type { TKey } from "@/lib/i18n/translations";

interface Hk { id: string; name: string; hkType: string; hkLevel: number; homeFloors: string; dailyTarget: number | null; hkActive: boolean }
type SettingKey = "autoplanTolerance" | "autoplanMaxFloors" | "stayoverFactor" | "autoplanManyTraces" | "azubiCreditsMin" | "azubiCreditsMax" | "teilzeitCreditsMin" | "teilzeitCreditsMax" | "minutesPerCredit" | "earlyFinishMinutes" | "redistributionMaxMoves";
const SETTING_KEYS: SettingKey[] = ["autoplanTolerance", "autoplanMaxFloors", "stayoverFactor", "autoplanManyTraces", "azubiCreditsMin", "azubiCreditsMax", "teilzeitCreditsMin", "teilzeitCreditsMax", "minutesPerCredit", "earlyFinishMinutes", "redistributionMaxMoves"];
const WEIGHT_KEYS = Object.keys(AUTOPLAN_WEIGHTS) as (keyof typeof AUTOPLAN_WEIGHTS)[];

/** Einstellungen: Stammdaten der Housekeeper (Typ, Stufe, Stammetagen, Tagesziel) und Regeln/Gewichte des Zuteilungsvorschlags. Nur Supervisor/Duty Manager. */
export default function HousekeeperSettingsPanel() {
  const { t } = useLocale();
  const [hks, setHks] = useState<Hk[]>([]);
  const [settings, setSettings] = useState<Record<string, number>>({ ...DEFAULT_SETTINGS });
  const [weights, setWeights] = useState<Record<string, number>>({ ...AUTOPLAN_WEIGHTS });
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    api<{ housekeepers: Hk[] }>("/api/housekeepers").then((d) => setHks(d.housekeepers)).catch(() => {});
    api<{ settings: Record<string, number>; autoplanWeights: Record<string, number> }>("/api/settings").then((d) => { setSettings(d.settings); setWeights(d.autoplanWeights); }).catch(() => {});
  }, []);
  useEffect(load, [load]);
  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1500); };

  const patchHk = async (id: string, body: Record<string, unknown>) => { await api(`/api/housekeepers/${id}`, { method: "PATCH", body }).catch(() => {}); load(); flash(); };
  const patchSetting = async (body: Record<string, unknown>) => { await api("/api/settings", { method: "PATCH", body }).catch(() => {}); flash(); };

  const input = "h-10 rounded-lg border border-charcoal/20 bg-white px-2 text-sm outline-none focus:border-gold";
  return (
    <section className="mb-4 rounded-2xl border border-charcoal/10 bg-linen p-5 shadow-card">
      <h3 className="mb-1 font-serif text-2xl">{t("hk.title")}</h3>
      <p className="mb-4 max-w-2xl text-sm text-graphite/60">{t("hk.hint")}</p>
      {saved && <p className="mb-2 text-xs text-status-clean">{t("hk.saved")}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-graphite/60">
            <tr><th className="pr-3">{t("hk.colName")}</th><th className="pr-3">{t("hk.colType")}</th><th className="pr-3">{t("hk.colLevel")}</th>
              <th className="pr-3">{t("hk.colHome")}</th><th className="pr-3">{t("hk.colTarget")}</th><th>{t("hk.colActive")}</th></tr>
          </thead>
          <tbody>
            {hks.map((h) => (
              <tr key={h.id} className="border-t border-charcoal/5">
                <td className="py-2 pr-3 font-medium">{h.name}</td>
                <td className="pr-3">
                  <select className={input} value={h.hkType} onChange={(e) => patchHk(h.id, { hkType: e.target.value })}>
                    {(["VOLLZEIT", "TEILZEIT", "AZUBI"] as const).map((x) => <option key={x} value={x}>{t(`hk.${x}` as TKey)}</option>)}
                  </select>
                </td>
                <td className="pr-3">
                  <select className={input} value={h.hkLevel} title={t("hk.levelHint")} onChange={(e) => patchHk(h.id, { hkLevel: Number(e.target.value) })}>
                    {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </td>
                <td className="pr-3">
                  <input className={`${input} w-20`} defaultValue={h.homeFloors} placeholder={t("hk.homeHint")} title={t("hk.homeHint")} inputMode="numeric"
                    onBlur={(e) => { const f = e.target.value.split(",").map((x) => parseInt(x, 10)).filter((n) => n >= 1 && n <= 7).slice(0, 2); patchHk(h.id, { homeFloors: f }); }} />
                </td>
                <td className="pr-3">
                  <input className={`${input} w-20`} type="number" step="0.5" min={0} defaultValue={h.dailyTarget ?? ""}
                    onBlur={(e) => patchHk(h.id, { dailyTarget: e.target.value === "" ? null : Number(e.target.value) })} />
                </td>
                <td><input type="checkbox" className="h-5 w-5" checked={h.hkActive} onChange={(e) => patchHk(h.id, { hkActive: e.target.checked })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4 className="mb-2 mt-6 font-serif text-xl">{t("hk.rulesTitle")}</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        {SETTING_KEYS.map((k) => (
          <label key={k} className="flex items-center justify-between gap-3 rounded-xl border border-charcoal/15 bg-white p-3 text-sm">
            <span>{t(`hk.setting.${k}` as TKey)}</span>
            <input className={`${input} w-24 text-right`} type="number" step="0.1" value={settings[k] ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, [k]: Number(e.target.value) }))} onBlur={() => patchSetting({ [k]: settings[k] })} />
          </label>
        ))}
      </div>

      <h4 className="mb-1 mt-6 font-serif text-xl">{t("hk.weightsTitle")}</h4>
      <p className="mb-2 max-w-2xl text-xs text-graphite/60">{t("hk.weightsHint")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {WEIGHT_KEYS.map((k) => (
          <label key={k} className="flex items-center justify-between gap-3 rounded-xl border border-charcoal/15 bg-white p-3 text-sm">
            <span>{t(`hk.weight.${k}` as TKey)}</span>
            <input className={`${input} w-24 text-right`} type="number" min={0} value={weights[k] ?? ""}
              onChange={(e) => setWeights((w) => ({ ...w, [k]: Number(e.target.value) }))} onBlur={() => patchSetting({ autoplanWeights: { [k]: weights[k] } })} />
          </label>
        ))}
      </div>
    </section>
  );
}
