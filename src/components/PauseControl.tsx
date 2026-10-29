"use client";

import { useState } from "react";
import { api } from "@/components/api";
import { PAUSE_REASONS, type PauseReason, type PauseTarget } from "@/lib/domain";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";

export interface PauseInfo { reason: string | null; since: string; byName: string | null; byRole?: string | null }

const time = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
const reasonKey = (r: string) => `work.reason${r}` as TKey;

/** Kleines Kennzeichen „⏸ Pausiert · Grund“ für Listen (Zimmerzeilen, Hausmann-Liste, Arbeitsaufträge). */
export function PauseBadge({ pause, showBy = false }: { pause: PauseInfo | null | undefined; showBy?: boolean }) {
  const { t } = useLocale();
  if (!pause) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-status-blocked/40 bg-status-blocked/10 px-2 py-0.5 text-[0.7rem] font-semibold text-status-blocked">
      <span aria-hidden>⏸</span>{t("work.paused")}
      {pause.reason && <span className="font-medium">· {t(reasonKey(pause.reason))}</span>}
      <span className="font-normal">· {t("work.pausedSince", { time: time(pause.since) })}</span>
      {showBy && pause.byName && <span className="font-normal">· {t("work.pausedBy", { name: pause.byName })}</span>}
    </span>
  );
}

/**
 * Pausieren/Fortsetzen — derselbe Knopf für jede Abteilung (POST /api/work/pause). Pausieren fragt optional nach einem
 * festen Grund; Fortsetzen ist ein Tap. `canPause` sagt nur, ob der Knopf „Pausieren“ angeboten wird — entscheiden tut der Server.
 */
export default function PauseControl({ targetType, targetId, pause, canPause, onChanged, size = "md" }: {
  targetType: PauseTarget;
  targetId: string;
  pause: PauseInfo | null | undefined;
  canPause: boolean;
  onChanged?: (pause: PauseInfo | null) => void;
  size?: "md" | "lg";
}) {
  const { t } = useLocale();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const h = size === "lg" ? "h-14 text-lg" : "h-12 text-sm";

  const send = async (action: "pause" | "resume", reason?: PauseReason | null) => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await api<{ paused: boolean; pause: PauseInfo | null }>("/api/work/pause", { body: { targetType, targetId, action, reason: reason ?? null } });
      setAsking(false);
      onChanged?.(res.paused ? res.pause : null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t("work.failed"));
    } finally {
      setBusy(false);
    }
  };

  if (pause) {
    return (
      <div className="space-y-2" data-testid="pause-control">
        <PauseBadge pause={pause} showBy />
        <button type="button" onClick={() => send("resume")} disabled={busy}
          className={`w-full rounded-xl bg-status-in-progress font-semibold text-linen transition active:scale-[0.98] disabled:opacity-50 ${h}`}>
          {busy ? "…" : `▶ ${t("work.resume")}`}
        </button>
        {error && <p role="alert" className="text-sm text-status-out-of-order">{error}</p>}
      </div>
    );
  }
  if (!canPause) return null;
  return (
    <div className="space-y-2" data-testid="pause-control">
      {!asking ? (
        <button type="button" onClick={() => setAsking(true)} disabled={busy}
          className={`w-full rounded-xl border-2 border-status-blocked font-medium text-status-blocked transition active:scale-[0.98] disabled:opacity-50 ${h}`}>
          ⏸ {t("work.pause")}
        </button>
      ) : (
        <div role="group" aria-label={t("work.reasonPrompt")} className="rounded-xl border border-status-blocked/40 bg-status-blocked/5 p-2">
          <p className="mb-2 text-sm font-medium">{t("work.reasonPrompt")}</p>
          <div className="grid grid-cols-2 gap-2">
            {PAUSE_REASONS.map((r) => (
              <button key={r} type="button" disabled={busy} onClick={() => send("pause", r)}
                className="min-h-11 rounded-lg border border-charcoal/15 bg-white px-3 text-sm font-medium disabled:opacity-50">{t(reasonKey(r))}</button>
            ))}
            <button type="button" disabled={busy} onClick={() => send("pause", null)}
              className="min-h-11 rounded-lg border border-charcoal/15 bg-white px-3 text-sm disabled:opacity-50">{t("work.noReason")}</button>
            <button type="button" disabled={busy} onClick={() => setAsking(false)}
              className="min-h-11 rounded-lg px-3 text-sm text-graphite/70 underline">{t("work.cancel")}</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-status-out-of-order">{error}</p>}
    </div>
  );
}
