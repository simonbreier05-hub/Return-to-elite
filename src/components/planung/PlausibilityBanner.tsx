"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { PlausibilityState } from "@/lib/import/plausibilityData";

/**
 * Plausibilitätswarnung oben im Planungstool: Abweichungen der Listen untereinander und zum Forecast, mit konkreten
 * Zahlen. Blockiert nichts; „Gesehen, trotzdem planen“ bestätigt genau diesen Stand (neue Abweichungen erscheinen wieder).
 */
export default function PlausibilityBanner({ refreshKey }: { refreshKey?: string }) {
  const { t } = useLocale();
  const [state, setState] = useState<PlausibilityState | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<PlausibilityState>("/api/import/plausibility").then(setState).catch(() => {}), []);
  useEffect(() => { void load(); }, [load, refreshKey]);
  useSocket({ "dayplan:updated": () => { void load(); }, "import:deleted": () => { void load(); } });

  if (!state?.findings.length) return null;
  if (state.acknowledged) return <p role="status" className="mb-3 text-xs text-pl-muted">{t("planungTool.plausAcked", { n: state.findings.length })}</p>;
  const ack = async () => {
    setBusy(true);
    await api("/api/import/plausibility", { body: { signature: state.signature } }).catch(() => null);
    await load();
    setBusy(false);
  };
  return (
    <div role="alert" className="mb-4 rounded-xl border border-brass-light bg-night-800 p-3 text-sm">
      <div className="font-medium text-brass-ink">{t("planungTool.plausTitle")}</div>
      <ul className="mt-1.5 list-disc space-y-0.5 ps-5 text-pl-text">
        {state.findings.map((f, i) => <li key={i}>{f.message}</li>)}
      </ul>
      <p className="mt-1.5 text-xs text-pl-muted">{t("planungTool.plausHint")}</p>
      <button type="button" disabled={busy} onClick={() => void ack()}
        className="mt-2 min-h-11 rounded-full border border-line-2 px-4 text-xs font-medium text-pl-text hover:border-brass-light disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light">
        {t("planungTool.plausAck")}
      </button>
    </div>
  );
}
