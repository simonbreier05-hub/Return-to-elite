"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/components/api";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";

interface Thresholds {
  blockedRecheckMinutes: number;
  welfareCheckMinutes: number;
  etaWarningMinutes: number;
  releaseQueueBacklogThreshold: number;
  roomsPerAttendantMin: number;
  roomsPerAttendantMax: number;
  attendantPoolMax: number;
}

type Weights = Record<string, number>;

interface SettingsResponse {
  settings: Thresholds;
  weights: Weights;
  weightDefaults: Weights;
}

/** Plain-language labels — nobody should have to read the source to tune this. */
const WEIGHT_LABELS: Record<string, { titleKey: TKey; hintKey: TKey }> = {
  neededNow: { titleKey: "weightLabels.neededNow.title", hintKey: "weightLabels.neededNow.hint" },
  earlyEtaSoon: { titleKey: "weightLabels.earlyEtaSoon.title", hintKey: "weightLabels.earlyEtaSoon.hint" },
  earlyCheckInFlag: { titleKey: "weightLabels.earlyCheckInFlag.title", hintKey: "weightLabels.earlyCheckInFlag.hint" },
  vip: { titleKey: "weightLabels.vip.title", hintKey: "weightLabels.vip.hint" },
  checkoutWithArrival: { titleKey: "weightLabels.checkoutWithArrival.title", hintKey: "weightLabels.checkoutWithArrival.hint" },
  checkoutToday: { titleKey: "weightLabels.checkoutToday.title", hintKey: "weightLabels.checkoutToday.hint" },
  excursionActive: { titleKey: "weightLabels.excursionActive.title", hintKey: "weightLabels.excursionActive.hint" },
  excursionEndingSoon: { titleKey: "weightLabels.excursionEndingSoon.title", hintKey: "weightLabels.excursionEndingSoon.hint" },
  blockedAgePerInterval: { titleKey: "weightLabels.blockedAgePerInterval.title", hintKey: "weightLabels.blockedAgePerInterval.hint" },
  blockedAgeCap: { titleKey: "weightLabels.blockedAgeCap.title", hintKey: "weightLabels.blockedAgeCap.hint" },
  sameSection: { titleKey: "weightLabels.sameSection.title", hintKey: "weightLabels.sameSection.hint" },
  sameFloor: { titleKey: "weightLabels.sameFloor.title", hintKey: "weightLabels.sameFloor.hint" },
  etaSoonWindowMinutes: { titleKey: "weightLabels.etaSoonWindowMinutes.title", hintKey: "weightLabels.etaSoonWindowMinutes.hint" },
};

type ThresholdKey = "blockedRecheckMinutes" | "welfareCheckMinutes" | "etaWarningMinutes" | "releaseQueueBacklogThreshold";
type StaffingKey = "roomsPerAttendantMin" | "roomsPerAttendantMax" | "attendantPoolMax";

const THRESHOLD_LABELS: Record<ThresholdKey, { titleKey: TKey; hintKey: TKey; unitKey: TKey }> = {
  blockedRecheckMinutes: { titleKey: "thresholdLabels.blockedRecheckMinutes.title", hintKey: "thresholdLabels.blockedRecheckMinutes.hint", unitKey: "common.minutesShort" },
  welfareCheckMinutes: { titleKey: "thresholdLabels.welfareCheckMinutes.title", hintKey: "thresholdLabels.welfareCheckMinutes.hint", unitKey: "common.minutesShort" },
  etaWarningMinutes: { titleKey: "thresholdLabels.etaWarningMinutes.title", hintKey: "thresholdLabels.etaWarningMinutes.hint", unitKey: "common.minutesShort" },
  releaseQueueBacklogThreshold: { titleKey: "thresholdLabels.releaseQueueBacklogThreshold.title", hintKey: "thresholdLabels.releaseQueueBacklogThreshold.hint", unitKey: "thresholdLabels.rooms" },
};

/** Morning-planning staffing guideline — see src/lib/assignment/staffing.ts. */
const STAFFING_LABELS: Record<StaffingKey, { titleKey: TKey; hintKey: TKey; unitKey: TKey }> = {
  roomsPerAttendantMin: { titleKey: "thresholdLabels.roomsPerAttendantMin.title", hintKey: "thresholdLabels.roomsPerAttendantMin.hint", unitKey: "thresholdLabels.rooms" },
  roomsPerAttendantMax: { titleKey: "thresholdLabels.roomsPerAttendantMax.title", hintKey: "thresholdLabels.roomsPerAttendantMax.hint", unitKey: "thresholdLabels.rooms" },
  attendantPoolMax: { titleKey: "thresholdLabels.attendantPoolMax.title", hintKey: "thresholdLabels.attendantPoolMax.hint", unitKey: "thresholdLabels.attendants" },
};

export default function SettingsView() {
  const { t } = useLocale();
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [weights, setWeights] = useState<Weights>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<SettingsResponse>("/api/settings")
      .then((d) => {
        setData(d);
        setThresholds(d.settings);
        setWeights(d.weights);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  const save = async () => {
    if (!thresholds) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<SettingsResponse>("/api/settings", {
        method: "PATCH",
        body: { ...thresholds, weights },
      });
      setData(res);
      setThresholds(res.settings);
      setWeights(res.weights);
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const resetWeights = () => data && setWeights({ ...data.weightDefaults });
  const changed = data ? Object.keys(weights).filter((k) => weights[k] !== data.weightDefaults[k]) : [];

  if (!data || !thresholds) {
    return <p className="text-sm text-graphite/60">{error ?? t("common.loading")}</p>;
  }

  return (
    <div className="animate-rise pb-28">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-4xl leading-none">{t("settings.title")}</h2>
          <div className="rule-gold my-2 w-40" />
          <p className="text-sm text-graphite/70">{t("settings.dutyManagerOnly")}</p>
        </div>
        <Link
          href="/supervisor"
          className="flex h-12 items-center rounded-xl border border-charcoal/15 bg-linen px-5 text-sm font-medium hover:border-gold-line"
        >
          {t("settings.liveBoardLink")}
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-status-out-of-order/30 bg-status-out-of-order/10 p-4 text-sm text-status-out-of-order">
          {error}
        </div>
      )}

      <section className="mb-4 rounded-2xl border border-charcoal/10 bg-linen p-5 shadow-card">
        <h3 className="mb-1 font-serif text-2xl">{t("settings.escalationThresholds")}</h3>
        <p className="mb-4 text-sm text-graphite/60">{t("settings.escalationHint")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(THRESHOLD_LABELS) as ThresholdKey[]).map((key) => (
            <label key={key} className="rounded-xl border border-charcoal/15 bg-white p-4">
              <div className="text-sm font-medium">{t(THRESHOLD_LABELS[key].titleKey)}</div>
              <div className="mb-2 text-xs text-graphite/60">{t(THRESHOLD_LABELS[key].hintKey)}</div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={thresholds[key]}
                  onChange={(e) => setThresholds({ ...thresholds, [key]: Math.max(1, Number(e.target.value) || 1) })}
                  className="h-12 w-28 rounded-lg border border-charcoal/20 px-3 text-center font-serif text-2xl outline-none focus:border-gold"
                />
                <span className="text-sm text-graphite/60">{t(THRESHOLD_LABELS[key].unitKey)}</span>
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className="mb-4 rounded-2xl border border-charcoal/10 bg-linen p-5 shadow-card">
        <h3 className="mb-1 font-serif text-2xl">{t("settings.staffingGuideline")}</h3>
        <p className="mb-4 text-sm text-graphite/60">{t("settings.staffingGuidelineHint")}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(STAFFING_LABELS) as StaffingKey[]).map((key) => (
            <label key={key} className="rounded-xl border border-charcoal/15 bg-white p-4">
              <div className="text-sm font-medium">{t(STAFFING_LABELS[key].titleKey)}</div>
              <div className="mb-2 text-xs text-graphite/60">{t(STAFFING_LABELS[key].hintKey)}</div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={thresholds[key]}
                  onChange={(e) => setThresholds({ ...thresholds, [key]: Math.max(1, Number(e.target.value) || 1) })}
                  className="h-12 w-28 rounded-lg border border-charcoal/20 px-3 text-center font-serif text-2xl outline-none focus:border-gold"
                />
                <span className="text-sm text-graphite/60">{t(STAFFING_LABELS[key].unitKey)}</span>
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className="mb-4 rounded-2xl border border-charcoal/10 bg-linen p-5 shadow-card">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-serif text-2xl">{t("settings.priorityWeights")}</h3>
          <button onClick={resetWeights} className="h-10 rounded-lg px-3 text-sm text-gold hover:bg-parchment">
            {t("settings.resetDefaults")}
          </button>
        </div>
        <p className="mb-4 text-sm text-graphite/60">
          {t("settings.weightsExplain", {
            note: changed.length > 0 ? t("settings.weightsChanged", { count: changed.length }) : t("settings.weightsAllDefault"),
          })}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.keys(data.weightDefaults).map((key) => {
            const label = WEIGHT_LABELS[key];
            const isChanged = weights[key] !== data.weightDefaults[key];
            return (
              <label
                key={key}
                className={`rounded-xl border p-4 ${isChanged ? "border-gold-line bg-parchment" : "border-charcoal/15 bg-white"}`}
              >
                <div className="text-sm font-medium">{label ? t(label.titleKey) : key}</div>
                <div className="mb-2 text-xs text-graphite/60">{label ? t(label.hintKey) : ""}</div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={weights[key] ?? data.weightDefaults[key]}
                    onChange={(e) => setWeights({ ...weights, [key]: Math.max(0, Number(e.target.value) || 0) })}
                    className="h-12 w-24 rounded-lg border border-charcoal/20 px-3 text-center font-serif text-2xl outline-none focus:border-gold"
                  />
                  {isChanged && (
                    <span className="text-xs text-graphite/60">{t("settings.default", { value: data.weightDefaults[key] })}</span>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      </section>

      <div className="sticky bottom-3 rounded-2xl border border-charcoal/10 bg-linen/95 p-4 shadow-lift backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-graphite/70">{saved ? t("settings.savedNote") : t("settings.auditNote")}</p>
          <button
            onClick={save}
            disabled={busy}
            className="h-14 rounded-xl bg-gold px-8 text-base font-semibold text-charcoal transition hover:brightness-95 disabled:opacity-40"
          >
            {busy ? t("common.saving") : t("settings.saveSettings")}
          </button>
        </div>
      </div>
    </div>
  );
}
