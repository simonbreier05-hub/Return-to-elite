import { describe, expect, it } from "vitest";
import { emitTo, joinChatRooms } from "@/lib/realtime";
import { asChatMessage } from "@/components/chat/ChatContext";

function fakeIo() {
  const sock = { rooms: new Set<string>(["sid", "chat:alt"]), data: {} as Record<string, unknown>, join(r: string[]) { r.forEach((x) => this.rooms.add(x)); }, leave(r: string) { this.rooms.delete(r); } };
  const emitted: [string, string][] = [];
  const io = { sockets: { sockets: new Map([["sid", sock]]) }, to: (room: string) => ({ emit: (ev: string) => emitted.push([room, ev]) }) };
  (globalThis as { __io?: unknown }).__io = io;
  return { sock, emitted };
}

describe("Socket-Räume (Server)", () => {
  it("setzt genau die übergebenen Räume, alte Chat-Räume werden verlassen, Socket bleibt an der Person", () => {
    const { sock } = fakeIo();
    expect(joinChatRooms("sid", "u1", ["chat:a", "user:u1"])).toBe("ok");
    expect([...sock.rooms].sort()).toEqual(["chat:a", "sid", "user:u1"]);
    expect(joinChatRooms("sid", "u2", ["chat:b"])).toBe("foreign");
    expect(sock.rooms.has("chat:b")).toBe(false);
    expect(joinChatRooms("nope", "u1", [])).toBe("unknown");
  });
  it("emitTo sendet nur in den Raum", () => {
    const { emitted } = fakeIo();
    emitTo("chat:a", "chat:message", {});
    expect(emitted).toEqual([["chat:a", "chat:message"]]);
    delete (globalThis as { __io?: unknown }).__io;
  });
});

describe("Unvollständige Live-Daten", () => {
  it.each([null, undefined, {}, { message: null }, { message: { id: "x" } }, { message: { id: "x", channelId: "c", author: null } }, "kaputt", 42])("%j → null, kein Absturz", (p) => {
    expect(asChatMessage(p)).toBeNull();
  });
  it("füllt fehlende Felder sicher auf", () => {
    const m = asChatMessage({ message: { id: "1", channelId: "c", author: { id: "u" } } });
    expect(m).toMatchObject({ body: "", urgent: false, author: { id: "u", name: "", role: "" } });
  });
});
