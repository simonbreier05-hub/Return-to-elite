/**
 * Betrieb L2 (Entscheidungen der Housekeeping-Leitung vom 13.11.2026) — reine Regeln, je Punkt mindestens ein Test.
 * Erfundene Daten, keine Gastnamen.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KIND_PILL, hkMarkers, type HkRoomView } from "@/lib/ui/hkHub";
import { CATEGORY_PILL_TONE } from "@/lib/ui/pill-tone";
import { CLEAN_KIND_UI } from "@/lib/ui/tagesplan";
import { LABEL_STYLE } from "@/components/lists/RoomRowView";
import { workProgress } from "@/lib/ui/workProgress";
import { lateCheckoutFrom, mergedLateCheckout } from "@/lib/dayplan/lateCheckout";
import { deriveDayPlan } from "@/lib/dayplan/derive";
import { berlinHour, dndReminderDue } from "@/lib/rooms/dndReminder";
import { foStage, FO_STAGES } from "@/lib/ui/frontOfficeHub";
import { checkTransition } from "@/lib/stateMachine";
import { canSeeDefectPhotos, withoutPhotosFor } from "@/lib/rooms/defectPhotoAccess";
import { isRecurringDue } from "@/lib/houseman/recurring";
import { compareHousemanItems } from "@/lib/houseman/order";
import { mergeHousemanItems } from "@/lib/ui/housemanHub";
import { readReceipt } from "@/lib/chat/readReceipt";
import { isUrgent } from "@/lib/ui/notify";
import { GUEST_ACTIONS } from "@/lib/guestActions";
import { DEFAULT_SETTINGS } from "@/lib/domain";

const SRC = path.join(__dirname, "..", "..", "src");
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

describe("Punkt 1 — Farben: Bleiber Grün, Abreise Rot, Anreise Blau, Turn Blau/Rot; Wäsche als Symbol", () => {
  it("Glas-Pillen", () => {
    expect(KIND_PILL.STAYOVER.tone).toBe("success");
    expect(KIND_PILL.DEPARTURE.tone).toBe("danger");
    expect(KIND_PILL.ARRIVAL.tone).toBe("info");
    expect(KIND_PILL.SAME_DAY_TURN).toMatchObject({ tone: "info", edge: "danger" });
    expect(CATEGORY_PILL_TONE).toMatchObject({ STAYOVER: "success", DEPARTURE: "danger", ARRIVAL: "info", SAME_DAY_TURN: "info" });
    expect(CLEAN_KIND_UI.tidy.tone).toBe("success");
    expect(CLEAN_KIND_UI.linen).toMatchObject({ tone: "success", icon: "shirt" });
    expect(CLEAN_KIND_UI.deep.tone).toBe("danger");
  });
  it("helle Listenzeile: gleiche Zuordnung (Turn: blaue Pille, roter Rand)", () => {
    expect(LABEL_STYLE.STAYOVER.chip).toContain("status-clean");
    expect(LABEL_STYLE.DEPARTURE.chip).toContain("status-dirty");
    expect(LABEL_STYLE.ARRIVAL.chip).toContain("status-inspected");
    expect(LABEL_STYLE.TURN.chip).toContain("status-inspected");
    expect(LABEL_STYLE.TURN.edge).toContain("status-dirty");
  });
  it("Wäschewechsel-Symbol bleibt unter den 2 sichtbaren Markern, auch mit Priorität", () => {
    const v: HkRoomView = { id: "x", number: "305", status: "DIRTY", kind: "STAYOVER", vip: true, laundry: true, dnd: false, paused: false, defects: 1, eta: null, early: false, urgent: true };
    expect(hkMarkers(v).slice(0, 2)).toEqual(["priority", "laundry"]);
  });
});

describe("Punkt 2 — In Arbeit: Start, Laufzeit, Restzeit aus Credit-Minuten", () => {
  const start = "2026-11-14T09:00:00.000Z";
  it("im Plan: Restzeit = Schätzung − Laufzeit", () => {
    expect(workProgress(start, 60, new Date("2026-11-14T09:25:00Z"))).toEqual({ startedAt: start, elapsedMin: 25, remainingMin: 35, overMin: 0 });
  });
  it("über der Schätzung: Rest 0, Überzug sichtbar; ohne Start nichts", () => {
    expect(workProgress(start, 40, new Date("2026-11-14T09:50:00Z"))).toMatchObject({ remainingMin: 0, overMin: 10 });
    expect(workProgress(null, 40, new Date())).toBeNull();
  });
});

describe("Punkt 3 — Late Check-out aus dem Report (nach 11:00) oder von Hand", () => {
  it("Grenze 660 Minuten = 11:00", () => {
    expect(DEFAULT_SETTINGS.lateCheckoutAfterMinutes).toBe(660);
    expect(lateCheckoutFrom("11:00", 660)).toBeNull();
    expect(lateCheckoutFrom("13:30", 660)).toBe("13:30");
    expect(lateCheckoutFrom(null, 660)).toBeNull();
    expect(lateCheckoutFrom("kaputt", 660)).toBeNull();
  });
  it("Handeingabe des Front Office bleibt beim nächsten Import stehen", () => {
    expect(mergedLateCheckout({ lateCheckout: "14:00", lateCheckoutManual: true }, "12:00")).toEqual({ lateCheckout: "14:00", lateCheckoutManual: true });
    expect(mergedLateCheckout({ lateCheckout: "14:00", lateCheckoutManual: false }, null)).toEqual({ lateCheckout: null, lateCheckoutManual: false });
    expect(mergedLateCheckout(undefined, "12:30")).toEqual({ lateCheckout: "12:30", lateCheckoutManual: false });
  });
  it("die Abreisezeit aus Departures erreicht den Tagesplan (Abreise und Turn)", () => {
    const guest = { salutation: null, title: null, lastName: "Test", fullName: "Test" };
    const dep = (room: string, depTime: string | null) => ({ room, guest, arrDate: "2026-11-12", depDate: "2026-11-14", adults: 1, children: 0, nights: 2, status: "DUOT", depTime, vip: false });
    const { rooms } = deriveDayPlan({
      date: "2026-11-14", linenCycleDays: 3,
      departures: [dep("101", "13:00"), dep("102", null)],
      arrivals: [{ room: "102", guest, arrDate: "2026-11-14", depDate: "2026-11-16", adults: 1, children: 0, nights: 2, status: "RESV", arrTime: "15:00", vip: false }],
    });
    expect(rooms.find((r) => r.room === "101")).toMatchObject({ cleaningType: "DEPARTURE", depTime: "13:00" });
    expect(rooms.find((r) => r.room === "102")).toMatchObject({ cleaningType: "SAME_DAY_TURN", depTime: null });
  });
});

describe("Punkt 4 — DND ab 12:00: Karte hängen, nicht gereinigt", () => {
  const noonBerlin = new Date("2026-11-14T11:30:00Z"); // 12:30 Berlin (MEZ)
  const morning = new Date("2026-11-14T09:30:00Z"); // 10:30 Berlin
  it("Berliner Stunde", () => { expect(berlinHour(noonBerlin)).toBe(12); expect(berlinHour(morning)).toBe(10); });
  it("fällig nur mit DND, offener Reinigung und ab der Stunde (Standard 12)", () => {
    expect(DEFAULT_SETTINGS.dndReminderHour).toBe(12);
    expect(dndReminderDue({ dnd: true, status: "DIRTY", toClean: true }, noonBerlin, 12)).toBe(true);
    expect(dndReminderDue({ dnd: true, status: "DIRTY", toClean: true }, morning, 12)).toBe(false);
    expect(dndReminderDue({ dnd: true, status: "CLEAN", toClean: true }, noonBerlin, 12)).toBe(false);
    expect(dndReminderDue({ dnd: false, status: "DIRTY", toClean: true }, noonBerlin, 12)).toBe(false);
    expect(dndReminderDue({ dnd: true, status: "BLOCKED", toClean: false }, noonBerlin, 12)).toBe(false);
  });
});

describe("Punkt 5 — Abnahme einzeln; Front Office sieht in Arbeit → geprüft → freigegeben", () => {
  it("Stufen aus dem Zimmerstatus (Nacharbeit = wieder in Arbeit)", () => {
    expect(FO_STAGES).toEqual(["OPEN", "IN_PROGRESS", "CHECK", "RELEASED"]);
    expect(["DIRTY", "IN_PROGRESS", "PICKUP", "CLEAN", "INSPECTED"].map((s) => foStage(s as never))).toEqual(["OPEN", "IN_PROGRESS", "IN_PROGRESS", "CHECK", "RELEASED"]);
  });
  it("Ablehnung braucht einen Grund (Nacharbeit nur mit Notiz) — Regel ist im Status-Weg", () => {
    expect(readFileSync(path.join(SRC, "lib/rooms/applyStatusChange.ts"), "utf8")).toContain("REWORK_NOTE_REQUIRED");
  });
  it("„Alle freigeben“ gibt es in keiner Oberfläche mehr", () => {
    const hits = walk(path.join(SRC, "components")).concat(walk(path.join(SRC, "app")))
      .filter((f) => /\.tsx$/.test(f) && /releaseAll|onReleaseAll/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});

describe("Punkt 7 — Technik darf ein Zimmer außer Betrieb setzen, sonst nichts Neues", () => {
  it("OUT_OF_ORDER erlaubt, Freigeben/Reinigungsstatus nicht", () => {
    expect(checkTransition("engineering", "DIRTY", "OUT_OF_ORDER").ok).toBe(true);
    expect(checkTransition("engineering", "CLEAN", "INSPECTED").ok).toBe(false);
    expect(checkTransition("engineering", "DIRTY", "IN_PROGRESS").ok).toBe(false);
    expect(checkTransition("engineering", "OUT_OF_ORDER", "DIRTY").ok).toBe(false);
  });
});

describe("Punkt 8 — Mängel-Fotos nur Technik, Supervisor, Duty Manager", () => {
  it("Rollen", () => {
    expect(["engineering", "supervisor", "duty_manager"].every(canSeeDefectPhotos)).toBe(true);
    expect(["room_attendant", "front_office", "concierge", "houseman", "guest", null].some((r) => canSeeDefectPhotos(r))).toBe(false);
  });
  it("Pfade werden für andere Rollen entfernt", () => {
    const d = [{ id: "1", photoPath: "/api/uploads/a.jpg" }];
    expect(withoutPhotosFor("room_attendant", d)[0].photoPath).toBeNull();
    expect(withoutPhotosFor("engineering", d)[0].photoPath).toBe("/api/uploads/a.jpg");
  });
});

describe("Punkt 9 — wiederkehrende Hausmann-Aufgaben, Sortierung nach Anreisezeit", () => {
  it("„alle 2 Tage“ ab Starttag; pausiert nie fällig", () => {
    const t = { startDate: "2026-11-14", everyDays: 2, active: true };
    expect(["2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16", "2026-12-14"].map((d) => isRecurringDue(t, d))).toEqual([false, true, false, true, true]);
    expect(isRecurringDue({ ...t, active: false }, "2026-11-14")).toBe(false);
  });
  it("offen zuerst, mit Anreisezeit nach Uhrzeit, sonst Zimmernummer; erledigt am Ende", () => {
    const items = [
      { status: "OPEN", eta: null, roomNumber: "210" },
      { status: "DONE", eta: "09:00", roomNumber: "101" },
      { status: "OPEN", eta: "15:00", roomNumber: "305" },
      { status: "OPEN", eta: null, roomNumber: "102" },
      { status: "OPEN", eta: "11:30", roomNumber: "520" },
    ];
    expect([...items].sort(compareHousemanItems).map((i) => i.roomNumber)).toEqual(["520", "305", "102", "210", "101"]);
  });
  it("Hausmann-Hub sortiert Traces und Aufgaben gemeinsam nach derselben Regel", () => {
    const traces = [{ id: "t1", roomNumber: "305", status: "OPEN", eta: null }, { id: "t2", roomNumber: "401", status: "OPEN", eta: "12:00" }];
    const tasks = [{ id: "k1", room: { number: "102" }, status: "OPEN", note: "Blumen gießen", eta: "10:00" }];
    expect(mergeHousemanItems(traces, tasks).map((i) => i.roomNumber)).toEqual(["102", "401", "305"]);
  });
});

describe("Punkt 10 — Lesebestätigung; Pop-up + Ton für Arbeitsfluss-Meldungen", () => {
  const at = new Date("2026-11-14T10:00:00Z");
  it("zählt Leser nach der Nachricht, ohne Absender", () => {
    const reads = new Map([["b", new Date("2026-11-14T10:05:00Z")], ["c", new Date("2026-11-14T09:00:00Z")], ["a", new Date("2026-11-14T11:00:00Z")]]);
    expect(readReceipt(at, "a", ["a", "b", "c", "d"], reads)).toEqual({ read: 1, total: 3 });
    expect(readReceipt(at, "a", ["a", "b"], reads)).toEqual({ read: 1, total: 1 });
  });
  it("Rush, Ablehnung, Ausgecheckt, Mangel, VIP-Frühanreise sind dringend (Stufe warning → Pop-up bleibt, doppelter Ton)", () => {
    expect(isUrgent({ level: "warning" })).toBe(true);
    const src = readFileSync(path.join(SRC, "lib/rooms/notifyRoomChange.ts"), "utf8");
    for (const k of ["PRIORITY", "REWORK", "CHECKED_OUT", "DND_REMINDER"]) expect(src).toMatch(new RegExp(`URGENT[^\\n]*"${k}"`));
    expect(readFileSync(path.join(SRC, "lib/rooms/reportDefect.ts"), "utf8")).toContain('level: "warning"');
    expect(readFileSync(path.join(SRC, "app/api/arrivals/[id]/route.ts"), "utf8")).toContain('level: "warning"');
  });
});

describe("Punkt 11 — Green Option im Gastzugang", () => {
  it("ist eine Gastaktion", () => { expect(GUEST_ACTIONS).toContain("green"); });
});
