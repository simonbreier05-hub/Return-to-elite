"use client";

import type { GuestOfflineState } from "./useGuestOfflineQueue";
import { useGuestLocale } from "@/lib/guestI18n/GuestLocaleContext";

/**
 * Tells the guest the truth about their tap, same principle as the staff
 * Hub's OfflineBar: silence would be worse than a warning — the whole point
 * of Prompt G2 Teil 3's offline requirement is that a request never just
 * vanishes without the guest knowing.
 */
export default function GuestOfflineBar({ state }: { state: GuestOfflineState }) {
  const { t } = useGuestLocale();
  const { online, pending, rejected, dismissRejected, flush } = state;

  if (online && pending.length === 0 && rejected.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {pending.length > 0 && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 animate-rise"
          style={{ borderColor: "var(--g-brass)", background: "var(--g-panel)" }}
        >
          <div>
            <p className="font-semibold" style={{ color: "var(--g-navy)" }}>
              {online ? t("offline.sending") : t("offline.noConnection")} · {pending.length}{" "}
              {pending.length === 1 ? t("offline.actionWaiting") : t("offline.actionsWaiting")}
            </p>
            <p className="text-sm" style={{ color: "var(--g-muted)" }}>
              {t("offline.savedLocally")}
            </p>
          </div>
          <button
            onClick={() => flush()}
            className="h-11 shrink-0 rounded-xl border-2 px-4 text-sm font-semibold"
            style={{ borderColor: "var(--g-navy)", color: "var(--g-navy)" }}
          >
            {t("offline.tryNow")}
          </button>
        </div>
      )}

      {!online && pending.length === 0 && (
        <div
          className="rounded-xl border px-4 py-2 text-sm animate-rise"
          style={{ borderColor: "var(--g-panel)", background: "var(--g-cream)", color: "var(--g-muted)" }}
        >
          {t("offline.canKeepWorking")}
        </div>
      )}

      {rejected.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 animate-rise">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-red-800">
                {rejected.length === 1 ? t("offline.oneRejected") : t("offline.nRejected", { count: rejected.length })}
              </p>
              <p className="mt-1 text-sm text-red-700">{t("offline.mayHaveChanged")}</p>
            </div>
            <button onClick={dismissRejected} className="h-9 w-9 shrink-0 rounded-lg text-red-700 hover:bg-red-100" aria-label="Dismiss">
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
