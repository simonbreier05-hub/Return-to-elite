import { describe, expect, it } from "vitest";
import { ROLES } from "@/lib/domain";
import { canDirectMessage, canUseChannel, CHAT_CHANNELS, channelsForRole, directKey, directPartnerIds } from "@/lib/chat/policy";
import { CHAT_MAX_LENGTH, resolveMentions, roomRefs, sanitizeBody, tokenize } from "@/lib/chat/text";
import { CHAT_RATE_LIMIT, CHAT_RATE_WINDOW_MS, checkChatRateLimit, resetChatRateLimit } from "@/lib/chat/rateLimit";

/** Freigegebene Kanal-Matrix: jede Rolle nur im eigenen Kanal, Supervisor + Duty Manager in allen, Concierge in keinem. */
const CHANNEL_MATRIX: Record<string, string[]> = {
  room_attendant: ["HOUSEKEEPING"],
  supervisor: [...CHAT_CHANNELS],
  duty_manager: [...CHAT_CHANNELS],
  engineering: ["ENGINEERING"],
  front_office: ["FRONT_OFFICE"],
  houseman: ["HOUSEMAN"],
  concierge: [],
};

describe("Kanal-Rechte je Rolle", () => {
  for (const role of ROLES) {
    it(role, () => {
      expect(channelsForRole(role)).toEqual(CHANNEL_MATRIX[role]);
      for (const key of CHAT_CHANNELS) expect(canUseChannel(role, key)).toBe(CHANNEL_MATRIX[role].includes(key));
    });
  }
  it("unbekannte Kanäle/Rollen nie", () => {
    expect(canUseChannel("supervisor", "CONCIERGE")).toBe(false);
    expect(canUseChannel("guest", "HOUSEKEEPING")).toBe(false);
  });
});

describe("Direktnachrichten: Housekeeper-Regel", () => {
  const u = (role: string, id = role) => ({ id, role });
  it("Housekeeper ↔ nur Supervisor und Duty Manager, in beide Richtungen", () => {
    for (const other of ROLES) {
      const allowed = other === "supervisor" || other === "duty_manager";
      expect(canDirectMessage(u("room_attendant", "hk1"), u(other, `x-${other}`)), `HK → ${other}`).toBe(allowed);
      expect(canDirectMessage(u(other, `x-${other}`), u("room_attendant", "hk1")), `${other} → HK`).toBe(allowed);
    }
  });
  it("alle anderen Rollen untereinander ja, sich selbst nie", () => {
    const others = ROLES.filter((r) => r !== "room_attendant");
    for (const a of others) for (const b of others) expect(canDirectMessage(u(a, `a-${a}`), u(b, `b-${b}`))).toBe(true);
    expect(canDirectMessage(u("supervisor", "s"), u("supervisor", "s"))).toBe(false);
  });
  it("Regel ist per Einstellung änderbar", () => {
    expect(canDirectMessage(u("room_attendant", "h"), u("houseman", "m"), ["supervisor", "duty_manager", "houseman"])).toBe(true);
    expect(canDirectMessage(u("room_attendant", "h"), u("supervisor", "s"), ["duty_manager"])).toBe(false);
  });
  it("Schlüssel einer Unterhaltung ist richtungsunabhängig", () => {
    expect(directKey("b", "a")).toBe(directKey("a", "b"));
    expect(directPartnerIds(directKey("b", "a"))).toEqual(["a", "b"]);
  });
});

describe("Text", () => {
  it("bereinigt Steuerzeichen, begrenzt Länge, lässt HTML als Text", () => {
    expect(sanitizeBody("  hallo\u0000‮ welt  ")).toEqual({ ok: true, body: "hallo welt" });
    expect(sanitizeBody("   ")).toEqual({ ok: false, error: "EMPTY" });
    expect(sanitizeBody("x".repeat(CHAT_MAX_LENGTH + 1))).toEqual({ ok: false, error: "TOO_LONG" });
    expect(sanitizeBody(42)).toEqual({ ok: false, error: "EMPTY" });
    const xss = '<img src=x onerror="alert(1)"> #312';
    const toks = tokenize(xss);
    expect(toks[0]).toEqual({ kind: "text", text: '<img src=x onerror="alert(1)"> ' }); // bleibt reiner Text
    expect(toks[1]).toEqual({ kind: "room", number: "312" });
  });
  it("Zimmerlink #Nummer (3–4 Ziffern), keine Fehlerkennung", () => {
    expect(roomRefs("Bitte #312 und #1204 prüfen, nicht #12 oder #31234")).toEqual(["312", "1204"]);
  });
  it("Erwähnungen: Abteilung und eindeutiger Vorname", () => {
    const people = [{ id: "1", name: "Maria Silva" }, { id: "2", name: "Lukas Hoffmann" }, { id: "3", name: "Maria Kaya" }];
    expect(resolveMentions("@Technik @Lukas @Maria @Unbekannt", people)).toEqual({ users: ["2"], depts: ["ENGINEERING"] });
  });
});

describe("Rate-Limit", () => {
  it(`höchstens ${CHAT_RATE_LIMIT} je Minute und Person`, () => {
    resetChatRateLimit();
    const t0 = 1_000_000;
    for (let i = 0; i < CHAT_RATE_LIMIT; i++) expect(checkChatRateLimit("u1", t0 + i).ok).toBe(true);
    const blocked = checkChatRateLimit("u1", t0 + 100);
    expect(blocked.ok).toBe(false);
    expect(checkChatRateLimit("u2", t0 + 100).ok).toBe(true); // andere Person unberührt
    expect(checkChatRateLimit("u1", t0 + CHAT_RATE_WINDOW_MS + 50).ok).toBe(true);
  });
});
