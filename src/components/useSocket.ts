"use client";

import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io({ path: "/socket.io" });
  }
  return socket;
}

/**
 * Subscribe to realtime events. `handlers` maps event name → callback.
 * The latest handlers are always used (ref pattern), listeners are cleaned up.
 */
export function useSocket(handlers: Record<string, (payload: any) => void>) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const s = getSocket();
    const wrapped: Record<string, (payload: any) => void> = {};
    for (const event of Object.keys(ref.current)) {
      wrapped[event] = (payload: any) => ref.current[event]?.(payload);
      s.on(event, wrapped[event]);
    }
    return () => {
      for (const [event, fn] of Object.entries(wrapped)) s.off(event, fn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.keys(handlers).sort().join(",")]);
}
