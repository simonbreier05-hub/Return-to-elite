"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Coalesces a burst of refetch requests into a single call.
 *
 * Room state itself is patched directly from the socket payload, so the UI
 * updates instantly without a network round trip. Some data is derived
 * server-side and cannot be patched that way — priority scores, for example.
 * For those, this hook turns "one refetch per event" into "at most one refetch
 * per window", which is what keeps a busy floor from hammering the API.
 */
export function useCoalescedRefetch(fn: () => void, waitMs = 1500) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return useCallback(() => {
    if (timer.current) return; // a run is already scheduled; it will cover this event
    timer.current = setTimeout(() => {
      timer.current = null;
      fnRef.current();
    }, waitMs);
  }, [waitMs]);
}
