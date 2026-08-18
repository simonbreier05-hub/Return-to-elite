"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, NetworkError, api } from "./api";
import { browserStorage, createActionQueue, type QueuedAction } from "@/lib/offline/actionQueue";

/**
 * One queue per browser tab, shared by every view. Created lazily so it is
 * never touched during server rendering.
 */
let queue: ReturnType<typeof createActionQueue> | null = null;

function getQueue() {
  if (!queue) {
    queue = createActionQueue({
      storage: browserStorage(),
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

export interface OfflineState {
  online: boolean;
  pending: QueuedAction[];
  /** Actions the server refused during replay — shown once, then dismissed. */
  rejected: { label: string; error: string }[];
  dismissRejected: () => void;
  /** Queue a write that could not be delivered right now. */
  enqueue: (input: { url: string; body: unknown; label: string }) => void;
  flush: () => Promise<void>;
}

const RETRY_MS = 15_000;

export function useOfflineQueue(): OfflineState {
  const q = getQueue();
  const [pending, setPending] = useState<QueuedAction[]>([]);
  const [online, setOnline] = useState(true);
  const [rejected, setRejected] = useState<{ label: string; error: string }[]>([]);

  const flush = useCallback(async () => {
    const report = await q.flush();
    if (report.rejected.length) {
      setRejected((prev) => [...prev, ...report.rejected.map((r) => ({ label: r.action.label, error: r.error }))]);
    }
    // Delivering anything at all proves we are back.
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

    // navigator.onLine reports the network interface, not whether our server is
    // reachable — a hotel captive portal looks "online". So retry on a timer
    // regardless, and let a successful delivery be the real proof.
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
      setOnline(false); // something just failed to reach the server
    },
    [q]
  );

  return {
    online,
    pending,
    rejected,
    dismissRejected: () => setRejected([]),
    enqueue,
    flush,
  };
}
