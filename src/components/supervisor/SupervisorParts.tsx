"use client";

import type { ReactNode } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { hhmm } from "@/lib/i18n/format";
import { Button, GlassCard, Pill } from "@/components/ui";
import { cx, FOCUS_RING } from "@/components/ui/primitives";

export interface ReleaseRoom {
  id: string;
  number: string;
  waitingMin: number;
  arrival?: { guestName: string; eta?: string | null; vip: boolean } | null;
}

/**
 * Freigabe-Warteschlange (Zimmer CLEAN → prüfen und freigeben oder zum Nachbessern zurück) als Glas-Karte.
 * Gleiche Aktionen wie bisher; „Alle freigeben“ erst ab zwei Zimmern.
 */
export function ReleaseQueueCard({
  rooms,
  busyRoomId,
  bulkBusy,
  onRelease,
  onRework,
  onReleaseAll,
  onOpen,
}: {
  rooms: ReleaseRoom[];
  busyRoomId: string | null;
  bulkBusy: boolean;
  onRelease: (id: string) => void;
  onRework: (id: string) => void;
  onReleaseAll: () => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useLocale();
  return (
    <GlassCard as="section" aria-labelledby="sup-release-title" warm={rooms.length >= 5} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="sup-release-title" className="text-title-22 text-text-primary">
          {t("supervisor.releaseQueueTitle")} <span className="text-accent-text">{rooms.length}</span>
        </h2>
        {rooms.length > 1 && (
          <Button icon="check" onClick={onReleaseAll} disabled={bulkBusy}>
            {bulkBusy ? t("supervisor.releasing") : t("supervisor.releaseAll", { count: rooms.length })}
          </Button>
        )}
      </div>
      {rooms.length === 0 && <p className="text-body-16 text-text-muted">{t("supervisor.nothingWaiting")}</p>}
      <ul className="flex flex-col gap-3">
        {rooms.map((r) => {
          const busy = busyRoomId === r.id;
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-(--glass-radius-sm) bg-surface-card-raised p-3">
              <button type="button" onClick={() => onOpen(r.id)} className={cx("press flex min-h-(--size-touch-min) min-w-0 flex-1 flex-col items-start text-start", FOCUS_RING)}>
                <span className="text-number text-text-primary">{r.number}</span>
                <span className="text-label text-text-muted">{t("supervisor.waitingMin", { minutes: r.waitingMin })}</span>
                {r.arrival && (
                  <span className="text-body-16 flex flex-wrap items-center gap-2 text-text-secondary">
                    {r.arrival.vip && <Pill tone="accent">VIP</Pill>}
                    {r.arrival.guestName}
                    {r.arrival.eta && ` · ETA ${hhmm(r.arrival.eta)}`}
                  </span>
                )}
              </button>
              <div className="flex gap-2">
                <Button icon="check" className="min-h-12! px-4!" onClick={() => onRelease(r.id)} disabled={busy}>
                  {busy ? "…" : t("supervisor.inspectRelease")}
                </Button>
                <Button variant="secondary" icon="refresh" className="min-h-12! px-4!" onClick={() => onRework(r.id)} disabled={busy}>
                  {t("supervisor.reworkBtn")}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}

/**
 * Bereich mit Bausteinen, die noch im alten hellen Design sind (z. B. „Das ist jetzt wichtig“, Live-Board, Listen,
 * Umverteilung) — auf heller Fläche, damit alter dunkler Text lesbar bleibt (wie `AppShell legacy`). Inhalt unverändert.
 */
export function LegacySurface({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cx("rounded-(--glass-radius-lg) bg-ivory p-3 font-sans text-charcoal sm:p-6", className)}>
      {children}
    </section>
  );
}
