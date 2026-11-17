import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server as HttpServer } from "http";
import type { AddressInfo } from "net";
import fs from "fs";
import path from "path";
import { Server } from "socket.io";
import { io as ioClient, type Socket } from "socket.io-client";
import { SignJWT } from "jose";
import { broadcast, EVENT_ROLES, planBroadcast } from "@/lib/realtime";

/**
 * S1 (Befund K2): Live-Kanal nur für angemeldete Mitarbeiter, jede Rolle bekommt nur, was sie sehen darf.
 * Echter Socket.IO-Server mit der Middleware aus socketAuth.js (wie server.js) und echte Clients.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { socketAuthMiddleware, DEV_SECRET, COOKIE_NAME } = require("../socketAuth.js");

const ROOT = path.resolve(__dirname, "..");

async function token(sub: string, role: string, secret = DEV_SECRET) {
  return new SignJWT({ name: "Test", role }).setSubject(sub).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(secret));
}

let http: HttpServer;
let url: string;
const clients: Socket[] = [];

beforeAll(async () => {
  http = createServer();
  const io = new Server(http, { path: "/socket.io" });
  io.use(socketAuthMiddleware(() => DEV_SECRET));
  globalThis.__io = io;
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const c of clients) c.disconnect();
  await new Promise<void>((r) => globalThis.__io!.close(() => r()));
  globalThis.__io = undefined;
});

function connect(cookie?: string): Promise<{ socket: Socket; ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const socket = ioClient(url, { path: "/socket.io", transports: ["websocket"], reconnection: false, extraHeaders: cookie ? { cookie } : {} });
    clients.push(socket);
    socket.on("connect", () => resolve({ socket, ok: true }));
    socket.on("connect_error", (e) => resolve({ socket, ok: false, error: e.message }));
  });
}

function collect(socket: Socket) {
  const got: { event: string; payload: unknown }[] = [];
  socket.onAny((event, payload) => got.push({ event, payload }));
  return got;
}
const settle = () => new Promise((r) => setTimeout(r, 150));

describe("Anmeldung am Live-Kanal", () => {
  it("Verbindung ohne Cookie wird abgelehnt", async () => {
    const r = await connect();
    expect(r.ok).toBe(false);
    expect(r.error).toBe("UNAUTHORIZED");
  });

  it("Verbindung mit gefälschtem Cookie (falsches Geheimnis) wird abgelehnt", async () => {
    const r = await connect(`${COOKIE_NAME}=${await token("u1", "duty_manager", "falsches-geheimnis-0123456789-abcdef")}`);
    expect(r.ok).toBe(false);
  });

  it("Housekeeper-Socket erhält kein Ereignis mit guestName oder guestAccessCode", async () => {
    const hk = await connect(`${COOKIE_NAME}=${await token("hk1", "room_attendant")}`);
    const fo = await connect(`${COOKIE_NAME}=${await token("fo1", "front_office")}`);
    expect(hk.ok && fo.ok).toBe(true);
    const hkGot = collect(hk.socket);
    const foGot = collect(fo.socket);

    broadcast("room:update", { room: { id: "r1", number: "305", status: "DIRTY", guestAccessCode: "geheim-code" } });
    broadcast("arrival:update", { arrival: { id: "a1", roomId: "r1", guestName: "Testgast Erfunden" } });
    broadcast("trace:update", { trace: { id: "t1", guestName: "Testgast Erfunden", text: "Blumen" } });
    broadcast("note:new", { note: { id: "n1", roomId: "r1", body: "Gast Testgast mag Kissen" }, roomNumber: "305" });
    broadcast("attendant:location", { userId: "hk1", name: "Maria", roomId: "r1" });
    await settle();

    const hkText = JSON.stringify(hkGot);
    expect(hkText).not.toMatch(/guestName|guestAccessCode|Testgast|geheim-code/);
    expect(hkGot.map((g) => g.event).sort()).toEqual(["note:new", "room:update", "trace:update"]);
    // Front Office: Gastnamen ja (Trace), aber nie den Gastcode; arrival:update ohne Namen; Notizen ohne Text.
    const foText = JSON.stringify(foGot);
    expect(foText).not.toMatch(/geheim-code|guestAccessCode|Kissen/);
    expect(foGot.find((g) => g.event === "trace:update")?.payload).toMatchObject({ trace: { guestName: "Testgast Erfunden" } });
    expect(foGot.find((g) => g.event === "arrival:update")?.payload).toEqual({ arrival: { id: "a1", roomId: "r1" } });
  });

  it("notification:new geht nur an die Zielperson bzw. Zielrolle (+ Duty Manager)", async () => {
    const a = await connect(`${COOKIE_NAME}=${await token("hkA", "room_attendant")}`);
    const b = await connect(`${COOKIE_NAME}=${await token("hkB", "room_attendant")}`);
    const eng = await connect(`${COOKIE_NAME}=${await token("eng1", "engineering")}`);
    const dm = await connect(`${COOKIE_NAME}=${await token("dm1", "duty_manager")}`);
    const [ga, gb, ge, gd] = [a, b, eng, dm].map((c) => collect(c.socket));

    broadcast("notification:new", { notification: { id: "x1", targetRole: "room_attendant", targetUserId: "hkA", message: "305" } });
    broadcast("notification:new", { notification: { id: "x2", targetRole: "engineering", targetUserId: null, message: "Mangel" } });
    await settle();

    expect(ga.map((g) => (g.payload as { notification: { id: string } }).notification.id)).toEqual(["x1"]);
    expect(gb).toEqual([]);
    expect(ge.map((g) => (g.payload as { notification: { id: string } }).notification.id)).toEqual(["x2"]);
    expect(gd.map((g) => (g.payload as { notification: { id: string } }).notification.id).sort()).toEqual(["x1", "x2"]);
  });
});

describe("Ereignis → Rollen", () => {
  it("jedes broadcast(\"…\") im Code steht in EVENT_ROLES (sonst würde es nicht gesendet)", () => {
    const events = new Set<string>();
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name)) for (const m of fs.readFileSync(p, "utf8").matchAll(/\bbroadcast\(\s*"([a-z][a-z:-]*)"/g)) events.add(m[1]);
      }
    };
    walk(path.join(ROOT, "src"));
    expect(events.size).toBeGreaterThan(15);
    expect([...events].filter((e) => !EVENT_ROLES[e])).toEqual([]);
  });

  it("Housekeeper, Hausmann, Techniker und Concierge bekommen nie Gastnamen", () => {
    for (const event of Object.keys(EVENT_ROLES)) {
      const payload = { x: { guestName: "Testgast", nested: [{ guestLastName: "Testgast" }] }, notification: { targetRole: "concierge" } };
      for (const plan of planBroadcast(event, payload)) {
        if (plan.rooms.some((r) => /role:(room_attendant|houseman|engineering|concierge)|user:/.test(r))) {
          expect(JSON.stringify(plan.payload)).not.toMatch(/Testgast/);
        }
      }
    }
  });

  it("unbekanntes Ereignis wird nicht gesendet", () => {
    expect(planBroadcast("gibt:es-nicht", { a: 1 })).toEqual([]);
  });
});
