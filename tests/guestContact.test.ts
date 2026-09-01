import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { contactDepartment, GUEST_CONTACT_DEPARTMENTS } from "@/lib/rooms/contactDepartment";
import { resetDb, seedRoom } from "./setup/testDb";

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await resetDb();
});

describe("contactDepartment — reuses the Notification model, no POST /api/notifications involved", () => {
  it.each(GUEST_CONTACT_DEPARTMENTS)("routes to the correct targetRole for %s", async (department) => {
    const room = await seedRoom({ number: "601" });
    const notification = await contactDepartment(room.id, room.number, department, "Please help.", "Gast, Zimmer 601");
    expect(notification.targetRole).toBe(department);
  });

  it("the message names the guest source and includes their text", async () => {
    const room = await seedRoom({ number: "602" });
    const notification = await contactDepartment(
      room.id,
      room.number,
      "concierge",
      "Need a dinner reservation.",
      "Gast, Zimmer 602"
    );
    expect(notification.message).toContain("Gast, Zimmer 602");
    expect(notification.message).toContain("Need a dinner reservation.");
  });
});
