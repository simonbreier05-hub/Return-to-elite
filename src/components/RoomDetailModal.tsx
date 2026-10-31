"use client";

import type { ReactNode } from "react";
import Modal from "./Modal";
import NoteCountBadge from "./NoteCountBadge";
import NoteThread, { type ThreadNote } from "./NoteThread";
import { RoomFlagIcons } from "./RoomFlags";
import { StatusIcon, IconBellSlash } from "./icons";
import { STATUS_STYLES } from "./status";
import type { BlockReason, PauseTarget, RoomStatus } from "@/lib/domain";
import { PauseBadge, type PauseInfo } from "./PauseControl";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import { hhmm, dateTime } from "@/lib/i18n/format";

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
  defects: {
    id: string;
    category: string;
    note: string;
    workOrder?: { status: string } | null;
    reportedBy?: { name: string; role: string } | null;
  }[];
  /** Open guest "Bitte nicht stören" request (Prompt G2 Teil 4) — never Room.status/blockReason. */
  guestDndActive?: boolean;
  /** This room's still-open guest requests (Prompt G2 Teil 4's "Zimmer-Logbuch" view). */
  guestRequests?: { id: string; kind: string; detail: string | null; status: string; createdAt: string }[];
  /** Aktive Pause (WorkPause) — Status bleibt, die Arbeit ruht. */
  pause?: PauseInfo | null;
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
  /** Unter den Hauptknöpfen: Pausieren/Fortsetzen, Zurückspulen (Housekeeper-Hub). */
  extra?: ReactNode;
}

export default function RoomDetailModal({
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
  /** Bearbeiten-Bereich (nur Duty Manager/Supervisor, siehe RoomEditPanel) — ohne ihn bleibt das Modal reine Ansicht. */
  editor?: ReactNode;
  /** Tagesinfos direkt unter dem Status (Art, Wäsche, VIP, Gast-Kurzname, Traces — RoomDayInfo). */
  summary?: ReactNode;
  /** Aufgabe, an die der Verlauf Nachrichten schreibt (Arbeits-Bildschirme); ohne bleibt er ein reiner Notiz-Verlauf. */
  task?: { type: PauseTarget; id: string };
}) {
  const { t } = useLocale();
  // Absturzsicher: unvollständige Antworten (fehlende Listen, unbekannter Status) dürfen das Modal nicht sprengen.
  const style = STATUS_STYLES[room.status] ?? STATUS_STYLES.DIRTY;
  const notes = Array.isArray(room.notes) ? room.notes : [];
  const arrivals = Array.isArray(room.arrivals) ? room.arrivals : [];
  const defects = Array.isArray(room.defects) ? room.defects : [];

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
      {room.pause && <div className="mt-2"><PauseBadge pause={room.pause} showBy /></div>}
      {summary}
      {room.guestDndActive && (
        <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-status-out-of-order/10 p-2 text-sm font-medium text-status-out-of-order">
          <IconBellSlash className="h-4 w-4 shrink-0" />
          {t("supervisor.guestDndBanner")}
        </p>
      )}
      {room.oooUntil && (
        <p className="mt-1 text-xs text-graphite/60">
          {t("supervisor.oooUntil", { date: dateTime(room.oooUntil) })}
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
      {actions?.extra && <div className="mt-2 space-y-2">{actions.extra}</div>}

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

      {arrivals.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-1 text-sm font-semibold uppercase tracking-wider text-graphite/60">{t("supervisor.expectedArrivals")}</h4>
          {arrivals.map((a, i) => (
            <p key={i} className="text-sm">
              {a.vip && "★ "}
              {a.guestName}
              {a.eta && ` · ETA ${hhmm(a.eta)}`}
              {a.neededNow && ` ${t("supervisor.neededNowFlag")}`}
            </p>
          ))}
        </div>
      )}

      {defects.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-1 text-sm font-semibold uppercase tracking-wider text-graphite/60">{t("supervisor.defectsTitle")}</h4>
          {defects.map((d) => (
            <p key={d.id} className="text-sm">
              🔧 {t(`defectCategory.${d.category}` as TKey)}: {d.note}
              {d.workOrder && <span className="ml-1 text-xs text-graphite/60">[{t(`workOrderStatus.${d.workOrder.status}` as TKey)}]</span>}
              {d.reportedBy?.role === "guest" && (
                <span className="ml-1 text-xs font-medium text-status-out-of-order">{t("supervisor.reportedByGuest")}</span>
              )}
            </p>
          ))}
        </div>
      )}

      {room.guestRequests && room.guestRequests.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-1 text-sm font-semibold uppercase tracking-wider text-graphite/60">{t("supervisor.guestRequestsTitle")}</h4>
          {room.guestRequests.map((r) => (
            <p key={r.id} className="text-sm">
              {r.kind === "DND" ? "🔕" : r.kind === "CLEAN_REQUEST" ? "✨" : "💬"}{" "}
              {t(`guestRequestKind.${r.kind}` as TKey)}
              <span className="ml-1 text-xs text-graphite/60">
                [{t(`guestRequestStatus.${r.status}` as TKey)} · {hhmm(r.createdAt)}]
              </span>
            </p>
          ))}
        </div>
      )}

      {editor}

      <div className="mt-4">
        <div className="mb-1 flex items-center gap-2">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-graphite/60">{t("supervisor.notesTitle")}</h4>
          <NoteCountBadge openCount={room.openNotesCount ?? 0} totalCount={notes.length} />
        </div>
        <NoteThread key={notes.map((n) => `${n.id}${n.status}`).join()} roomId={room.id} initialNotes={notes} onNoteAdded={actions?.onNoteAdded} onNoteUpdated={actions?.onNoteUpdated} task={task} />
      </div>
    </Modal>
  );
}
