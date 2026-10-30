import { describe, expect, it } from "vitest";
import { canSeeMessages, canWorkOn, checkPause, messageRecipients, messagesOutOfScope, type RoomInvolvement, type Viewer, type WorkTarget } from "@/lib/work/access";

const hk: Viewer = { role: "room_attendant", userId: "hk1", floors: null };
const otherHk: Viewer = { role: "room_attendant", userId: "hk2", floors: null };
const sup3: Viewer = { role: "supervisor", userId: "sup3", floors: [3] };
const supAll: Viewer = { role: "supervisor", userId: "supX", floors: null };
const dm: Viewer = { role: "duty_manager", userId: "dm", floors: null };
const hm: Viewer = { role: "houseman", userId: "hm1", floors: null };
const eng: Viewer = { role: "engineering", userId: "eng1", floors: null };
const fo: Viewer = { role: "front_office", userId: "fo", floors: null };

const room = (o: Partial<WorkTarget> = {}): WorkTarget => ({ type: "ROOM", floor: 3, assigneeId: "hk1", done: false, started: true, ...o });

describe("Pausieren — ein Mechanismus, Rollenrechte", () => {
  it("Zimmermädchen nur eigenes, begonnenes Zimmer", () => {
    expect(checkPause(hk, room(), "pause", false)).toEqual({ ok: true });
    expect(checkPause(otherHk, room(), "pause", false)).toMatchObject({ ok: false, status: 403 });
    expect(checkPause(hk, room({ started: false }), "pause", false)).toMatchObject({ ok: false, status: 409 });
  });
  it("erledigte Arbeit lässt sich nicht pausieren, doppelt auch nicht", () => {
    expect(checkPause(hk, room({ done: true }), "pause", false)).toMatchObject({ ok: false, status: 409 });
    expect(checkPause(hk, room(), "pause", true)).toMatchObject({ ok: false, status: 409 });
  });
  it("Fortsetzen geht jederzeit, aber nur bei aktiver Pause", () => {
    expect(checkPause(hk, room({ started: false, done: true }), "resume", true)).toEqual({ ok: true });
    expect(checkPause(hk, room(), "resume", false)).toMatchObject({ ok: false, status: 409 });
  });
  it("Supervisor nur eigene Etagen (ohne Etagen: ganzes Haus), Duty Manager alles", () => {
    expect(canWorkOn(sup3, room())).toBe(true);
    expect(canWorkOn(sup3, room({ floor: 4 }))).toBe(false);
    expect(canWorkOn(supAll, room({ floor: 4 }))).toBe(true);
    expect(canWorkOn(dm, room({ floor: 5, assigneeId: null }))).toBe(true);
  });
  it("Hausmann: eigene und nicht zugeteilte Aufgaben, Traces nur der Abteilung Hausmann", () => {
    expect(canWorkOn(hm, { type: "ROOMTASK", floor: 2, assigneeId: null, done: false })).toBe(true);
    expect(canWorkOn(hm, { type: "ROOMTASK", floor: 2, assigneeId: "hm2", done: false })).toBe(false);
    expect(canWorkOn(hm, { type: "TRACE", floor: 2, assigneeId: "hm1", done: false, dept: "HOUSEMAN" })).toBe(true);
    expect(canWorkOn(hm, { type: "TRACE", floor: 2, assigneeId: null, done: false, dept: "HOUSEKEEPING" })).toBe(false);
    expect(canWorkOn(hm, room())).toBe(false);
  });
  it("Technik: Arbeitsaufträge (eigene oder nicht zugeteilte); andere Rollen nie", () => {
    expect(canWorkOn(eng, { type: "WORKORDER", floor: 1, assigneeId: null, done: false })).toBe(true);
    expect(canWorkOn(eng, { type: "WORKORDER", floor: 1, assigneeId: "eng2", done: false })).toBe(false);
    expect(canWorkOn(fo, { type: "WORKORDER", floor: 1, assigneeId: null, done: false })).toBe(false);
    expect(canWorkOn(hk, { type: "WORKORDER", floor: 3, assigneeId: null, done: false })).toBe(false);
  });
});

describe("Nachrichten — Sichtbarkeit nach Rolle", () => {
  const inv: RoomInvolvement = { floor: 3, housekeeperId: "hk1", housemanIds: ["hm1"], engineerIds: ["*"] };
  it("zuständiges Zimmermädchen ja, fremdes nein", () => {
    expect(canSeeMessages(hk, inv)).toBe(true);
    expect(canSeeMessages(otherHk, inv)).toBe(false);
  });
  it("Supervisor nur auf eigener Etage, Duty Manager immer", () => {
    expect(canSeeMessages(sup3, inv)).toBe(true);
    expect(canSeeMessages({ ...sup3, floors: [4] }, inv)).toBe(false);
    expect(canSeeMessages(dm, { ...inv, housekeeperId: null })).toBe(true);
  });
  it("Hausmann/Technik nur wenn beteiligt ('*' = Aufgabe für alle der Abteilung)", () => {
    expect(canSeeMessages(hm, inv)).toBe(true);
    expect(canSeeMessages({ ...hm, userId: "hm2" }, inv)).toBe(false);
    expect(canSeeMessages(eng, inv)).toBe(true);
    expect(canSeeMessages(eng, { ...inv, engineerIds: [] })).toBe(false);
  });
  it("Supervisor ohne Etagen sieht alles, aber als „außerhalb der Zuständigkeit“", () => {
    expect(canSeeMessages(supAll, inv)).toBe(true);
    expect(messagesOutOfScope(supAll, inv)).toBe(true);
    expect(messagesOutOfScope(sup3, inv)).toBe(false);
    expect(messagesOutOfScope(dm, inv)).toBe(false);
    expect(messagesOutOfScope(hk, inv)).toBe(false);
  });
  it("Front Office/Concierge sehen keine Nachrichten", () => {
    expect(canSeeMessages(fo, inv)).toBe(false);
    expect(canSeeMessages({ ...fo, role: "concierge" }, inv)).toBe(false);
  });
});

describe("Nachrichten — wer wird gemeldet", () => {
  const base = { supervisors: [{ id: "sup3", floors: [3] }, { id: "sup4", floors: [4] }], housemen: ["hm1", "hm2"], engineers: ["eng1"], dutyManagers: ["dm"] };
  it("Zimmermädchen, Supervisor der Etage, beteiligte Hausmänner — nie der Autor", () => {
    const r = messageRecipients({ ...base, authorId: "hk1", involvement: { floor: 3, housekeeperId: "hk1", housemanIds: ["*"], engineerIds: [] } });
    expect(r).toEqual([{ userId: "sup3", role: "supervisor" }, { userId: "hm1", role: "houseman" }, { userId: "hm2", role: "houseman" }]);
  });
  it("Duty Manager nur, wenn sonst niemand zuständig ist", () => {
    expect(messageRecipients({ ...base, authorId: "x", involvement: { floor: 5, housekeeperId: null, housemanIds: [], engineerIds: [] } })).toEqual([{ userId: "dm", role: "duty_manager" }]);
    expect(messageRecipients({ ...base, authorId: "sup3", involvement: { floor: 3, housekeeperId: "hk1", housemanIds: [], engineerIds: ["eng1"] } }).map((x) => x.userId)).toEqual(["hk1", "eng1"]);
  });
});
