"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/components/api";
import RoomDetailModal, { type SearchedRoom } from "@/components/RoomDetailModal";
import RoomEditPanel from "@/components/RoomEditPanel";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import { useSocket } from "@/components/useSocket";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { RoomDetail } from "@/lib/rooms/roomDetail";
import PauseControl from "@/components/PauseControl";
import RoomDayInfo from "./RoomDayInfo";

/**
 * Das gemeinsame Zimmer-Detail-Modal (RoomDetailModal) für die Live-Listen, mit Bearbeiten-Bereich. Lädt das Zimmer selbst
 * (`GET /api/rooms/[id]/detail`, Id oder Nummer), bleibt live (Socket.IO) und meldet jede Änderung an die Liste zurück.
 */
/**
 * Das Modal hängt am `body`: die Live-Listen liegen in Karten mit Animation/Transform, und ein `fixed`-Fenster innerhalb eines
 * transformierten Elternelements würde sich daran statt am Bildschirm ausrichten (Fenster erschien weit unten auf der Seite).
 */
export default function LiveRoomModal(props: { roomRef: string; onClose: () => void; onChanged?: () => void }) {
  return createPortal(<LiveRoomModalInner {...props} />, document.body);
}

function LiveRoomModalInner({ roomRef, onClose, onChanged }: { roomRef: string; onClose: () => void; onChanged?: () => void }) {
  const { t } = useLocale();
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    try { setRoom((await api<{ room: RoomDetail }>(`/api/rooms/${encodeURIComponent(roomRef)}/detail`)).room); setFailed(false); }
    catch { setFailed(true); }
  }, [roomRef]);
  useEffect(() => { void load(); }, [load]);
  const soon = useCoalescedRefetch(() => { void load(); }, 800);
  type Payload = { roomNumber?: string; note?: { roomId?: string }; room?: { id?: string; number?: string } } | undefined;
  const mine = (p: Payload) => !p || !room
    || p.roomNumber === room.number || p.room?.id === room.id || p.room?.number === room.number || p.note?.roomId === room.id;
  useSocket({
    "room:update": (p: Payload) => { if (mine(p)) soon(); },
    "trace:update": (p: Payload) => { if (mine(p)) soon(); },
    "note:new": (p: Payload) => { if (mine(p)) soon(); },
    "note:update": (p: Payload) => { if (mine(p)) soon(); },
    "assignments:applied": () => soon(),
    "work:pause": (p: { roomId?: string } | undefined) => { if (!p || !room || p.roomId === room.id) soon(); },
  });

  if (!room) {
    return failed
      ? <RoomDetailModal onClose={onClose} room={{ id: "", number: roomRef, floor: 0, section: "", type: "STANDARD", status: "DIRTY", isCheckoutToday: false, openNotesCount: 0, arrivals: [], notes: [], defects: [] }} editor={<p role="alert" className="mt-3 text-sm text-status-out-of-order">{t("roomEdit.failed")}</p>} />
      : null;
  }
  const searched: SearchedRoom = {
    id: room.id, number: room.number, floor: room.floor, section: room.section, type: room.type, status: room.status,
    occupancy: room.occupancy, blockReason: room.blockReason, reworkNote: room.reworkNote, oooUntil: room.oooUntil,
    isCheckoutToday: room.isCheckoutToday, openNotesCount: room.notes.filter((n) => n.status === "OPEN").length,
    assignedTo: room.assignedTo, arrivals: [], notes: room.notes, defects: room.defects, guestDndActive: room.guestDndActive, guestRequests: room.guestRequests,
    pause: room.pause,
  };
  // Supervisor/Duty Manager sehen die Pause mit Grund und können fortsetzen (oder ein begonnenes Zimmer pausieren).
  const pauseCtl = (room.pause || room.status === "IN_PROGRESS") && (
    <PauseControl targetType="ROOM" targetId={room.id} pause={room.pause} canPause={room.status === "IN_PROGRESS"} onChanged={() => { void load(); onChanged?.(); }} />
  );
  return (
    <RoomDetailModal room={searched} onClose={onClose}
      summary={<RoomDayInfo day={room.day} />}
      actions={pauseCtl ? { extra: pauseCtl } : undefined}
      task={room.canMessage ? { type: "ROOM", id: room.id } : undefined}
      editor={<RoomEditPanel room={room} onChanged={async () => { await load(); onChanged?.(); }} />} />
  );
}
