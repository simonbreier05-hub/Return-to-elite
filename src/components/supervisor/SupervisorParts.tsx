"use client";

import { useId, type ReactNode } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { hhmm } from "@/lib/i18n/format";
import { withoutLeadingSymbol } from "@/lib/ui/hkHub";
import { Button, GlassCard, Pill } from "@/components/ui";
import { cx, FOCUS_RING, Glyph, TONE_FG } from "@/components/ui/primitives";
import { ROOM_STATUS_UI, STATUS_UI } from "@/lib/ui/status";
import type { RoomStatus } from "@/lib/domain";

export interface ReleaseRoom {
  id: string;
  number: string;
  waitingMin: number;
  arrival?: { guestName: string; eta?: string | null; vip: boolean } | null;
}

/**
 * Freigabe-Warteschlange (Zimmer CLEAN → prüfen und freigeben oder zum Nachbessern zurück) als Glas-Karte.
 * Betrieb L2 (Punkt 5, Meeting 13.11.): jedes Zimmer wird einzeln abgenommen — „Alle freigeben“ gibt es nicht mehr.
 * Ablehnen = Nacharbeit an dieselbe Kraft mit Pflicht-Grund (`REWORK_NOTE_REQUIRED`).
 */
export function ReleaseQueueCard({
  rooms,
  busyRoomId,
  onRelease,
  onRework,
  onOpen,
}: {
  rooms: ReleaseRoom[];
  busyRoomId: string | null;
  onRelease: (id: string) => void;
  onRework: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useLocale();
  return (
    <GlassCard as="section" aria-labelledby="sup-release-title" warm={rooms.length >= 5} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="sup-release-title" className="text-title-22 text-text-primary">
          {t("supervisor.releaseQueueTitle")} <span className="text-accent-text">{rooms.length}</span>
        </h2>
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
                  {busy ? "…" : withoutLeadingSymbol(t("supervisor.inspectRelease"))}
                </Button>
                <Button variant="secondary" icon="refresh" className="min-h-12! px-4!" onClick={() => onRework(r.id)} disabled={busy}>
                  {withoutLeadingSymbol(t("supervisor.reworkBtn"))}
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
 * Zimmer im Live-Board (Status-Raster, D3b): Nummer + Status-Symbol (Ton aus `ROOM_STATUS_UI`), darunter Bereich bzw.
 * Sperrgrund; kleine Marker für VIP, Gast-DND, Kraft im Zimmer und offene Notizen. Alles steht zusätzlich im Vorlesetext.
 */
export function StatusTile({
  number, status, statusLabel, sub, vip, guestDnd, here, notes, busy, label, onClick,
}: {
  number: string; status: RoomStatus; statusLabel: string; sub?: string; vip?: boolean; guestDnd?: boolean;
  here?: boolean; notes?: number; busy?: boolean; label: string; onClick: () => void;
}) {
  const ui = STATUS_UI[ROOM_STATUS_UI[status]];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cx("press glass relative flex h-[76px] w-full flex-col items-center justify-center gap-0.5 rounded-(--glass-radius-sm) px-1", busy && "opacity-60", FOCUS_RING)}
    >
      <span className="text-body-16 text-text-primary">{number}</span>
      <span className="flex items-center gap-1">
        <Glyph name={ui.icon} size={18} className={TONE_FG[ui.tone]} />
        <span className="sr-only">{statusLabel}</span>
      </span>
      {sub && <span className="text-label max-w-full truncate text-text-muted">{sub}</span>}
      <span aria-hidden="true" className="absolute start-1 top-1 flex gap-0.5">
        {vip && <Glyph name="star" size={14} className="text-accent-text" />}
        {here && <Glyph name="user" size={14} className="text-text-secondary" />}
      </span>
      <span aria-hidden="true" className="absolute end-1 top-1 flex gap-0.5">
        {guestDnd && <Glyph name="moon" size={14} className="text-status-danger-fg" />}
        {(notes ?? 0) > 0 && <Glyph name="message" size={14} className="text-status-info-fg" />}
      </span>
    </button>
  );
}

/** Legende des Status-Rasters: Symbol + Wort je Status, dazu die Marker (nie nur Farbe). */
export function StatusLegend({ statuses, labelOf, markerLabels }: { statuses: RoomStatus[]; labelOf: (s: RoomStatus) => string; markerLabels: { vip: string; here: string; guestDnd: string; notes: string } }) {
  const item = (icon: Parameters<typeof Glyph>[0]["name"], tone: string, text: string) => (
    <li key={text} className="flex items-center gap-1.5"><Glyph name={icon} size={16} className={tone} />{text}</li>
  );
  return (
    <ul className="text-label flex flex-wrap gap-x-4 gap-y-2 text-text-secondary">
      {statuses.map((s) => {
        const ui = STATUS_UI[ROOM_STATUS_UI[s]];
        return item(ui.icon, TONE_FG[ui.tone], labelOf(s));
      })}
      {item("star", "text-accent-text", markerLabels.vip)}
      {item("user", "text-text-secondary", markerLabels.here)}
      {item("moon", "text-status-danger-fg", markerLabels.guestDnd)}
      {item("message", "text-status-info-fg", markerLabels.notes)}
    </ul>
  );
}

/** Auswahlfeld im Glas-Stil (wie `Field`: Label darüber, Höhe ≥ 48, Token-Farben). */
export function GlassSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="text-label text-text-muted">{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cx("text-body-16 min-h-(--size-touch-min) w-full rounded-(--glass-radius-md) border border-border-subtle bg-surface-card-raised px-4 text-text-primary", FOCUS_RING)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
