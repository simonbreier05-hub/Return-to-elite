import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { dir, url } = vi.hoisted(() => {
  const fs = require("node:fs") as typeof import("node:fs");
  const os = require("node:os") as typeof import("node:os");
  const p = require("node:path") as typeof import("node:path");
  const d = fs.mkdtempSync(p.join(os.tmpdir(), "stayclean-chat-"));
  return { dir: d, url: `file:${p.join(d, "test.db")}` };
});
vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient({ datasources: { db: { url } } }) };
});
const getSessionMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getSession: (...a: unknown[]) => getSessionMock(...a) }));
const emitMock = vi.fn();
const joinMock = vi.fn((..._a: unknown[]) => "ok");
vi.mock("@/lib/realtime", () => ({ broadcast: vi.fn(), emitTo: (...a: unknown[]) => emitMock(...a), joinChatRooms: (...a: unknown[]) => joinMock(...a) }));

import { prisma } from "@/lib/db";
import { GET as channelsGet } from "@/app/api/chat/channels/route";
import { GET as msgGet, POST as msgPost } from "@/app/api/chat/channels/[id]/messages/route";
import { POST as readPost } from "@/app/api/chat/channels/[id]/read/route";
import { POST as directPost } from "@/app/api/chat/direct/route";
import { GET as peopleGet } from "@/app/api/chat/people/route";
import { POST as joinPost } from "@/app/api/chat/join/route";
import { POST as retractPost } from "@/app/api/chat/messages/[id]/retract/route";
import { GET as reviewGet } from "@/app/api/chat/review/[id]/route";
import { ensureChannels } from "@/lib/chat/service";
import { purgeExpiredChat } from "@/lib/chat/retention";
import { resetChatRateLimit, CHAT_RATE_LIMIT } from "@/lib/chat/rateLimit";

const ROLE_OF = { hk: "room_attendant", sup: "supervisor", dm: "duty_manager", eng: "engineering", fo: "front_office", con: "concierge", hm: "houseman", hk2: "room_attendant" } as const;
type Who = keyof typeof ROLE_OF;
const ids = {} as Record<Who, string>;
const ch: Record<string, string> = {};
const as = (who: Who) => { getSessionMock.mockReset(); getSessionMock.mockResolvedValue({ userId: ids[who], name: who, role: ROLE_OF[who] }); };
const req = (method: string, body?: unknown, path = "http://x/api") => new NextRequest(path, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" } });
const p = (id: string) => ({ params: Promise.resolve({ id }) });
const send = (id: string, body: string, urgent = false) => msgPost(req("POST", { body, urgent }), p(id));

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate --schema prisma/schema.prisma", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  for (const who of Object.keys(ROLE_OF) as Who[]) {
    ids[who] = (await prisma.user.create({ data: { email: `${who}@x.test`, name: `${who} Test`, passwordHash: "x", role: ROLE_OF[who], ...(who === "eng" ? { language: "pl" } : {}) } })).id;
  }
  await ensureChannels();
  for (const c of await prisma.chatChannel.findMany()) ch[c.key] = c.id;
}, 90_000);
afterAll(async () => { await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe("Rechte-Matrix über die API", () => {
  const MATRIX: Record<Who, string[]> = {
    hk: ["HOUSEKEEPING"], hk2: ["HOUSEKEEPING"], eng: ["ENGINEERING"], fo: ["FRONT_OFFICE"], hm: ["HOUSEMAN"], con: [],
    sup: ["HOUSEKEEPING", "ENGINEERING", "FRONT_OFFICE", "HOUSEMAN"], dm: ["HOUSEKEEPING", "ENGINEERING", "FRONT_OFFICE", "HOUSEMAN"],
  };
  for (const who of Object.keys(MATRIX) as Who[]) {
    it(`${who}: liest/schreibt nur eigene Kanäle`, async () => {
      resetChatRateLimit();
      as(who);
      const list = (await (await channelsGet()).json()) as { channels: { key: string; kind: string }[] };
      expect(list.channels.filter((c) => c.kind === "CHANNEL").map((c) => c.key).sort()).toEqual([...MATRIX[who]].sort());
      for (const key of ["HOUSEKEEPING", "ENGINEERING", "FRONT_OFFICE", "HOUSEMAN"]) {
        const allowed = MATRIX[who].includes(key);
        expect((await msgGet(req("GET"), p(ch[key]))).status, `${who} liest ${key}`).toBe(allowed ? 200 : 403);
        expect((await send(ch[key], `Test von ${who}`)).status, `${who} schreibt ${key}`).toBe(allowed ? 201 : 403);
      }
    });
  }
});

describe("Direktnachrichten: Housekeeper-Regel auch per direktem API-Aufruf", () => {
  it("Housekeeper → Technik/Front Office/Concierge/Hausmann/Housekeeper: 403", async () => {
    as("hk");
    for (const to of ["eng", "fo", "con", "hm", "hk2"] as Who[]) expect((await directPost(req("POST", { userId: ids[to] }))).status, to).toBe(403);
    const people = (await (await peopleGet()).json()) as { people: { role: string }[] };
    expect([...new Set(people.people.map((x) => x.role))].sort()).toEqual(["duty_manager", "supervisor"]);
  });
  it("andere Rollen starten keine Direktnachricht an Housekeeper", async () => {
    for (const from of ["eng", "fo", "con", "hm"] as Who[]) { as(from); expect((await directPost(req("POST", { userId: ids.hk }))).status, from).toBe(403); }
  });
  it("Housekeeper ↔ Supervisor erlaubt; Concierge ↔ Front Office erlaubt; Dritte lesen nicht mit", async () => {
    as("hk");
    const r = await directPost(req("POST", { userId: ids.sup }));
    expect(r.status).toBe(200);
    ch.hkSup = ((await r.json()) as { channelId: string }).channelId;
    expect((await send(ch.hkSup, "Zimmer #312 braucht Handtücher")).status).toBe(201);
    as("sup");
    expect(((await (await directPost(req("POST", { userId: ids.hk }))).json()) as { channelId: string }).channelId).toBe(ch.hkSup); // dieselbe Unterhaltung
    as("con");
    const c = await directPost(req("POST", { userId: ids.fo }));
    expect(c.status).toBe(200);
    as("eng");
    expect((await msgGet(req("GET"), p(ch.hkSup))).status).toBe(403);
    expect((await send(ch.hkSup, "x")).status).toBe(403);
    as("dm"); // auch der Duty Manager liest fremde Direktnachrichten nicht im normalen Chat
    expect((await msgGet(req("GET"), p(ch.hkSup))).status).toBe(403);
  });
  it("Regeländerung per Einstellung wirkt sofort, auch für bestehende Unterhaltungen", async () => {
    await prisma.setting.create({ data: { key: "chat.housekeeperDmRoles", value: "duty_manager" } });
    as("hk");
    expect((await send(ch.hkSup, "noch da?")).status).toBe(403);
    await prisma.setting.delete({ where: { key: "chat.housekeeperDmRoles" } });
    expect((await send(ch.hkSup, "noch da?")).status).toBe(201);
  });
});

describe("Nachrichten", () => {
  it("speichert Originalsprache (Profil, sonst Hotel-Standard) und den Text unverändert", async () => {
    resetChatRateLimit();
    as("eng");
    const r = (await (await send(ch.ENGINEERING, "Pompa w 214 nie działa")).json()) as { message: { id: string; originalLanguage: string } };
    expect(r.message.originalLanguage).toBe("pl");
    as("sup");
    const s = (await (await send(ch.ENGINEERING, "Danke")).json()) as { message: { originalLanguage: string } };
    expect(s.message.originalLanguage).toBe("de");
    await prisma.setting.create({ data: { key: "hotelDefaultLanguage", value: "en" } });
    const e = (await (await send(ch.ENGINEERING, "Thanks")).json()) as { message: { originalLanguage: string } };
    expect(e.message.originalLanguage).toBe("en");
    const row = await prisma.chatMessage.findUnique({ where: { id: r.message.id } });
    expect(row?.body).toBe("Pompa w 214 nie działa");
  });
  it("Ungelesen-Zähler steigt bei fremden Nachrichten und fällt nach Lesen", async () => {
    as("hm");
    await readPost(req("POST"), p(ch.HOUSEMAN));
    as("sup");
    await send(ch.HOUSEMAN, "Bitte #105 Zustellbett");
    await send(ch.HOUSEMAN, "und #106");
    as("hm");
    const before = (await (await channelsGet()).json()) as { unread: number; channels: { key: string; unread: number }[] };
    expect(before.channels.find((c) => c.key === "HOUSEMAN")?.unread).toBe(2);
    await readPost(req("POST"), p(ch.HOUSEMAN));
    const after = (await (await channelsGet()).json()) as { unread: number };
    expect(after.unread).toBe(0);
  });
  it("leer / zu lang → 400; Rate-Limit → 429", async () => {
    resetChatRateLimit();
    as("fo");
    expect((await send(ch.FRONT_OFFICE, "   ")).status).toBe(400);
    expect((await send(ch.FRONT_OFFICE, "x".repeat(1001))).status).toBe(400);
    for (let i = 0; i < CHAT_RATE_LIMIT; i++) expect((await send(ch.FRONT_OFFICE, `n${i}`)).status).toBe(201);
    expect((await send(ch.FRONT_OFFICE, "eine zu viel")).status).toBe(429);
    resetChatRateLimit();
  });
  it("dringend + Erwähnung → Meldung ohne Nachrichtentext, nur an Leser des Kanals", async () => {
    as("sup");
    await send(ch.HOUSEKEEPING, "GEHEIM Sofort #401 @hk", true);
    const notes = await prisma.notification.findMany({ where: { type: "CHAT" } });
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((n) => !n.message.includes("GEHEIM"))).toBe(true);
    expect(notes.some((n) => n.targetUserId === ids.eng)).toBe(false); // Technik liest Housekeeping nicht
    expect(notes.some((n) => n.targetUserId === ids.hk)).toBe(true);
  });
  it("Zurückziehen: Autor binnen 5 Min, danach nicht; Fremde nicht; Duty Manager blendet aus", async () => {
    as("hk");
    const m = (await (await send(ch.HOUSEKEEPING, "Tippfehler")).json()) as { message: { id: string } };
    as("hk2");
    expect((await retractPost(req("POST"), p(m.message.id))).status).toBe(403);
    as("hk");
    expect((await retractPost(req("POST"), p(m.message.id))).status).toBe(200);
    const row = await prisma.chatMessage.findUnique({ where: { id: m.message.id } });
    expect(row?.body).toBe("");
    expect(row?.retractedAt).not.toBeNull();
    const old = await prisma.chatMessage.create({ data: { channelId: ch.HOUSEKEEPING, authorId: ids.hk, body: "alt", originalLanguage: "de", createdAt: new Date(Date.now() - 6 * 60_000) } });
    expect((await retractPost(req("POST"), p(old.id))).status).toBe(403);
    as("dm");
    expect((await retractPost(req("POST"), p(old.id))).status).toBe(200);
    expect((await prisma.chatMessage.findUnique({ where: { id: old.id } }))?.hiddenAt).not.toBeNull();
    const audits = await prisma.auditLog.findMany({ where: { action: { in: ["CHAT_RETRACTED", "CHAT_HIDDEN"] } } });
    expect(audits.every((a) => !/Tippfehler|alt"/.test(a.meta ?? ""))).toBe(true);
  });
});

describe("Socket-Räume", () => {
  it("join setzt nur erlaubte Räume (eigene Kanäle, eigene Direktnachrichten, persönlicher Raum)", async () => {
    joinMock.mockClear();
    as("eng");
    expect((await joinPost(req("POST", { socketId: "sock-1" }))).status).toBe(200);
    const rooms = joinMock.mock.calls[0][2] as string[];
    expect(rooms).toContain(`chat:${ch.ENGINEERING}`);
    expect(rooms).toContain(`user:${ids.eng}`);
    expect(rooms).not.toContain(`chat:${ch.HOUSEKEEPING}`);
    expect(rooms).not.toContain(`chat:${ch.hkSup}`);
  });
  it("Nachricht geht nur an den Raum des Kanals, nie global", async () => {
    emitMock.mockClear();
    as("sup");
    await send(ch.ENGINEERING, "Raum-Test");
    const targets = emitMock.mock.calls.filter((c) => c[1] === "chat:message").map((c) => c[0]);
    expect(targets).toEqual([`chat:${ch.ENGINEERING}`]);
  });
  it("fremder Socket wird abgewiesen", async () => {
    joinMock.mockReturnValueOnce("foreign");
    as("hk");
    expect((await joinPost(req("POST", { socketId: "sock-1" }))).status).toBe(403);
  });
});

describe("Einsicht im Streitfall", () => {
  it("nur Duty Manager und nur mit Aktenzeichen; protokolliert ohne Inhalt", async () => {
    as("sup");
    expect((await reviewGet(req("GET", undefined, "http://x/api?caseRef=HR-2026-1"), p(ch.hkSup))).status).toBe(403);
    as("dm");
    expect((await reviewGet(req("GET", undefined, "http://x/api?caseRef=x"), p(ch.hkSup))).status).toBe(403);
    expect((await reviewGet(req("GET", undefined, "http://x/api?caseRef=Peter%20M%C3%BCller"), p(ch.hkSup))).status).toBe(403);
    const r = await reviewGet(req("GET", undefined, "http://x/api?caseRef=HR-2026-014"), p(ch.hkSup));
    expect(r.status).toBe(200);
    expect(((await r.json()) as { messages: unknown[] }).messages.length).toBeGreaterThan(0);
    const a = await prisma.auditLog.findFirst({ where: { action: "CHAT_REVIEWED" } });
    expect(JSON.parse(a?.meta ?? "{}")).toEqual({ channelId: ch.hkSup, caseRef: "HR-2026-014" });
  });
});

describe("Löschfrist", () => {
  it("löscht Nachrichten älter als chatRetentionDays (Standard 14), jüngere bleiben", async () => {
    const now = new Date();
    const old = await prisma.chatMessage.create({ data: { channelId: ch.HOUSEMAN, authorId: ids.hm, body: "uralt", originalLanguage: "de", createdAt: new Date(now.getTime() - 15 * 86_400_000) } });
    const young = await prisma.chatMessage.create({ data: { channelId: ch.HOUSEMAN, authorId: ids.hm, body: "neu", originalLanguage: "de", createdAt: new Date(now.getTime() - 13 * 86_400_000) } });
    const r = await purgeExpiredChat(now);
    expect(r.chatMessages).toBeGreaterThanOrEqual(1);
    expect(await prisma.chatMessage.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await prisma.chatMessage.findUnique({ where: { id: young.id } })).not.toBeNull();
    await prisma.setting.create({ data: { key: "chatRetentionDays", value: "7" } });
    await purgeExpiredChat(now);
    expect(await prisma.chatMessage.findUnique({ where: { id: young.id } })).toBeNull();
  });
});
