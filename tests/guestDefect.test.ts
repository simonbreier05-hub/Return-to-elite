import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { reportDefect } from "@/lib/rooms/reportDefect";
import { resetDb, seedRoom, seedUser } from "./setup/testDb";

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await resetDb();
});

describe("reportDefect — the real work-order creation path, shared by staff and guest", () => {
  it("a guest report creates a Defect with reportedById null and guestSource set", async () => {
    const room = await seedRoom({ number: "512" });

    const defect = await reportDefect(
      { roomId: room.id, roomNumber: room.number, category: "PLUMBING", note: "Leaking tap.", photoPath: null },
      { type: "guest", label: "Gast, Zimmer 512" }
    );

    expect(defect.reportedById).toBeNull();
    expect(defect.guestSource).toBe("Gast, Zimmer 512");
  });

  it("auto-creates a WorkOrder in OPEN status and a Notification for engineering", async () => {
    const room = await seedRoom({ number: "513" });

    const defect = await reportDefect(
      { roomId: room.id, roomNumber: room.number, category: "HVAC", note: "AC not cooling.", photoPath: null },
      { type: "guest", label: "Gast, Zimmer 513" }
    );

    const workOrder = await prisma.workOrder.findUnique({ where: { defectId: defect.id } });
    expect(workOrder?.status).toBe("OPEN");

    const notification = await prisma.notification.findFirst({ where: { roomId: room.id, type: "WORK_ORDER" } });
    expect(notification?.targetRole).toBe("engineering");
  });

  it("is the identical creation path for staff and guest actors (same shape, different actor fields)", async () => {
    const room = await seedRoom({ number: "514" });
    const attendant = await seedUser({ email: "attendant@hotel.test" });

    const staffDefect = await reportDefect(
      { roomId: room.id, roomNumber: room.number, category: "OTHER", note: "Staff-reported.", photoPath: null },
      { type: "staff", userId: attendant.id }
    );
    const guestDefect = await reportDefect(
      { roomId: room.id, roomNumber: room.number, category: "OTHER", note: "Guest-reported.", photoPath: null },
      { type: "guest", label: "Gast, Zimmer 514" }
    );

    expect(staffDefect.reportedById).toBe(attendant.id);
    expect(staffDefect.guestSource).toBeNull();
    expect(guestDefect.reportedById).toBeNull();
    expect(guestDefect.guestSource).toBe("Gast, Zimmer 514");

    // Both produce a WorkOrder the same way.
    const staffWo = await prisma.workOrder.findUnique({ where: { defectId: staffDefect.id } });
    const guestWo = await prisma.workOrder.findUnique({ where: { defectId: guestDefect.id } });
    expect(staffWo?.status).toBe("OPEN");
    expect(guestWo?.status).toBe("OPEN");
  });
});
