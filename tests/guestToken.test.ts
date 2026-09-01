import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resolveGuestRoom } from "@/lib/rooms/resolveGuestRoom";
import { resetDb, seedRoom } from "./setup/testDb";

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await resetDb();
});

describe("resolveGuestRoom — the entire guest access-control boundary", () => {
  it("resolves a valid token to its room", async () => {
    const room = await seedRoom({ number: "305" });
    const resolved = await resolveGuestRoom(room.guestToken!);
    expect(resolved?.id).toBe(room.id);
    expect(resolved?.number).toBe("305");
  });

  it("returns null for an unknown but well-formed token", async () => {
    await seedRoom();
    const fakeButWellFormed = "a".repeat(32);
    expect(await resolveGuestRoom(fakeButWellFormed)).toBeNull();
  });

  it("returns null for a tampered token (same length, last char flipped)", async () => {
    const room = await seedRoom();
    const token = room.guestToken!;
    const tampered = token.slice(0, -1) + (token.at(-1) === "A" ? "B" : "A");
    expect(await resolveGuestRoom(tampered)).toBeNull();
  });

  it("returns null for malformed input (empty, too short, bad characters)", async () => {
    await seedRoom();
    expect(await resolveGuestRoom("")).toBeNull();
    expect(await resolveGuestRoom("short")).toBeNull();
    expect(await resolveGuestRoom("not a token with spaces!!")).toBeNull();
  });

  it("never cross-resolves — each room's token only ever resolves to that room", async () => {
    const roomA = await seedRoom({ number: "101" });
    const roomB = await seedRoom({ number: "102" });

    const resolvedA = await resolveGuestRoom(roomA.guestToken!);
    const resolvedB = await resolveGuestRoom(roomB.guestToken!);

    expect(resolvedA?.id).toBe(roomA.id);
    expect(resolvedB?.id).toBe(roomB.id);
    expect(resolvedA?.id).not.toBe(resolvedB?.id);

    // Room A's token must not resolve room B, and vice versa.
    expect(await resolveGuestRoom(roomA.guestToken!)).not.toMatchObject({ id: roomB.id });
  });
});
