"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, NetworkError, api } from "@/components/api";
import { browserStorage, createActionQueue, type QueuedAction } from "@/lib/offline/actionQueue";

/**
 * Same mechanism as the staff Hub's useOfflineQueue (src/components/useOfflineQueue.ts,
 * both built on src/lib/offline/actionQueue.ts) — a hotel room's wifi is no
 * more reliable for a guest's phone than for an attendant's, and Prompt G2
 * Teil 3 asks for the same guarantee: "keine Aktion still verlieren,
 * Wiederholen anbieten". Kept as its own instance (own localStorage key, own
 * hook) rather than sharing the staff one — an anonymous guest queue must
 * never be mixed with an authenticated staff session's queue on a shared
 * device (e.g. a kiosk tablet).
 */
let queue: ReturnType<typeof createActionQueue> | null = null;

function getQueue() {
  if (!queue) {
    queue = createActionQueue({
      storage: browserStorage("stayclean.guest.queue.v1"),
      async send(action) {
        try {
          const data = await api(action.url, { body: action.body });
          return { ok: true, data };
        } catch (e) {
          if (e instanceof NetworkError) return { ok: false, retriable: true, error: e.message };
          const message = e instanceof ApiError ? e.message : String(e);
          return { ok: false, retriable: false, error: message };
        }
      },
    });
  }
  return queue;
}

export interface GuestOfflineState {
  online: boolean;
  pending: QueuedAction[];
  rejected: { label: string; error: string }[];
  dismissRejected: () => void;
  enqueue: (input: { url: string; body: unknown; label: string }) => void;
  flush: () => Promise<void>;
}

const RETRY_MS = 15_000;

export function useGuestOfflineQueue(): GuestOfflineState {
  const q = getQueue();
  const [pending, setPending] = useState<QueuedAction[]>([]);
  const [online, setOnline] = useState(true);
  const [rejected, setRejected] = useState<{ label: string; error: string }[]>([]);

  const flush = useCallback(async () => {
    const report = await q.flush();
    if (report.rejected.length) {
      setRejected((prev) => [...prev, ...report.rejected.map((r) => ({ label: r.action.label, error: r.error }))]);
    }
    if (report.delivered.length) setOnline(true);
  }, [q]);

  useEffect(() => {
    setPending(q.list());
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    const unsubscribe = q.subscribe(setPending);

    const goOnline = () => {
      setOnline(true);
      flush();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    const timer = setInterval(() => {
      if (q.list().length > 0) flush();
    }, RETRY_MS);

    if (q.list().length > 0) flush();

    return () => {
      unsubscribe();
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(timer);
    };
  }, [q, flush]);

  const enqueue = useCallback(
    (input: { url: string; body: unknown; label: string }) => {
      q.enqueue(input);
      setOnline(false);
    },
    [q]
  );

  return { online, pending, rejected, dismissRejected: () => setRejected([]), enqueue, flush };
}
