"use client";

import { useId, type ReactNode } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import { hhmm, dateTime } from "@/lib/i18n/format";
import type { BlockReason } from "@/lib/domain";
import { STATUS_UI } from "@/lib/ui/status";
import { withoutLeadingSymbol } from "@/lib/ui/hkHub";
import { ROOM_FLAG_UI, assignedLabel, guestRequestIcon, roomWindowFlags, roomWindowStatus, windowGuestName } from "@/lib/ui/roomWindow";
import { Banner, Button, Glyph, Pill, SectionLabel, StatusChip } from "@/components/ui";
import { cx, FOCUS_RING } from "@/components/ui/primitives";
import { Overlay } from "@/components/shell/Overlay";
import { useBreakpoint } from "@/components/shell/useBreakpoint";
import ErrorBoundary from "@/components/ErrorBoundary";
import { HkNoteThread } from "@/components/hk/HkParts";
import { reasonKey } from "@/components/PauseControl";
import type { PauseTarget } from "@/lib/domain";
import type { RoomDetailActions, SearchedRoom } from "@/components/RoomDetailModal";

/**
 * Schließen im Glas-Fenster: Symbol **und** Wort, Tippfläche ≥ 48 px, sichtbarer Fokusring
 * (gleiche Regel wie `CloseButton`, nur in Glas-Token).
 */
export function GlassCloseButton({ onClick }: { onClick: () => void }) {
  const { t } = useLocale();
  return (
    <button
      type="button"
      onClick={onClick}
      title={t("common.close")}
      className={cx(
        "press glass-fill text-body-16 inline-flex min-h-(--size-touch-min) min-w-(--size-touch-min) shrink-0 items-center justify-center gap-2 rounded-pill border border-border-subtle px-4 text-text-primary",
        FOCUS_RING,
      )}
    >
      <Glyph name="x" size={20} />
      <span>{t("common.close")}</span>
    </button>
  );
}

/**
 * Rahmen des Zimmer-Fensters im Glas-Stil (D7) auf `shell/Overlay` (Portal an <body>, Escape, Fokusfalle, Fokus zurück):
 * Handy (< 640 px) Bottom-Sheet mit Griff, sonst Dialog in der Mitte. Kopf steht fest, nur der Inhalt scrollt.
 * Inhalt steckt in einer ErrorBoundary — ein Renderfehler lässt das Fenster nie leer.
 */
export function GlassRoomWindow({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  const id = useId();
  const bp = useBreakpoint();
  if (!bp) return null;
  const phone = bp === "phone";
  return (
    <Overlay placement={phone ? "sheet" : "center"} onClose={onClose} labelledBy={`${id}-title`} className={phone ? "w-full" : "w-full max-w-[680px]"}>
      <div
        data-testid="room-window"
        className={cx(
          "glass flex flex-col gap-4",
          phone
            ? "max-h-[92dvh] rounded-t-(--glass-radius-xl) rounded-b-none px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            : "max-h-[90dvh] rounded-(--glass-radius-lg) p-6",
        )}
      >
        {phone && <span aria-hidden="true" className="mx-auto h-[5px] w-11 shrink-0 rounded-pill bg-surface-progress-track" />}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id={`${id}-title`} className="text-title-28 truncate text-text-primary">{title}</h2>
            {subtitle && <p className="text-body-16 text-text-secondary">{subtitle}</p>}
          </div>
          <GlassCloseButton onClick={onClose} />
        </div>
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-1">
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
      </div>
    </Overlay>
  );
}

const section = "flex flex-col gap-2 border-t border-border-subtle pt-4";

/**
 * Inhalt des gemeinsamen Zimmer-Fensters im Glas-Stil (Figma `41:2140` als Vorlage): Kennzeichen, Status mit Symbol + Text,
 * Pause/DND/Nacharbeit als Hinweis, „Heute“ (Slot `summary`), ein goldener Hauptknopf, Nebenaktionen, Zuständig, Anreisen
 * (Gast nur „Anrede Titel Nachname“), Mängel, Gastanfragen, Bearbeiten (Slot `editor`) und Notizen (`HkNoteThread`).
 * Gleiche Daten und Slots wie die helle Fassung — reine Darstellung.
 */
export function RoomDetailGlass({
  room,
  onClose,
  actions,
  editor,
  summary,
  task,
}: {
  room: SearchedRoom;
  onClose: () => void;
  actions?: RoomDetailActions;
  editor?: ReactNode;
  summary?: ReactNode;
  task?: { type: PauseTarget; id: string };
}) {
  const { t } = useLocale();
  const notes = Array.isArray(room.notes) ? room.notes : [];
  const arrivals = Array.isArray(room.arrivals) ? room.arrivals : [];
  const defects = Array.isArray(room.defects) ? room.defects : [];
  const guestRequests = Array.isArray(room.guestRequests) ? room.guestRequests : [];
  const shown = roomWindowStatus({ status: room.status, blockReason: room.blockReason, paused: !!room.pause, guestDnd: !!room.guestDndActive });
  const flags = roomWindowFlags({ occupancy: room.occupancy, isCheckoutToday: room.isCheckoutToday, defects: defects.length, shown });
  const assigned = assignedLabel(room.assignedTo);
  const pauseText = room.pause
    ? [room.pause.reason ? t(reasonKey(room.pause.reason)) : null, t("work.pausedSince", { time: hhmm(room.pause.since) }), room.pause.byName ? t("work.pausedBy", { name: room.pause.byName }) : null].filter(Boolean).join(" · ")
    : null;
  const subtitle = [room.floor ? t("supervisor.floorN", { floor: room.floor }) : null, room.section || null, t(`roomType.${room.type}` as TKey)].filter(Boolean).join(" · ");

  return (
    <GlassRoomWindow title={t("hkHub.roomTitle", { n: room.number })} subtitle={subtitle} onClose={onClose}>
      <div className="flex flex-col gap-4" data-testid="room-detail-glass">
        {flags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {flags.map((f) => (
              <Pill key={f} tone={ROOM_FLAG_UI[f].tone} className="gap-1.5">
                <Glyph name={ROOM_FLAG_UI[f].icon} size={16} />
                {t(ROOM_FLAG_UI[f].labelKey)}
              </Pill>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <StatusChip status={shown} label={t(STATUS_UI[shown].labelKey)} />
          <span className="text-body-16 text-text-secondary">
            {t(`status.${room.status}` as TKey)}
            {room.blockReason && ` · ${t(`blockReason.${room.blockReason as BlockReason}` as TKey)}`}
          </span>
        </div>

        {pauseText && <Banner tone="warning" icon="pause" title={t("ui.status.paused")} detail={pauseText} />}
        {room.guestDndActive && <Banner tone="warning" icon="moon" title={withoutLeadingSymbol(t("supervisor.guestDndBanner"))} />}
        {room.oooUntil && <p className="text-label text-text-muted">{t("supervisor.oooUntil", { date: dateTime(room.oooUntil) })}</p>}
        {room.reworkNote && room.status === "PICKUP" && <Banner tone="warning" icon="refresh" title={t("attendant.reworkNote")} detail={room.reworkNote} />}

        {summary}

        {actions?.priority && actions.priority.score > 0 && (
          <section className={section}>
            <p className="text-label flex items-center gap-2 text-status-warning-fg">
              <Glyph name="zap" size={18} />
              {t("attendant.priorityScore", { score: actions.priority.score, minutes: actions.priority.estimatedMinutes })}
            </p>
            <ul className="flex flex-col gap-1">
              {actions.priority.reasons.map((r, i) => (
                <li key={i} className="text-label text-text-secondary">
                  <span className="text-accent-text">+{r.points}</span> {r.reason}
                </li>
              ))}
            </ul>
          </section>
        )}

        {actions && (actions.primary || actions.onBlock || actions.onReportDefect) && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {actions.primary && (
              <Button block className="sm:col-span-2" onClick={actions.primary.onClick} disabled={actions.busy}>
                {actions.busy ? "…" : withoutLeadingSymbol(actions.primary.label)}
              </Button>
            )}
            {actions.onBlock && (
              <Button variant="secondary" icon="moon" block onClick={actions.onBlock} disabled={actions.busy}>
                {actions.blockLabel ?? t("attendant.blockedAction")}
              </Button>
            )}
            {actions.onReportDefect && (
              <Button variant="secondary" icon="wrench" block onClick={actions.onReportDefect}>
                {actions.defectLabel ?? t("attendant.defectAction")}
              </Button>
            )}
          </div>
        )}
        {actions?.extra && <div className="flex flex-col gap-3">{actions.extra}</div>}

        <section className={section}>
          <SectionLabel as="h3" icon="users" title={t("supervisor.assignedAttendant")} />
          <p className="text-body-16 text-text-primary">{assigned ?? t("supervisor.unassignedOption")}</p>
        </section>

        {arrivals.length > 0 && (
          <section className={section}>
            <SectionLabel as="h3" icon="log-in" title={t("supervisor.expectedArrivals")} />
            <ul className="flex flex-col gap-2">
              {arrivals.map((a, i) => (
                <li key={i} className="text-body-16 flex flex-wrap items-center gap-x-3 gap-y-1 text-text-primary">
                  <Glyph name="user" size={20} className="shrink-0 text-text-secondary" />
                  <span>{windowGuestName(a.guestName) ?? "—"}</span>
                  {a.vip && <Pill tone="accent" className="gap-1.5"><Glyph name="star" size={14} />{t("lists.vip")}</Pill>}
                  {a.eta && (
                    <span className="inline-flex items-center gap-1.5 text-text-secondary">
                      <Glyph name="clock" size={18} />
                      {t("hkHub.arrivalAt", { time: hhmm(a.eta) })}
                    </span>
                  )}
                  {a.neededNow && <Pill tone="warning" className="gap-1.5"><Glyph name="zap" size={14} />{withoutLeadingSymbol(t("supervisor.neededNowFlag"))}</Pill>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {defects.length > 0 && (
          <section className={section}>
            <SectionLabel as="h3" icon="wrench" title={t("supervisor.defectsTitle")} />
            <ul className="flex flex-col gap-2">
              {defects.map((d) => (
                <li key={d.id} className="text-body-16 break-words text-text-secondary">
                  <span className="text-text-primary">{t(`defectCategory.${d.category}` as TKey)}</span>: {d.note}
                  {d.workOrder && <span className="text-label ms-2 text-text-muted">[{t(`workOrderStatus.${d.workOrder.status}` as TKey)}]</span>}
                  {d.reportedBy?.role === "guest" && <span className="text-label ms-2 text-status-warning-fg">{t("supervisor.reportedByGuest")}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {guestRequests.length > 0 && (
          <section className={section}>
            <SectionLabel as="h3" icon="bell" title={t("supervisor.guestRequestsTitle")} />
            <ul className="flex flex-col gap-2">
              {guestRequests.map((r) => (
                <li key={r.id} className="text-body-16 flex items-center gap-3 text-text-primary">
                  <Glyph name={guestRequestIcon(r.kind)} size={20} className="shrink-0 text-accent-text" />
                  <span>{t(`guestRequestKind.${r.kind}` as TKey)}</span>
                  <span className="text-label text-text-muted">{t(`guestRequestStatus.${r.status}` as TKey)} · {hhmm(r.createdAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {editor}

        {room.id && (
          <section className={section}>
            <HkNoteThread
              key={notes.map((n) => `${n.id}${n.status}`).join()}
              roomId={room.id}
              initialNotes={notes}
              onNoteAdded={actions?.onNoteAdded}
              onNoteUpdated={actions?.onNoteUpdated}
              task={task}
            />
          </section>
        )}
      </div>
    </GlassRoomWindow>
  );
}
