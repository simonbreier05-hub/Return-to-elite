"use client";

import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Glyph, FOCUS_RING } from "@/components/ui/primitives";
import type { GuestOfflineState } from "./useGuestOfflineQueue";
import { useGuestLocale } from "@/lib/guestI18n/GuestLocaleContext";

/**
 * Tells the guest the truth about their tap, same principle as the staff
 * Hub's OfflineBar: silence would be worse than a warning — the whole point
 * of Prompt G2 Teil 3's offline requirement is that a request never just
 * vanishes without the guest knowing. D6: glass Banners (symbol + text,
 * never colour alone).
 */
export default function GuestOfflineBar({ state }: { state: GuestOfflineState }) {
  const { t } = useGuestLocale();
  const { online, pending, rejected, dismissRejected, flush } = state;

  if (online && pending.length === 0 && rejected.length === 0) return null;

  return (
    <div className="space-y-2" role="status" aria-live="polite">
      {pending.length > 0 && (
        <div className="space-y-2">
          <Banner
            tone="info"
            icon={online ? "refresh" : "info"}
            title={`${online ? t("offline.sending") : t("offline.noConnection")} · ${pending.length} ${
              pending.length === 1 ? t("offline.actionWaiting") : t("offline.actionsWaiting")
            }`}
            detail={t("offline.savedLocally")}
          />
          <Button variant="secondary" icon="refresh" block onClick={() => flush()}>
            {t("offline.tryNow")}
          </Button>
        </div>
      )}

      {!online && pending.length === 0 && <Banner tone="info" title={t("offline.noConnection")} detail={t("offline.canKeepWorking")} />}

      {rejected.length > 0 && (
        <div className="flex items-start gap-2">
          <Banner
            tone="warning"
            className="flex-1"
            title={rejected.length === 1 ? t("offline.oneRejected") : t("offline.nRejected", { count: rejected.length })}
            detail={t("offline.mayHaveChanged")}
          />
          <button
            type="button"
            onClick={dismissRejected}
            aria-label={t("common.dismiss")}
            className={`press inline-flex size-(--size-touch-min) shrink-0 items-center justify-center rounded-pill border border-border-subtle text-text-primary ${FOCUS_RING}`}
          >
            <Glyph name="x" size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
