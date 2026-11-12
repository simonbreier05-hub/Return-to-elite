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
  useSocket({ "app:resync": () => { void load(); }, "dayplan:updated": () => { void load(); }, "import:deleted": () => { void load(); } });

  if (!state?.findings.length) return null;
  if (state.acknowledged) return <p role="status" className="mb-3 text-label text-pl-muted">{t("planungTool.plausAcked", { n: state.findings.length })}</p>;
  const ack = async () => {
    setBusy(true);
    await api("/api/import/plausibility", { body: { signature: state.signature } }).catch(() => null);
    await load();
    setBusy(false);
  };
  return (
    <div role="alert" className="glass glass-warm mb-4 rounded-(--glass-radius-md) p-4">
      <div className="text-body-18 text-status-warning-fg">{t("planungTool.plausTitle")}</div>
      <ul className="mt-1.5 list-disc space-y-0.5 ps-5 text-label text-text-primary">
        {state.findings.map((f, i) => <li key={i}>{f.message}</li>)}
      </ul>
      <p className="text-label mt-1.5 text-text-muted">{t("planungTool.plausHint")}</p>
      <button type="button" disabled={busy} onClick={() => void ack()}
        className="glass press text-label mt-2 min-h-(--size-touch-min) rounded-pill px-5 text-text-primary disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-accent-default">
        {t("planungTool.plausAck")}
      </button>
    </div>
  );
}
