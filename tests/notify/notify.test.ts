import { describe, expect, it } from "vitest";
import {
  chatNeedsToast, freshFor, isDuplicate, isMine, isUnreadMine, isUrgent, isVisible, parseSoundPref, pushToasts, shouldResync,
  soundFor, targetFor, toastDuration, toastsFor, type NotifyNotification, type NotifyToast,
} from "@/lib/ui/notify";

const hk = { role: "room_attendant", userId: "hk1" };
const dm = { role: "duty_manager", userId: "dm1" };
const n = (id: string, extra: Partial<NotifyNotification> = {}): NotifyNotification => ({ id, type: "ROOM_CHANGED", level: "info", targetRole: "room_attendant", targetUserId: null, acknowledged: false, ...extra });

describe("meine? (Pop-up, Ton, Zähler)", () => {
  it("Rolle passt, ohne Person → meins; an andere Person → nicht meins", () => {
    expect(isMine(n("a"), hk)).toBe(true);
    expect(isMine(n("a", { targetUserId: "hk1" }), hk)).toBe(true);
    expect(isMine(n("a", { targetUserId: "hk2" }), hk)).toBe(false);
    expect(isMine(n("a", { targetRole: "supervisor" }), hk)).toBe(false);
  });
  it("Duty Manager: sieht alles in der Liste, „meins“ sind nur DM-Meldungen bzw. an ihn", () => {
    expect(isVisible(n("a"), dm)).toBe(true);
    expect(isMine(n("a"), dm)).toBe(false);
    expect(isMine(n("a", { targetRole: "duty_manager" }), dm)).toBe(true);
    expect(isMine(n("a", { targetRole: "duty_manager", targetUserId: "dm2" }), dm)).toBe(false);
  });
  it("ohne bekannte userId ist eine persönliche Meldung nie meine", () => {
    expect(isMine(n("a", { targetUserId: "hk1" }), { role: "room_attendant", userId: null })).toBe(false);
  });
  it("Ungelesen zählt nur, wenn meins und nicht quittiert", () => {
    expect(isUnreadMine(n("a"), hk)).toBe(true);
    expect(isUnreadMine(n("a", { acknowledged: true }), hk)).toBe(false);
    expect(isUnreadMine(n("a"), dm)).toBe(false);
  });
});

describe("dringend?", () => {
  it("warning/critical und Chat „dringend“ sind dringend, info nicht", () => {
    expect(isUrgent({ level: "info" })).toBe(false);
    expect(isUrgent({ level: "warning" })).toBe(true);
    expect(isUrgent({ level: "critical" })).toBe(true);
    expect(isUrgent({ urgent: true })).toBe(true);
  });
  it("Dauer: normal 8 s, dringend bleibt", () => {
    expect(toastDuration({ urgent: false })).toBe(8000);
    expect(toastDuration({ urgent: true })).toBeNull();
  });
  it("Ton: dringend doppelt, sonst normal, ohne Pop-up keiner", () => {
    expect(soundFor([])).toBeNull();
    expect(soundFor([{ urgent: false }])).toBe("normal");
    expect(soundFor([{ urgent: false }, { urgent: true }])).toBe("urgent");
  });
});

describe("Duplikat?", () => {
  it("bereits gesehene Meldungen kommen nicht noch einmal", () => {
    const seen = new Set(["a"]);
    expect(isDuplicate(seen, "a")).toBe(true);
    expect(freshFor([n("a"), n("b"), n("c", { acknowledged: true }), n("d", { targetUserId: "hk2" })], seen, hk).map((x) => x.id)).toEqual(["b"]);
  });
  it("Stapel nimmt dieselbe ID nicht zweimal", () => {
    const t = toastsFor([n("a")]);
    expect(pushToasts(t, t)).toHaveLength(1);
  });
});

describe("Sammeln", () => {
  it("1–2 gleichzeitig: je ein Pop-up; ab 3: eines „3 neue Meldungen“", () => {
    expect(toastsFor([n("a"), n("b")]).map((t) => t.kind)).toEqual(["notification", "notification"]);
    const s = toastsFor([n("a"), n("b"), n("c", { level: "critical" })]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ kind: "summary", count: 3, urgent: true });
  });
  it("höchstens 3 gestapelt, neueste oben; verdrängt wird zuerst eine nicht dringende", () => {
    let st: NotifyToast[] = [];
    st = pushToasts(st, toastsFor([n("u", { level: "warning" })]));
    st = pushToasts(st, toastsFor([n("a")]));
    st = pushToasts(st, toastsFor([n("b")]));
    st = pushToasts(st, toastsFor([n("c")]));
    expect(st.map((t) => t.id)).toEqual(["c", "b", "u"]);
  });
});

describe("Ziel beim Antippen", () => {
  it("Zimmer, Chat, Auftrag (Technik), sonst Liste", () => {
    const room = toastsFor([n("a", { roomId: "r1", messageVars: JSON.stringify({ n: "305", floor: 3 }) })])[0];
    expect(targetFor(room, hk)).toEqual({ kind: "room", roomId: "r1", number: "305" });
    expect(targetFor({ id: "c", kind: "chat", urgent: false, channelId: "ch1", title: "", text: "" }, hk)).toEqual({ kind: "chat", channelId: "ch1" });
    const wo = toastsFor([n("w", { type: "WORK_ORDER", targetRole: "engineering", roomId: "r1" })])[0];
    expect(targetFor(wo, { role: "engineering", userId: "e1" })).toEqual({ kind: "href", href: "/engineering" });
    expect(targetFor(toastsFor([n("x")])[0], hk)).toEqual({ kind: "list" });
    expect(targetFor({ id: "s", kind: "summary", urgent: false, count: 4 }, hk)).toEqual({ kind: "list" });
  });
});

describe("Chat, Ton-Einstellung, Neuladen", () => {
  it("eigene Nachricht und offener Kanal: kein Pop-up", () => {
    expect(chatNeedsToast({ authorId: "hk1", channelId: "c" }, hk, null, false)).toBe(false);
    expect(chatNeedsToast({ authorId: "x", channelId: "c" }, hk, "c", true)).toBe(false);
    expect(chatNeedsToast({ authorId: "x", channelId: "c" }, hk, "d", true)).toBe(true);
  });
  it("Ton-Einstellung: nur on/off gelten, sonst noch nicht gefragt", () => {
    expect(parseSoundPref("on")).toBe("on");
    expect(parseSoundPref("off")).toBe("off");
    expect(parseSoundPref(null)).toBeNull();
    expect(parseSoundPref("yes")).toBeNull();
  });
  it("Neuladen höchstens alle 2 s", () => {
    expect(shouldResync(0, 2000)).toBe(true);
    expect(shouldResync(1000, 2500)).toBe(false);
  });
});
