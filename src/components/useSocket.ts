"use client";

import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ path: "/socket.io" });
  }
  return socket;
}

/**
 * Ereignis des Meldungs-Zentrums (`src/components/notify/`): App wieder sichtbar, wieder online oder Socket neu verbunden —
 * jede Ansicht lädt ihre Daten neu, damit verpasste Live-Ereignisse nachgeholt werden. Läuft über `window`, nicht über den Socket.
 */
export const RESYNC_EVENT = "app:resync";

/**
 * Subscribe to realtime events. `handlers` maps event name → callback.
 * The latest handlers are always used (ref pattern), listeners are cleaned up.
 * Sonderfall `"app:resync"`: kein Socket-Ereignis, sondern das Neulade-Signal des Meldungs-Zentrums (siehe RESYNC_EVENT).
 */
export function useSocket(handlers: Record<string, (payload: any) => void>) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const s = getSocket();
    const wrapped: Record<string, (payload: any) => void> = {};
    for (const event of Object.keys(ref.current)) {
      wrapped[event] = (payload: any) => ref.current[event]?.(payload);
      if (event === RESYNC_EVENT) window.addEventListener(RESYNC_EVENT, wrapped[event]);
      else s.on(event, wrapped[event]);
    }
    return () => {
      for (const [event, fn] of Object.entries(wrapped)) {
        if (event === RESYNC_EVENT) window.removeEventListener(RESYNC_EVENT, fn);
        else s.off(event, fn);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.keys(handlers).sort().join(",")]);
}
