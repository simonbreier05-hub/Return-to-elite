"use client";

import type { OfflineState } from "./useOfflineQueue";
import { useLocale } from "@/lib/i18n/LocaleContext";

/**
 * Tells the attendant the truth about their taps: whether the last one reached
 * the house system, and what is still waiting. Silence would be worse than a
 * warning — the whole point is that nobody discovers a lost tap at handover.
 */
export default function OfflineBar({ state }: { state: OfflineState }) {
  const { t } = useLocale();
  const { online, pending, rejected, dismissRejected, flush } = state;

  if (online && pending.length === 0 && rejected.length === 0) return null;

  return (
    <div className="sticky top-[4.5rem] z-30 space-y-2 pb-2">
      {pending.length > 0 && (
        <div className="flex theme-glass flex-wrap items-center justify-between gap-3 rounded-(--glass-radius-md) border border-status-in-progress/40 bg-status-in-progress/10 px-4 py-3">
          <div>
            <p className="font-semibold text-status-in-progress">
              {online ? t("offline.sending") : t("offline.noConnection")} · {pending.length}{" "}
              {pending.length === 1 ? t("offline.actionWaiting") : t("offline.actionsWaiting")}
            </p>
            <p className="text-sm text-espresso">{t("offline.savedLocally")}</p>
            <ul className="mt-1 text-xs text-espresso/90">
              {pending.slice(0, 4).map((a) => (
                <li key={a.id}>· {a.label}</li>
              ))}
              {pending.length > 4 && <li>· {t("offline.andNMore", { count: pending.length - 4 })}</li>}
            </ul>
          </div>
          <button
            onClick={() => flush()}
            className="h-12 shrink-0 rounded-(--glass-radius-md) border-2 border-status-in-progress px-5 text-sm font-semibold text-status-in-progress"
          >
            {t("common.tryNow")}
          </button>
        </div>
      )}

      {!online && pending.length === 0 && (
        <div className="theme-glass rounded-(--glass-radius-md) border border-border-subtle bg-accent-subtle-bg px-4 py-2 text-sm text-espresso">
          {t("offline.canKeepWorking")}
        </div>
      )}

      {rejected.length > 0 && (
        <div className="theme-glass rounded-(--glass-radius-md) border border-status-out-of-order/35 bg-status-danger-bg px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-status-danger-fg">
                {rejected.length === 1 ? t("offline.oneRejected") : t("offline.nRejected", { count: rejected.length })}
              </p>
              <ul className="mt-1 space-y-0.5 text-sm text-status-danger-fg/90">
                {rejected.map((r, i) => (
                  <li key={i}>
                    · {r.label} — {r.error}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-status-danger-fg/75">{t("offline.mayHaveChanged")}</p>
            </div>
            <button
              onClick={dismissRejected}
              className="h-11 w-11 shrink-0 rounded-(--glass-radius-sm) text-status-danger-fg"
              aria-label={t("common.dismiss")}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
