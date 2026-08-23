"use client";

import Modal from "./Modal";
import NoteThread, { type ThreadNote } from "./NoteThread";
import { STATUS_STYLES } from "./status";
import { STATUS_LABELS, type RoomStatus } from "@/lib/domain";

/** The room shape returned by GET /api/rooms — shared by the global quick search. */
export interface SearchedRoom {
  id: string;
  number: string;
  floor: number;
  section: string;
  type: string;
  status: RoomStatus;
  blockReason?: string | null;
  reworkNote?: string | null;
  oooUntil?: string | null;
  isCheckoutToday: boolean;
  openNotesCount: number;
  assignedTo?: { id: string; name: string } | null;
  arrivals: { guestName: string; eta?: string | null; vip: boolean; neededNow: boolean }[];
  notes: ThreadNote[];
  defects: { id: string; category: string; note: string; workOrder?: { status: string } | null }[];
}

/**
 * Read-focused room detail: opened from the global quick search in
 * AppShell, from any dashboard, without navigating away. Status/assignment
 * actions stay supervisor-only in RoomDrawer — this is a lookup, not a
 * second action surface.
 */
export default function RoomDetailModal({ room, onClose }: { room: SearchedRoom; onClose: () => void }) {
  const style = STATUS_STYLES[room.status];

  return (
    <Modal
      title={room.number}
      subtitle={`Floor ${room.floor} · ${room.section} · ${room.type.replace(/_/g, " ")}`}
      onClose={onClose}
    >
      <span className={`inline-block rounded-full border px-3 py-1.5 text-sm font-medium ${style.chip}`}>
        {STATUS_LABELS[room.status]}
        {room.blockReason && ` · ${room.blockReason}`}
      </span>
      {room.oooUntil && (
        <p className="mt-1 text-xs text-graphite/60">OOO until {new Date(room.oooUntil).toLocaleString()}</p>
      )}
      {room.reworkNote && room.status === "PICKUP" && (
        <p className="mt-2 rounded-lg bg-orange-50 p-2 text-sm text-orange-900">Rework: {room.reworkNote}</p>
      )}

      <div className="mt-4">
        <h4 className="mb-1 text-sm font-semibold uppercase tracking-wider text-graphite/60">Assigned attendant</h4>
        <p className="text-sm">{room.assignedTo?.name ?? "— unassigned —"}</p>
      </div>

      {room.arrivals.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-1 text-sm font-semibold uppercase tracking-wider text-graphite/60">Expected arrivals</h4>
          {room.arrivals.map((a, i) => (
            <p key={i} className="text-sm">
              {a.vip && "★ "}
              {a.guestName}
              {a.eta && ` · ETA ${new Date(a.eta).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
              {a.neededNow && " · NEEDED NOW"}
            </p>
          ))}
        </div>
      )}

      {room.defects.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-1 text-sm font-semibold uppercase tracking-wider text-graphite/60">Defects</h4>
          {room.defects.map((d) => (
            <p key={d.id} className="text-sm">
              🔧 {d.category}: {d.note}
              {d.workOrder && <span className="ml-1 text-xs text-graphite/60">[{d.workOrder.status}]</span>}
            </p>
          ))}
        </div>
      )}

      <div className="mt-4">
        <div className="mb-1 flex items-center gap-2">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-graphite/60">Notes</h4>
          {room.openNotesCount > 0 && (
            <span className="rounded-full border border-gold-line/60 bg-gold-soft/40 px-2 py-0.5 text-[0.68rem] font-medium text-gold">
              {room.openNotesCount} open
            </span>
          )}
        </div>
        <NoteThread roomId={room.id} initialNotes={room.notes} />
      </div>
    </Modal>
  );
}
