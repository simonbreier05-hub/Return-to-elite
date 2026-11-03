"use client";

import { useLocale } from "@/lib/i18n/LocaleContext";
import { useRedistribution } from "@/components/RedistributionCards";
import { Button, GlassCard, Pill } from "@/components/ui";
import { cx, FOCUS_RING } from "@/components/ui/primitives";

/**
 * Umverteilungsvorschläge im Glas-Design: gekennzeichnet als „Vorschlag“ (Pille Accent) — das System schlägt vor,
 * der Supervisor entscheidet (Bestätigen / Ändern / Ablehnen). Gleiche Logik wie `RedistributionCards` (`useRedistribution`).
 * Rendert nichts, wenn nichts offen ist.
 */
export function GlassRedistribution() {
  const { t } = useLocale();
  const r = useRedistribution();
  if (!r.items.length) return null;
  return (
    <GlassCard as="section" warm aria-label={t("redist.banner", { n: r.items.length })} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3" role="status">
        <Pill tone="accent">{t("supHub.suggestion")}</Pill>
        <span className="text-body-18 text-text-primary">{t("redist.banner", { n: r.items.length })}</span>
      </div>
      {r.error && <p role="alert" className="text-body-16 text-status-danger-fg">{r.error}</p>}
      {r.items.map((s) => (
        <div key={s.id} className="flex flex-col gap-3 rounded-(--glass-radius-sm) bg-surface-card-raised p-4">
          <p className="text-title-22 text-text-primary">{r.head(s)}</p>
          <ul className="flex flex-col gap-2">
            {s.moves.map((m) => (
              <li key={m.roomId} className="text-body-16 flex flex-wrap items-center gap-2 text-text-secondary">
                <span>{r.moveText(s, m)}</span>
                {r.editing === s.id && (
                  <select
                    aria-label={m.roomNumber}
                    value={r.override[m.roomId] ?? m.toId}
                    onChange={(e) => r.setTarget(m.roomId, e.target.value)}
                    className={cx("text-body-16 min-h-(--size-touch-min) rounded-(--glass-radius-md) border border-border-subtle bg-surface-card-raised px-3 text-text-primary", FOCUS_RING)}
                  >
                    {r.attendants.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            ))}
          </ul>
          <p className="text-label text-text-muted">{t("redist.startedStay")}</p>
          <div className="flex flex-wrap gap-3">
            <Button icon="check" disabled={r.busy} onClick={() => r.decide(s, "confirm")}>
              {t("redist.confirm")}
            </Button>
            <Button variant="secondary" icon="refresh" disabled={r.busy} onClick={() => r.toggleEdit(s.id)}>
              {t("redist.change")}
            </Button>
            <Button variant="secondary" icon="x" disabled={r.busy} onClick={() => r.decide(s, "reject")}>
              {t("redist.reject")}
            </Button>
          </div>
        </div>
      ))}
    </GlassCard>
  );
}
