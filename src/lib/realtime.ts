import type { Server as SocketIOServer } from "socket.io";

/**
 * Realtime bridge. The custom server (server.js) attaches the Socket.IO
 * instance to globalThis; API routes broadcast through this helper so every
 * connected client sees status changes instantly.
 *
 * Events:
 *   room:update        { room }                 — full room payload after any change
 *   room:status        { roomId, from, to, by } — lightweight status ticker
 *   attendant:location { userId, name, roomId } — live attendant location
 *   notification:new   { notification }         — new alert / escalation
 *   workorder:update   { workOrder }            — engineering queue changes
 *   arrival:update     { arrival }              — front office arrivals board
 *   note:new           { note }                 — cross-department room notes
 */

declare global {
  // eslint-disable-next-line no-var
  var __io: SocketIOServer | undefined;
}

export function getIO(): SocketIOServer | null {
  return globalThis.__io ?? null;
}

export function broadcast(event: string, payload: unknown) {
  const io = getIO();
  if (io) io.emit(event, payload);
}
