"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";

export interface GuestStatusItem {
  id: string;
  kind: "DND" | "CLEAN_REQUEST" | "CONTACT" | "DEFECT" | "NOTE";
  detail: string | null;
  status: "RECEIVED" | "IN_PROGRESS" | "DONE" | "CANCELLED";
  createdAt: string;
}

interface FeedResponse {
  items: GuestStatusItem[];
  activeDnd: { id: string; detail: string | null } | null;
}

const POLL_MS = 15_000;

/**
 * Polls this room's own request status (Prompt G2 Teil 3:
 * "Live-Aktualisierung") — see the comment on
 * src/app/api/guest/r/[roomCode]/status/route.ts for why this polls a
 * narrow, access-checked endpoint instead of subscribing to the staff
 * Socket.IO broadcast. Runs continuously in the background (not just while
 * a "my requests" panel is open) so the DND tile can flip to "active" the
 * moment a request lands, without the guest having to go looking for it.
 */
export function useGuestStatusFeed(actionBase: string) {
  const [items, setItems] = useState<GuestStatusItem[]>([]);
  const [activeDnd, setActiveDnd] = useState<{ id: string; detail: string | null } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api<FeedResponse>(`${actionBase}/status`);
      setItems(data.items);
      setActiveDnd(data.activeDnd);
    } catch {
      // Silent — this is a background refresh; a real failure already
      // surfaced from whatever write action the guest just attempted.
    }
  }, [actionBase]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  return { items, activeDnd, refresh };
}
