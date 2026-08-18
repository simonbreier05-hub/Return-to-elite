"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/components/api";

interface Thresholds {
  blockedRecheckMinutes: number;
  welfareCheckMinutes: number;
  etaWarningMinutes: number;
  releaseQueueBacklogThreshold: number;
}

type Weights = Record<string, number>;

interface SettingsResponse {
  settings: Thresholds;
  weights: Weights;
  weightDefaults: Weights;
}

/** Plain-language labels — nobody should have to read the source to tune this. */
const WEIGHT_LABELS: Record<string, { title: string; hint: string }> = {
  neededNow: { title: "Front office needs it now", hint: "A guest is waiting at the desk." },
  earlyEtaSoon: { title: "Confirmed arrival due soon", hint: "Within the arrival window below." },
  earlyCheckInFlag: { title: "Early check-in requested", hint: "Flagged by front office." },
  vip: { title: "VIP arriving", hint: "How far a VIP jumps the queue." },
  checkoutWithArrival: { title: "Same-day turn", hint: "Room leaves and is re-sold today." },
  checkoutToday: { title: "Due out today", hint: "Checkout without a same-day arrival." },
  excursionActive: { title: "Guest currently out", hint: "Concierge logged an excursion." },
  excursionEndingSoon: { title: "Excursion ending soon", hint: "Clean before the guest returns." },
  blockedAgePerInterval: { title: "Per re-check interval blocked", hint: "Added each time a DND room ages." },
  blockedAgeCap: { title: "Cap on blocked ageing", hint: "Upper limit for the signal above." },
  sameSection: { title: "Same section as attendant", hint: "Rewards short walking distances." },
  sameFloor: { title: "Same floor as attendant", hint: "Weaker than same section." },
  etaSoonWindowMinutes: { title: "Arrival window (minutes)", hint: "How early an ETA starts to count." },
};

const THRESHOLD_LABELS: Record<keyof Thresholds, { title: string; hint: string; unit: string }> = {
  blockedRecheckMinutes: { title: "Re-check a blocked room after", hint: "Reminder to the attendant.", unit: "min" },
  welfareCheckMinutes: { title: "Welfare check after DND for", hint: "Alerts the duty manager.", unit: "min" },
  etaWarningMinutes: { title: "Warn before an arrival ETA", hint: "If the room is not released yet.", unit: "min" },
  releaseQueueBacklogThreshold: { title: "Release queue backlog at", hint: "Alerts the supervisor.", unit: "rooms" },
};

export default function SettingsView() {
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
    return <p className="text-sm text-graphite/60">{error ?? "Loading settings…"}</p>;
  }

  return (
    <div className="animate-rise pb-28">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-4xl leading-none">Settings</h2>
          <div className="rule-gold my-2 w-40" />
          <p className="text-sm text-graphite/70">Duty manager only. Changes apply to the next calculation.</p>
        </div>
        <Link
          href="/supervisor"
          className="flex h-12 items-center rounded-xl border border-charcoal/15 bg-linen px-5 text-sm font-medium hover:border-gold-line"
        >
          ← Live board
        </Link>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

      <section className="mb-4 rounded-2xl border border-charcoal/10 bg-linen p-5 shadow-card">
        <h3 className="mb-1 font-serif text-2xl">Escalation thresholds</h3>
        <p className="mb-4 text-sm text-graphite/60">When the system starts chasing people.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(THRESHOLD_LABELS) as (keyof Thresholds)[]).map((key) => (
            <label key={key} className="rounded-xl border border-charcoal/15 bg-white p-4">
              <div className="text-sm font-medium">{THRESHOLD_LABELS[key].title}</div>
              <div className="mb-2 text-xs text-graphite/60">{THRESHOLD_LABELS[key].hint}</div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={thresholds[key]}
                  onChange={(e) => setThresholds({ ...thresholds, [key]: Math.max(1, Number(e.target.value) || 1) })}
                  className="h-12 w-28 rounded-lg border border-charcoal/20 px-3 text-center font-serif text-2xl outline-none focus:border-gold"
                />
                <span className="text-sm text-graphite/60">{THRESHOLD_LABELS[key].unit}</span>
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className="mb-4 rounded-2xl border border-charcoal/10 bg-linen p-5 shadow-card">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-serif text-2xl">Priority weights</h3>
          <button onClick={resetWeights} className="h-10 rounded-lg px-3 text-sm text-gold hover:bg-parchment">
            Reset to defaults
          </button>
        </div>
        <p className="mb-4 text-sm text-graphite/60">
          Points each signal adds to a room&apos;s score. Set a weight to <strong>0</strong> to switch that signal off
          entirely. Attendants see the resulting reasons under &quot;why?&quot;, so these numbers are visible on the
          floor — {changed.length > 0 ? `${changed.length} currently differ from the default.` : "all currently at default."}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.keys(data.weightDefaults).map((key) => {
            const label = WEIGHT_LABELS[key] ?? { title: key, hint: "" };
            const isChanged = weights[key] !== data.weightDefaults[key];
            return (
              <label
                key={key}
                className={`rounded-xl border p-4 ${isChanged ? "border-gold-line bg-parchment" : "border-charcoal/15 bg-white"}`}
              >
                <div className="text-sm font-medium">{label.title}</div>
                <div className="mb-2 text-xs text-graphite/60">{label.hint}</div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={weights[key] ?? data.weightDefaults[key]}
                    onChange={(e) => setWeights({ ...weights, [key]: Math.max(0, Number(e.target.value) || 0) })}
                    className="h-12 w-24 rounded-lg border border-charcoal/20 px-3 text-center font-serif text-2xl outline-none focus:border-gold"
                  />
                  {isChanged && (
                    <span className="text-xs text-graphite/60">default {data.weightDefaults[key]}</span>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      </section>

      <div className="sticky bottom-3 rounded-2xl border border-charcoal/10 bg-linen/95 p-4 shadow-lift backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-graphite/70">
            {saved ? "✓ Saved — the next priority calculation uses these." : "Every change is written to the audit log."}
          </p>
          <button
            onClick={save}
            disabled={busy}
            className="h-14 rounded-xl bg-gold px-8 text-base font-semibold text-white transition hover:brightness-95 disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
