"use client";

import { useLocale } from "@/lib/i18n/LocaleContext";
import { hhmm } from "@/lib/i18n/format";
import type { PauseTarget } from "@/lib/domain";
import type { PauseView } from "@/lib/ui/engineeringHub";
import { reasonKey, usePauseAction, type PauseInfo } from "@/components/PauseControl";
import { HkPauseControl } from "@/components/hk/HkParts";
import { Banner, Button } from "@/components/ui";

/**
 * Pausieren/Fortsetzen im Glas-Detail — derselbe Mechanismus wie `PauseControl` (`usePauseAction`, `POST /api/work/pause`).
 * Pausiert: Hinweis mit Grund/Zeit + „Fortsetzen“; sonst „Pausieren“ mit festem Grund (`HkPauseControl`).
 */
export function RolePause({ targetType, targetId, pause, onChanged }: { targetType: PauseTarget; targetId: string; pause: PauseView | null; onChanged: (p: PauseInfo | null) => void }) {
  const { t } = useLocale();
  const { busy, error, send } = usePauseAction(targetType, targetId, onChanged);
  if (!pause) return <HkPauseControl targetType={targetType} targetId={targetId} canPause onChanged={onChanged} />;
  const detail = [pause.reason ? t(reasonKey(pause.reason)) : null, t("work.pausedSince", { time: hhmm(pause.since) }), pause.byName ? t("work.pausedBy", { name: pause.byName }) : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex flex-col gap-3" data-testid="pause-control">
      <Banner tone="warning" icon="pause" title={t("work.paused")} detail={detail} />
      <Button variant="secondary" icon="play" block onClick={() => send("resume")} disabled={busy}>
        {t("work.resume")}
      </Button>
      {error && <p role="alert" className="text-body-16 text-status-danger-fg">{error}</p>}
    </div>
  );
}
