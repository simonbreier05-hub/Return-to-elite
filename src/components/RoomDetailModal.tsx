"use client";

import Modal from "./Modal";
import NoteCountBadge from "./NoteCountBadge";
import NoteThread, { type ThreadNote } from "./NoteThread";
import { RoomFlagIcons } from "./RoomFlags";
import { StatusIcon } from "./icons";
import { STATUS_STYLES } from "./status";
import type { BlockReason, RoomStatus } from "@/lib/domain";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";

/** The room shape returned by GET /api/rooms — shared by the global quick search. */
export interface SearchedRoom {
  id: string;
  number: string;
  floor: number;
  section: string;
  type: string;
  status: RoomStatus;
  occupancy?: string | null;
  blockReason?: string | null;
  reworkNote?: string | null;
  oooUntil?: string | null;
  isCheckoutToday: boolean;
  openNotesCount: number;
  assignedTo?: { id: string; name: string; dailyNumber?: number | null } | null;
  arrivals: { guestName: string; eta?: string | null; vip: boolean; neededNow: boolean }[];
  notes: ThreadNote[];
  defects: { id: string; category: string; note: string; workOrder?: { status: string } | null }[];
}

/**
 * Optional write-capable slot, supplied only by screens that are allowed to
 * act on the room (currently the attendant's focused Housekeeper-Hub). When
 * omitted, the modal stays the plain read-only lookup it always was — opened
 * from the global quick search, from any dashboard, without navigating away.
 */
export interface RoomDetailActions {
  /** The one-tap next step (start cleaning / mark clean / unblock & start). */
  primary?: { label: string; onClick: () => void } | null;
  busy?: boolean;
  priority?: { score: number; estimatedMinutes: number; reasons: { points: number; reason: string }[] };
  onBlock?: () => void;
  blockLabel?: string;
  onReportDefect?: () => void;
  defectLabel?: string;
  onNoteAdded?: (note: ThreadNote) => void;
  onNoteUpdated?: (note: ThreadNote) => void;
}

export default function RoomDetailModal({
  room,
  onClose,
  actions,
}: {
  room: SearchedRoom;
  onClose: () => void;
  actions?: RoomDetailActions;
}) {
  const { t } = useLocale();
  const style = STATUS_STYLES[room.status];

  return (
    <Modal
      title={room.number}
      subtitle={`${t("supervisor.floorN", { floor: room.floor })} · ${room.section} · ${t(`roomType.${room.type}` as TKey)}`}
      onClose={onClose}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium ${style.chip}`}>
          <StatusIcon iconKey={style.iconKey} className="h-4 w-4 shrink-0" />
          {t(`status.${room.status}` as TKey)}
          {room.blockReason && ` · ${t(`blockReason.${room.blockReason as BlockReason}` as TKey)}`}
        </span>
        <RoomFlagIcons occupancy={room.occupancy} isCheckoutToday={room.isCheckoutToday} />
      </div>
      {room.oooUntil && (
        <p className="mt-1 text-xs text-graphite/60">
          {t("supervisor.oooUntil", { date: new Date(room.oooUntil).toLocaleString() })}
        </p>
      )}
      {room.reworkNote && room.status === "PICKUP" && (
        <p className="mt-2 rounded-lg bg-status-pickup/10 p-2 text-sm text-status-pickup">
          {t("attendant.reworkNote")} {room.reworkNote}
        </p>
      )}

      {actions?.priority && actions.priority.score > 0 && (
        <div className="mt-3 rounded-lg border border-gold/30 bg-ivory p-3 text-xs text-graphite">
          <p className="mb-1 font-medium text-graphite">
            {t("attendant.priorityScore", { score: actions.priority.score, minutes: actions.priority.estimatedMinutes })}
          </p>
          <ul className="space-y-1">
            {actions.priority.reasons.map((r, i) => (
              <li key={i}>
                <span className="font-semibold text-gold">+{r.points}</span> {r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {actions && (actions.primary || actions.onBlock || actions.onReportDefect) && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {actions.primary && (
            <button
              onClick={actions.primary.onClick}
              disabled={actions.busy}
              className="col-span-2 h-14 rounded-xl bg-status-in-progress text-lg font-semibold text-linen transition active:scale-[0.98] disabled:opacity-50"
            >
              {actions.busy ? "…" : actions.primary.label}
            </button>
          )}
          {actions.onBlock && (
            <button
              onClick={actions.onBlock}
              disabled={actions.busy}
              className="h-12 rounded-xl border-2 border-status-blocked text-sm font-medium text-status-blocked transition active:scale-[0.98] disabled:opacity-50"
            >
              {actions.blockLabel ?? t("attendant.blockedAction")}
            </button>
          )}
          {actions.onReportDefect && (
            <button
              onClick={actions.onReportDefect}
              className="h-12 rounded-xl border-2 border-status-defect text-sm font-medium text-status-defect transition active:scale-[0.98]"
            >
              {actions.defectLabel ?? t("attendant.defectAction")}
            </button>
          )}
        </div>
      )}

      <div className="mt-4">
        <h4 className="mb-1 text-sm font-semibold uppercase tracking-wider text-graphite/60">{t("supervisor.assignedAttendant")}</h4>
        <p className="text-sm">
          {room.assignedTo
            ? room.assignedTo.dailyNumber
              ? `#${room.assignedTo.dailyNumber} ${room.assignedTo.name}`
              : room.assignedTo.name
            : t("supervisor.unassignedOption")}
        </p>
      </div>

      {room.arrivals.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-1 text-sm font-semibold uppercase tracking-wider text-graphite/60">{t("supervisor.expectedArrivals")}</h4>
          {room.arrivals.map((a, i) => (
            <p key={i} className="text-sm">
              {a.vip && "★ "}
              {a.guestName}
              {a.eta && ` · ETA ${new Date(a.eta).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
              {a.neededNow && ` ${t("supervisor.neededNowFlag")}`}
            </p>
          ))}
        </div>
      )}

      {room.defects.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-1 text-sm font-semibold uppercase tracking-wider text-graphite/60">{t("supervisor.defectsTitle")}</h4>
          {room.defects.map((d) => (
            <p key={d.id} className="text-sm">
              🔧 {t(`defectCategory.${d.category}` as TKey)}: {d.note}
              {d.workOrder && <span className="ml-1 text-xs text-graphite/60">[{t(`workOrderStatus.${d.workOrder.status}` as TKey)}]</span>}
            </p>
          ))}
        </div>
      )}

      <div className="mt-4">
        <div className="mb-1 flex items-center gap-2">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-graphite/60">{t("supervisor.notesTitle")}</h4>
          <NoteCountBadge openCount={room.openNotesCount} totalCount={room.notes.length} />
        </div>
        <NoteThread roomId={room.id} initialNotes={room.notes} onNoteAdded={actions?.onNoteAdded} onNoteUpdated={actions?.onNoteUpdated} />
      </div>
    </Modal>
  );
}
