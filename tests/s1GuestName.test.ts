import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * S1 (Entscheidung 16.11.2026, Muss): „Der Gastbildschirm grüßt immer nur den aktuellen Gast.“
 * Test-Matrix „richtiger Name“ gegen eine kleine In-Memory-DB: Same-Day-Turn, Late Check-out, Zimmerwechsel,
 * doppelter aktiver Aufenthalt, Check-out per Link, Antwort-Header no-store. In keinem Fall erscheint der Name
 * eines anderen Aufenthalts. Nur erfundene Gastdaten.
 */

type Stay = {
  id: string; roomId: string; guestName: string; guestSalutation: string | null; guestTitle: string | null; guestLastName: string | null;
  language: string; status: string; checkIn: Date; checkOut: Date; stayToken: string;
};

const db = {
  rooms: [] as { id: string; number: string; floor: number; guestAccessCode: string }[],
  stays: [] as Stay[],
  notifications: [] as Record<string, unknown>[],
  audit: [] as { roomId: string; action: string; createdAt: Date }[],
};

const match = (row: Record<string, unknown>, where: Record<string, unknown> = {}) =>
  Object.entries(where).every(([k, v]) => row[k] === v);

vi.mock("@/lib/db", () => ({
  prisma: {
    room: { findUnique: async ({ where }: { where: Record<string, unknown> }) => db.rooms.find((r) => match(r, where)) ?? null },
    stay: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        db.stays.filter((s) => match(s, where)).sort((a, b) => b.checkIn.getTime() - a.checkIn.getTime()),
      findUnique: async ({ where }: { where: { stayToken: string } }) => {
        const s = db.stays.find((x) => x.stayToken === where.stayToken);
        return s ? { ...s, room: db.rooms.find((r) => r.id === s.roomId) } : null;
      },
    },
    notification: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => db.notifications.find((n) => match(n, where)) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => (db.notifications.push(data), data),
    },
    auditLog: {
      findFirst: async ({ where }: { where: { roomId: string; action: string } }) =>
        db.audit.filter((a) => a.roomId === where.roomId && a.action === where.action).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
    },
    user: { findUnique: async () => ({ id: "guest-system" }) },
    guestRequest: { findMany: async () => [] },
    roomNote: { findMany: async () => [] },
    defect: { findMany: async () => [] },
  },
}));
vi.mock("@/lib/settings", () => ({ getSettings: async () => ({ guestStayTokenGraceMinutes: 120, guestRateLimitPerHour: 5 }) }));
const runGuestActionMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
vi.mock("@/lib/guestActions", () => ({ isGuestAction: (a: string) => a === "dnd", runGuestAction: (...a: unknown[]) => runGuestActionMock(...(a as [])) }));
const broadcastMock = vi.fn();
vi.mock("@/lib/realtime", () => ({ broadcast: (...a: unknown[]) => broadcastMock(...a) }));

import { resolveGuestAccessByRoomCode, resolveGuestAccessByStayToken } from "@/lib/guestServer";
import { guestStatusResponse } from "@/lib/guestStatusResponse";
import { formatGreeting, greetingFromStay, salutationKey } from "@/lib/guestGreeting";
import { POST as roomAction } from "@/app/api/guest/r/[roomCode]/[action]/route";
import { NextRequest } from "next/server";

const day = (d: string) => new Date(`${d}T00:00:00Z`);
function stay(p: Partial<Stay> & Pick<Stay, "id" | "roomId" | "guestLastName" | "status">): Stay {
  return {
    guestName: p.guestLastName ?? "—", guestSalutation: "MR", guestTitle: null, language: "de",
    checkIn: day("2026-11-14"), checkOut: new Date("2026-11-17T10:00:00Z"), stayToken: `tok-${p.id}`, ...p,
  };
}

/** Name, den der Gastbildschirm über den Zimmer-Code zeigt (null = neutral). */
async function nameByRoom(code: string): Promise<string | null> {
  const a = await resolveGuestAccessByRoomCode(code);
  const g = a ? greetingFromStay(a.stay) : null;
  return g ? formatGreeting(g, "de") : null;
}
async function statusBody(code: string) {
  const res = await guestStatusResponse(await resolveGuestAccessByRoomCode(code));
  return { status: res.status, cache: res.headers.get("cache-control"), body: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  db.rooms = [
    { id: "r305", number: "305", floor: 3, guestAccessCode: "code-305" },
    { id: "r410", number: "410", floor: 4, guestAccessCode: "code-410" },
  ];
  db.stays = [];
  db.notifications = [];
  db.audit = [];
  broadcastMock.mockReset();
  vi.useFakeTimers().setSystemTime(new Date("2026-11-17T09:00:00Z"));
});

describe("Anrede Titel Nachname", () => {
  it("Anrede neutral gespeichert, deutsch bei deutscher Sprache, sonst englisch", () => {
    expect(salutationKey("Herr")).toBe("MR");
    expect(salutationKey("Mrs.")).toBe("MRS");
    expect(salutationKey("Ms")).toBe("MS");
    expect(salutationKey("Fr.")).toBe("MRS");
    expect(salutationKey("Exz.")).toBeNull();
    const g = { salutation: "MR" as const, title: "Dr.", lastName: "Testmann" };
    expect(formatGreeting(g, "de")).toBe("Herr Dr. Testmann");
    expect(formatGreeting(g, "en")).toBe("Mr Dr. Testmann");
    expect(formatGreeting({ salutation: "MS", title: null, lastName: "Probe" }, "fr")).toBe("Ms Probe");
    expect(formatGreeting({ salutation: null, title: "Prof.", lastName: "Probe" }, "de")).toBe("Prof. Probe");
    expect(greetingFromStay({ guestLastName: null })).toBeNull();
  });
});

describe("Same-Day-Turn", () => {
  it("vor dem Check-out der Vorgast, danach neutral, nach dem Check-in der neue Gast", async () => {
    db.stays = [
      stay({ id: "alt", roomId: "r305", guestLastName: "Vorgast", status: "IN_HOUSE" }),
      stay({ id: "neu", roomId: "r305", guestLastName: "Neugast", status: "EXPECTED", guestSalutation: "MRS", checkIn: day("2026-11-17") }),
    ];
    expect(await nameByRoom("code-305")).toBe("Herr Vorgast");

    db.stays[0].status = "CHECKED_OUT";
    expect(await nameByRoom("code-305")).toBeNull();
    const after = await statusBody("code-305");
    expect(after.status).toBe(404);
    expect(JSON.stringify(after.body)).not.toMatch(/Vorgast|Neugast/);

    db.stays[1].status = "IN_HOUSE";
    expect(await nameByRoom("code-305")).toBe("Frau Neugast");
  });
});

describe("Late Check-out", () => {
  it("nach der regulären Abreisezeit bleibt der bisherige Gast, bis zum Check-out", async () => {
    vi.setSystemTime(new Date("2026-11-17T15:00:00Z")); // Abreise war 10:00
    db.stays = [stay({ id: "lco", roomId: "r305", guestLastName: "Spaet", status: "IN_HOUSE" })];
    expect(await nameByRoom("code-305")).toBe("Herr Spaet");
    db.stays[0].status = "CHECKED_OUT";
    expect(await nameByRoom("code-305")).toBeNull();
  });
});

describe("Zimmerwechsel", () => {
  it("altes Zimmer sofort neutral, neues Zimmer zeigt den Gast", async () => {
    db.stays = [stay({ id: "w", roomId: "r305", guestLastName: "Wechsel", status: "IN_HOUSE" })];
    expect(await nameByRoom("code-305")).toBe("Herr Wechsel");
    db.stays[0].roomId = "r410"; // F3 hängt den Aufenthalt um
    expect(await nameByRoom("code-305")).toBeNull();
    expect(await nameByRoom("code-410")).toBe("Herr Wechsel");
  });
});

describe("Zwei Aufenthalte gleichzeitig „im Haus“", () => {
  it("neutral, Warnung an den Duty Manager (einmal, ohne Gastnamen) — nie raten", async () => {
    db.stays = [
      stay({ id: "a", roomId: "r305", guestLastName: "Erster", status: "IN_HOUSE" }),
      stay({ id: "b", roomId: "r305", guestLastName: "Zweiter", status: "IN_HOUSE", checkIn: day("2026-11-17") }),
    ];
    expect(await nameByRoom("code-305")).toBeNull();
    expect(await nameByRoom("code-305")).toBeNull();
    expect(db.notifications).toHaveLength(1);
    expect(db.notifications[0]).toMatchObject({ targetRole: "duty_manager", type: "GUEST_STAY_CONFLICT", roomId: "r305" });
    expect(JSON.stringify(db.notifications[0])).not.toMatch(/Erster|Zweiter/);
    expect(broadcastMock).toHaveBeenCalledTimes(1);
  });
});

describe("Antwort von /status", () => {
  it("trägt die Begrüßung des aktiven Aufenthalts und ist nie zwischenspeicherbar", async () => {
    db.stays = [stay({ id: "s", roomId: "r305", guestLastName: "Aktuell", guestTitle: "Dr.", status: "IN_HOUSE" })];
    const r = await statusBody("code-305");
    expect(r.status).toBe(200);
    expect(r.cache).toMatch(/no-store/);
    expect(r.body.greeting).toEqual({ salutation: "MR", title: "Dr.", lastName: "Aktuell" });
  });

  it("auch die Absage (kein Aufenthalt) ist no-store", async () => {
    const r = await statusBody("code-305");
    expect(r.status).toBe(404);
    expect(r.cache).toMatch(/no-store/);
  });
});

describe("Persönlicher Link (/g/s/…)", () => {
  it("nach dem Check-out sofort ungültig, auch innerhalb der Kulanzzeit", async () => {
    db.stays = [stay({ id: "p", roomId: "r305", guestLastName: "Link", status: "IN_HOUSE" })];
    expect(await resolveGuestAccessByStayToken("tok-p")).not.toBeNull();
    db.stays[0].status = "CHECKED_OUT";
    expect(await resolveGuestAccessByStayToken("tok-p")).toBeNull();
  });
});

describe("Anfragen über den festen Zimmer-Code (H1)", () => {
  const post = (code: string) =>
    roomAction(new NextRequest(`http://test/api/guest/r/${code}/dnd`, { method: "POST", body: "{}" }), { params: Promise.resolve({ roomCode: code, action: "dnd" }) });

  it("ohne aktiven Aufenthalt abgelehnt (nach Check-out, vor Check-in)", async () => {
    db.stays = [stay({ id: "x", roomId: "r305", guestLastName: "Weg", status: "CHECKED_OUT" })];
    const res = await post("code-305");
    expect(res.status).toBe(404);
    expect(runGuestActionMock).not.toHaveBeenCalled();
  });

  it("mit aktivem Aufenthalt angenommen", async () => {
    runGuestActionMock.mockClear();
    db.stays = [stay({ id: "y", roomId: "r305", guestLastName: "Da", status: "IN_HOUSE" })];
    const res = await post("code-305");
    expect(res.status).toBe(200);
    expect(runGuestActionMock).toHaveBeenCalledTimes(1);
  });
});
