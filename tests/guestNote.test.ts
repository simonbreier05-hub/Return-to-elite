import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addRoomNote } from "@/lib/rooms/addRoomNote";
import { resetDb, seedRoom, seedUser } from "./setup/testDb";

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await resetDb();
});

describe("addRoomNote — shared by the staff route, the standalone guest field, and DND/clean comments", () => {
  it("a guest note has authorId null and guestSource set", async () => {
    const room = await seedRoom({ number: "701" });
    const note = await addRoomNote(room.id, room.number, "Please leave extra towels.", {
      type: "guest",
      label: "Gast, Zimmer 701",
    });
    expect(note.authorId).toBeNull();
    expect(note.guestSource).toBe("Gast, Zimmer 701");
    expect(note.body).toBe("Please leave extra towels.");
  });

  it("a staff note still sets authorId and leaves guestSource null (no regression from the extraction)", async () => {
    const room = await seedRoom({ number: "702" });
    const user = await seedUser({ email: "staff-note@hotel.test" });
    const note = await addRoomNote(room.id, room.number, "VIP amenity placed.", { type: "staff", userId: user.id });
    expect(note.authorId).toBe(user.id);
    expect(note.guestSource).toBeNull();
    expect(note.author?.name).toBe(user.name);
  });
});
