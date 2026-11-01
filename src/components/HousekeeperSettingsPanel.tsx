"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { AUTOPLAN_WEIGHTS } from "@/lib/autoplan/weights";
import { DEFAULT_LINEN_CYCLE_DAYS, DEFAULT_SETTINGS, ROOM_TYPES } from "@/lib/domain";
import type { TKey } from "@/lib/i18n/translations";

interface Hk { id: string; name: string; hkType: string; hkLevel: number; homeFloors: string; dailyTarget: number | null; hkActive: boolean }
type SettingKey = "autoplanTolerance" | "autoplanMaxFloors" | "stayoverFactor" | "stayoverLaundryFactor" | "autoplanManyTraces" | "azubiCreditsMin" | "azubiCreditsMax" | "teilzeitCreditsMin" | "teilzeitCreditsMax" | "minutesPerCredit" | "earlyFinishMinutes" | "redistributionMaxMoves" | "statusRewindMinutes" | "roomsVz3Min" | "roomsVz3Max" | "roomsVz2Min" | "roomsVz2Max" | "roomsVz1Min" | "roomsVz1Max" | "roomsTz3Min" | "roomsTz3Max" | "roomsTz2Min" | "roomsTz2Max" | "roomsTz1Min" | "roomsTz1Max" | "floorSuggestWindow" | "floorSuggestMinDays" | "floorDemandingWarnShare" | "learnWindow" | "learnMinDays" | "learnExpireDays" | "learnStaffDropShare" | "workdataMinSamples" | "workdataRetentionDays" | "shiftMinutes";
const SETTING_KEYS: SettingKey[] = ["autoplanTolerance", "autoplanMaxFloors", "stayoverFactor", "stayoverLaundryFactor", "autoplanManyTraces", "azubiCreditsMin", "azubiCreditsMax", "teilzeitCreditsMin", "teilzeitCreditsMax", "minutesPerCredit", "earlyFinishMinutes", "redistributionMaxMoves", "statusRewindMinutes", "roomsVz3Min", "roomsVz3Max", "roomsVz2Min", "roomsVz2Max", "roomsVz1Min", "roomsVz1Max", "roomsTz3Min", "roomsTz3Max", "roomsTz2Min", "roomsTz2Max", "roomsTz1Min", "roomsTz1Max", "floorSuggestWindow", "floorSuggestMinDays", "floorDemandingWarnShare", "learnWindow", "learnMinDays", "learnExpireDays", "learnStaffDropShare", "workdataMinSamples", "workdataRetentionDays", "shiftMinutes"];
const WEIGHT_KEYS = Object.keys(AUTOPLAN_WEIGHTS) as (keyof typeof AUTOPLAN_WEIGHTS)[];

/** Einstellungen: Stammdaten der Housekeeper (Typ, Stufe, Stammetagen, Tagesziel) und Regeln/Gewichte des Zuteilungsvorschlags. Nur Supervisor/Duty Manager. */
export default function HousekeeperSettingsPanel() {
  const { t } = useLocale();
  const [hks, setHks] = useState<Hk[]>([]);
  const [settings, setSettings] = useState<Record<string, number>>({ ...DEFAULT_SETTINGS });
  const [weights, setWeights] = useState<Record<string, number>>({ ...AUTOPLAN_WEIGHTS });
  const [linenCycleDays, setLinenCycleDays] = useState<number>(DEFAULT_LINEN_CYCLE_DAYS);
  const [typeMap, setTypeMap] = useState<Record<string, string>>({});
  const [typeSeen, setTypeSeen] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    api<{ housekeepers: Hk[] }>("/api/housekeepers").then((d) => setHks(d.housekeepers)).catch(() => {});
    api<{ settings: Record<string, number>; autoplanWeights: Record<string, number>; planningCredits?: { linenCycleDays: number }; roomTypeMap?: Record<string, string>; roomTypeSeen?: Record<string, number> }>("/api/settings").then((d) => { setTypeMap(d.roomTypeMap ?? {}); setTypeSeen(d.roomTypeSeen ?? {}); setSettings(d.settings); setWeights(d.autoplanWeights); if (d.planningCredits) setLinenCycleDays(d.planningCredits.linenCycleDays); }).catch(() => {});
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
        <table className="w-full text-start text-sm">
          <thead className="text-xs text-graphite/60">
            <tr><th className="pe-3">{t("hk.colName")}</th><th className="pe-3">{t("hk.colType")}</th><th className="pe-3">{t("hk.colLevel")}</th>
              <th className="pe-3">{t("hk.colHome")}</th><th className="pe-3">{t("hk.colTarget")}</th><th>{t("hk.colActive")}</th></tr>
          </thead>
          <tbody>
            {hks.map((h) => (
              <tr key={h.id} className="border-t border-charcoal/5">
                <td className="py-2 pe-3 font-medium">{h.name}</td>
                <td className="pe-3">
                  <select className={input} value={h.hkType} onChange={(e) => patchHk(h.id, { hkType: e.target.value })}>
                    {(["VOLLZEIT", "TEILZEIT", "AZUBI"] as const).map((x) => <option key={x} value={x}>{t(`hk.${x}` as TKey)}</option>)}
                  </select>
                </td>
                <td className="pe-3">
                  <select className={input} value={h.hkLevel} title={t("hk.levelHint")} onChange={(e) => patchHk(h.id, { hkLevel: Number(e.target.value) })}>
                    {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </td>
                <td className="pe-3">
                  <input className={`${input} w-20`} defaultValue={h.homeFloors} placeholder={t("hk.homeHint")} title={t("hk.homeHint")} inputMode="numeric"
                    onBlur={(e) => { const f = e.target.value.split(",").map((x) => parseInt(x, 10)).filter((n) => n >= 1 && n <= 7).slice(0, 2); patchHk(h.id, { homeFloors: f }); }} />
                </td>
                <td className="pe-3">
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
            <input className={`${input} w-24 text-end`} type="number" step="0.1" value={settings[k] ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, [k]: Number(e.target.value) }))} onBlur={() => patchSetting({ [k]: settings[k] })} />
          </label>
        ))}
        <label className="flex items-center justify-between gap-3 rounded-xl border border-charcoal/15 bg-white p-3 text-sm">
          <span>{t("hk.setting.linenCycleDays")}</span>
          <input className={`${input} w-24 text-end`} type="number" step="1" min={1} max={30} value={linenCycleDays}
            onChange={(e) => setLinenCycleDays(Number(e.target.value))}
            onBlur={() => { if (Number.isInteger(linenCycleDays) && linenCycleDays >= 1 && linenCycleDays <= 30) void patchSetting({ linenCycleDays }); }} />
        </label>
      </div>

      <h4 className="mb-1 mt-6 font-serif text-xl">{t("hk.roomTypesTitle")}</h4>
      <p className="mb-2 max-w-2xl text-xs text-graphite/60">{t("hk.roomTypesHint")}</p>
      {Object.keys({ ...typeSeen, ...typeMap }).length === 0 ? <p className="text-sm text-graphite/60">{t("hk.roomTypesNone")}</p> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.keys({ ...typeSeen, ...typeMap }).sort().map((code) => (
            <label key={code} className="flex items-center justify-between gap-3 rounded-xl border border-charcoal/15 bg-white p-3 text-sm">
              <span><span className="font-medium">{code}</span>{typeSeen[code] ? <span className="ms-2 text-xs text-graphite/60">{t("hk.roomTypesRooms", { n: typeSeen[code] })}</span> : null}</span>
              <select className={`${input} w-44`} value={typeMap[code] ?? ""}
                onChange={async (e) => { const next = { ...typeMap, [code]: e.target.value }; if (!e.target.value) delete next[code]; setTypeMap(next); await patchSetting({ roomTypeMap: next }); load(); }}>
                <option value="">{t("hk.roomTypesUnmapped")}</option>
                {ROOM_TYPES.filter((x) => x !== "UNVERIFIED").map((x) => <option key={x} value={x}>{t(`roomType.${x}` as TKey)}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}

      <h4 className="mb-1 mt-6 font-serif text-xl">{t("hk.weightsTitle")}</h4>
      <p className="mb-2 max-w-2xl text-xs text-graphite/60">{t("hk.weightsHint")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {WEIGHT_KEYS.map((k) => (
          <label key={k} className="flex items-center justify-between gap-3 rounded-xl border border-charcoal/15 bg-white p-3 text-sm">
            <span>{t(`hk.weight.${k}` as TKey)}</span>
            <input className={`${input} w-24 text-end`} type="number" min={0} value={weights[k] ?? ""}
              onChange={(e) => setWeights((w) => ({ ...w, [k]: Number(e.target.value) }))} onBlur={() => patchSetting({ autoplanWeights: { [k]: weights[k] } })} />
          </label>
        ))}
      </div>
    </section>
  );
}
