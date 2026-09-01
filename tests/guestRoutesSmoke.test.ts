import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { POST as dndPost } from "@/app/api/guest/[roomToken]/dnd/route";
import { GET as infoGet } from "@/app/api/guest/[roomToken]/route";
import { resetDb, seedRoom } from "./setup/testDb";

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await resetDb();
});

function jsonRequest(body: unknown, ip: string) {
  return new NextRequest("http://localhost/api/guest/x/dnd", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
  });
}

describe("route wiring: POST /api/guest/[roomToken]/dnd", () => {
  it("a valid token returns 200 and actually changes the room in the DB", async () => {
    const room = await seedRoom({ number: "801", status: "DIRTY" });
    const req = jsonRequest({ window: "2H" }, "10.0.0.1");

    const res = await dndPost(req, { params: Promise.resolve({ roomToken: room.guestToken! }) });
    expect(res.status).toBe(200);

    const updated = await prisma.room.findUniqueOrThrow({ where: { id: room.id } });
    expect(updated.status).toBe("BLOCKED");
    expect(updated.blockReason).toBe("DND");
  });

  it("a tampered token returns 404 with the same generic message as an unknown one", async () => {
    const room = await seedRoom({ number: "802" });
    const tampered = room.guestToken!.slice(0, -1) + (room.guestToken!.at(-1) === "A" ? "B" : "A");

    const tamperedRes = await dndPost(jsonRequest({ window: "2H" }, "10.0.0.2"), {
      params: Promise.resolve({ roomToken: tampered }),
    });
    const unknownRes = await dndPost(jsonRequest({ window: "2H" }, "10.0.0.3"), {
      params: Promise.resolve({ roomToken: "z".repeat(32) }),
    });

    expect(tamperedRes.status).toBe(404);
    expect(unknownRes.status).toBe(404);
    const [tamperedBody, unknownBody] = await Promise.all([tamperedRes.json(), unknownRes.json()]);
    expect(tamperedBody).toEqual(unknownBody);
  });

  it("requests past the rate limit get 429", async () => {
    const room = await seedRoom({ number: "803" });
    const ip = "10.0.0.4"; // fixed IP so every request lands in the same bucket
    let last429: Response | null = null;

    for (let i = 0; i < 7; i++) {
      const res = await dndPost(jsonRequest({ window: "2H" }, ip), {
        params: Promise.resolve({ roomToken: room.guestToken! }),
      });
      if (res.status === 429) last429 = res;
    }

    expect(last429).not.toBeNull();
    expect(last429!.headers.get("Retry-After")).toBeTruthy();
  });
});

describe("route wiring: GET /api/guest/[roomToken] never leaks other rooms", () => {
  it("returns only this room's own number and floor", async () => {
    const room = await seedRoom({ number: "804", floor: 3 });
    await seedRoom({ number: "805", floor: 3 }); // a neighboring room that must never appear

    const req = new NextRequest("http://localhost/api/guest/x", {
      headers: { "x-forwarded-for": "10.0.0.5" },
    });
    const res = await infoGet(req, { params: Promise.resolve({ roomToken: room.guestToken! }) });
    const body = await res.json();

    expect(body).toEqual({ roomNumber: "804", floor: 3 });
    expect(JSON.stringify(body)).not.toContain("805");
  });
});
