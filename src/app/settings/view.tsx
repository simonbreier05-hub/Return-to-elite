"use client";

import { useEffect, useMemo, useState } from "react";
import { ALL_LANGUAGE_CODES, autonym, languageNameIn } from "@/lib/i18n/languages";
import { api } from "@/components/api";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { errorText } from "@/lib/i18n/errorText";
import PurgePanel from "@/components/PurgePanel";
import HousekeeperSettingsPanel from "@/components/HousekeeperSettingsPanel";
import { RecurringTasksPanel } from "@/components/roles/RecurringTasksPanel";
import LearnedRulesPanel from "@/components/LearnedRulesPanel";
import type { TKey } from "@/lib/i18n/translations";
import { Banner, Button, GlassCard, SectionLabel } from "@/components/ui";
import { cx, FOCUS_RING } from "@/components/ui/primitives";

interface Thresholds {
  blockedRecheckMinutes: number;
  welfareCheckMinutes: number;
  etaWarningMinutes: number;
  releaseQueueBacklogThreshold: number;
  roomsPerAttendantMin: number;
  roomsPerAttendantMax: number;
  attendantPoolMax: number;
  roomInventory: number;
  chatRetentionDays: number;
}

type Weights = Record<string, number>;

interface SettingsResponse {
  settings: Thresholds;
  weights: Weights;
  weightDefaults: Weights;
  hotelDefaultLanguage?: string;
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
type StaffingKey = "roomsPerAttendantMin" | "roomsPerAttendantMax" | "attendantPoolMax" | "roomInventory";

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
  roomInventory: { titleKey: "thresholdLabels.roomInventory.title", hintKey: "thresholdLabels.roomInventory.hint", unitKey: "thresholdLabels.rooms" },
};

export default function SettingsView() {
  const { t, locale } = useLocale();
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [weights, setWeights] = useState<Weights>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hotelLanguage, setHotelLanguage] = useState("de");

  useEffect(() => {
    api<SettingsResponse>("/api/settings")
      .then((d) => {
        setData(d);
        setThresholds(d.settings);
        setWeights(d.weights);
        if (d.hotelDefaultLanguage) setHotelLanguage(d.hotelDefaultLanguage);
      })
      .catch((e) => setError(errorText(e, t)));
  }, []);

  const save = async () => {
    if (!thresholds) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<SettingsResponse>("/api/settings", {
        method: "PATCH",
        body: { ...thresholds, weights, hotelDefaultLanguage: hotelLanguage },
      });
      setData(res);
      setThresholds(res.settings);
      setWeights(res.weights);
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };

  const languageOptions = useMemo(
    () => ALL_LANGUAGE_CODES.map((code) => ({ code, label: `${autonym(code)} (${languageNameIn(code, locale)})` })).filter((l) => !l.label.startsWith(`${l.code} (`)),
    [locale],
  );

  const resetWeights = () => data && setWeights({ ...data.weightDefaults });
  const changed = data ? Object.keys(weights).filter((k) => weights[k] !== data.weightDefaults[k]) : [];

  if (!data || !thresholds) {
    return <p className="text-body-16 text-text-muted">{error ?? t("common.loading")}</p>;
  }

  // Simon-Feedback 19.11.2026: Einstellungen im Design der App („Glas & Premium“) — Werte, Speichern und Logbuch unverändert.
  const numberInput = (value: number, onChange: (n: number) => void, opts: { min: number; max?: number; label: string }) => (
    <input type="number" min={opts.min} max={opts.max} value={value} aria-label={opts.label}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cx("text-title-22 h-12 w-28 rounded-(--glass-radius-md) border border-border-subtle bg-surface-progress-track px-3 text-center text-text-primary", FOCUS_RING)} />
  );
  const field = (key: string, title: string, hint: string, input: React.ReactNode, unit?: string, highlight = false) => (
    <label key={key} className={cx("flex flex-col gap-2 rounded-(--glass-radius-md) border p-4", highlight ? "border-border-accent bg-accent-subtle-bg" : "border-border-subtle bg-surface-card-raised")}>
      <span className="text-body-16 text-text-primary">{title}</span>
      {hint && <span className="text-label text-text-muted">{hint}</span>}
      <span className="flex items-center gap-2">{input}{unit && <span className="text-label text-text-muted">{unit}</span>}</span>
    </label>
  );

  return (
    <div className="theme-glass flex flex-col gap-4 pb-28 sm:gap-6" data-testid="settings">
      <GlassCard as="section" aria-label={t("settings.title")} className="flex flex-col gap-2">
        <SectionLabel as="h2" icon="wrench" title={t("settings.title")} />
        <p className="text-body-16 text-text-muted">{t("settings.dutyManagerOnly")}</p>
      </GlassCard>

      {error && <Banner tone="warning" title={error} />}

      <GlassCard as="section" aria-label={t("settings.escalationThresholds")} className="flex flex-col gap-3">
        <h3 className="text-title-22 text-text-primary">{t("settings.escalationThresholds")}</h3>
        <p className="text-body-16 text-text-muted">{t("settings.escalationHint")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(THRESHOLD_LABELS) as ThresholdKey[]).map((key) => field(key, t(THRESHOLD_LABELS[key].titleKey), t(THRESHOLD_LABELS[key].hintKey),
            numberInput(thresholds[key], (n) => setThresholds({ ...thresholds, [key]: Math.max(1, n || 1) }), { min: 1, label: t(THRESHOLD_LABELS[key].titleKey) }),
            t(THRESHOLD_LABELS[key].unitKey)))}
        </div>
      </GlassCard>

      <GlassCard as="section" aria-label={t("settings.staffingGuideline")} className="flex flex-col gap-3">
        <h3 className="text-title-22 text-text-primary">{t("settings.staffingGuideline")}</h3>
        <p className="text-body-16 text-text-muted">{t("settings.staffingGuidelineHint")}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(STAFFING_LABELS) as StaffingKey[]).map((key) => field(key, t(STAFFING_LABELS[key].titleKey), t(STAFFING_LABELS[key].hintKey),
            numberInput(thresholds[key], (n) => setThresholds({ ...thresholds, [key]: Math.max(1, n || 1) }), { min: 1, label: t(STAFFING_LABELS[key].titleKey) }),
            t(STAFFING_LABELS[key].unitKey)))}
        </div>
      </GlassCard>

      <HousekeeperSettingsPanel />
      {/* Betrieb L2 (Punkt 9): wiederkehrende Hausmann-Aufgaben */}
      <RecurringTasksPanel />
      <LearnedRulesPanel />

      <PurgePanel />

      <GlassCard as="section" aria-label={t("shared.hotelLanguageTitle")} className="flex flex-col gap-3">
        <h3 className="text-title-22 text-text-primary">{t("shared.hotelLanguageTitle")}</h3>
        <p className="text-body-16 text-text-muted">{t("shared.hotelLanguageHint")}</p>
        <select aria-label={t("shared.hotelLanguageTitle")} value={hotelLanguage} onChange={(e) => setHotelLanguage(e.target.value)}
          className={cx("text-body-16 min-h-(--size-touch-min) w-full max-w-sm rounded-(--glass-radius-md) border border-border-subtle bg-surface-progress-track px-4 py-3 text-text-primary", FOCUS_RING)}>
          {languageOptions.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </GlassCard>

      <GlassCard as="section" aria-label={t("settings.chatTitle")} className="flex flex-col gap-3">
        <h3 className="text-title-22 text-text-primary">{t("settings.chatTitle")}</h3>
        <p className="text-body-16 text-text-muted">{t("settings.chatHint")}</p>
        <div className="max-w-sm">
          {field("chat", t("settings.chatRetentionDays"), "",
            numberInput(thresholds.chatRetentionDays, (n) => setThresholds({ ...thresholds, chatRetentionDays: Math.min(365, Math.max(1, n || 1)) }), { min: 1, max: 365, label: t("settings.chatRetentionDays") }),
            t("settings.days"))}
        </div>
      </GlassCard>

      <GlassCard as="section" aria-label={t("settings.priorityWeights")} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-title-22 text-text-primary">{t("settings.priorityWeights")}</h3>
          <Button variant="secondary" icon="refresh" onClick={resetWeights}>{t("settings.resetDefaults")}</Button>
        </div>
        <p className="text-body-16 text-text-muted">
          {t("settings.weightsExplain", {
            note: changed.length > 0 ? t("settings.weightsChanged", { count: changed.length }) : t("settings.weightsAllDefault"),
          })}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.keys(data.weightDefaults).map((key) => {
            const label = WEIGHT_LABELS[key];
            const isChanged = weights[key] !== data.weightDefaults[key];
            return field(key, label ? t(label.titleKey) : key, label ? t(label.hintKey) : "",
              <>
                {numberInput(weights[key] ?? data.weightDefaults[key], (n) => setWeights({ ...weights, [key]: Math.max(0, n || 0) }), { min: 0, label: label ? t(label.titleKey) : key })}
                {isChanged && <span className="text-label text-text-muted">{t("settings.default", { value: data.weightDefaults[key] })}</span>}
              </>, undefined, isChanged);
          })}
        </div>
      </GlassCard>

      <div className="glass sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-(--glass-radius-lg) p-4">
        <p className="text-body-16 text-text-secondary">{saved ? t("settings.savedNote") : t("settings.auditNote")}</p>
        <Button icon="check" disabled={busy} onClick={() => void save()}>{busy ? t("common.saving") : t("settings.saveSettings")}</Button>
      </div>
    </div>
  );
}
