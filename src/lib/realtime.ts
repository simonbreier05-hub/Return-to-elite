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
 *   note:update        { note }                 — a note's OPEN/DONE status changed
 *   route:reordered    { attendantId, roomIds } — attendant's Laufplan reordered
 *   roomtask:update     { roomTask }             — houseman queue changes (new or done)
 *   user:floors         { userId, floors }       — a supervisor's floor assignment changed
 *   guestrequest:new    { guestRequest }         — guest raised DND/clean-request/contact
 *   guestrequest:update { guestRequest }         — its status/assignee changed
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

/**
 * Chat-Hub: an einen Raum senden statt an alle (`broadcast` erreicht jeden Client ohne Anmeldung). Räume:
 * `chat:<channelId>` (Kanal/Unterhaltung) und `user:<userId>` (persönlich: Zähler, neue Unterhaltung). Betreten wird ein
 * Raum nur serverseitig über `joinChatRooms` (POST /api/chat/join prüft Session + policy) — Clients können nicht selbst beitreten.
 */
export function emitTo(room: string, event: string, payload: unknown) {
  const io = getIO();
  if (io) io.to(room).emit(event, payload);
}

/**
 * Socket `socketId` in genau diese Räume setzen (alte Chat-Räume werden verlassen). Ein Socket gehört danach fest zu
 * `userId`; ein Versuch, ihn einer anderen Person zuzuordnen, wird abgelehnt.
 */
export function joinChatRooms(socketId: string, userId: string, rooms: string[]): "ok" | "unknown" | "foreign" {
  const io = getIO();
  const socket = io?.sockets.sockets.get(socketId);
  if (!socket) return "unknown";
  const owner = socket.data?.chatUserId as string | undefined;
  if (owner && owner !== userId) return "foreign";
  socket.data.chatUserId = userId;
  for (const r of socket.rooms) if ((r.startsWith("chat:") || r.startsWith("user:")) && !rooms.includes(r)) socket.leave(r);
  socket.join(rooms);
  return "ok";
}
