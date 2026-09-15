"use client";

import { useState } from "react";
import { api } from "./api";
import type { SearchedRoom } from "./RoomDetailModal";

/**
 * Opens RoomDetailModal for a room this view only holds a number/id for
 * (front office, concierge, engineering — none of which fetch the full room
 * shape themselves). Reuses the same GET /api/rooms?q= endpoint the global
 * quick search in AppShell already calls; `q` is an exact number here, not
 * a partial, so the first/only match is the room in question.
 */
export function useRoomLookup() {
  const [room, setRoom] = useState<SearchedRoom | null>(null);
  const [loading, setLoading] = useState(false);

  const open = async (number: string) => {
    setLoading(true);
    try {
      const data = await api<{ rooms: SearchedRoom[] }>(`/api/rooms?q=${encodeURIComponent(number)}`);
      setRoom(data.rooms.find((r) => r.number === number) ?? data.rooms[0] ?? null);
    } finally {
      setLoading(false);
    }
  };

  return { room, loading, open, close: () => setRoom(null) };
}
