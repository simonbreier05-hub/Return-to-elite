import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "@/lib/i18n/LocaleContext";
import { EngineeringHub } from "@/components/roles/EngineeringHub";
import { HousemanHub } from "@/components/roles/HousemanHub";
import { engFilterCounts, engKpis, mergeWorkOrder, needsConfirm, NEXT_STEP, normalizeWorkOrder, sortWorkOrders, sourceOf, type WorkOrderView } from "@/lib/ui/engineeringHub";
import { hmFilterCounts, hmKpis, hmPill, matchesHmFilter, mergeHousemanItems } from "@/lib/ui/housemanHub";

// Nur erfundene Testdaten (keine echten Gäste/Mitarbeiter).
const NOW = new Date("2026-11-03T10:00:00Z");
const wo = (over: Record<string, unknown> = {}) => ({
  id: "wo1",
  status: "OPEN",
  createdAt: "2026-11-03T07:12:00Z",
  resolvedAt: null,
  defect: { category: "ELECTRICAL", note: "Licht im Bad", room: { id: "r1", number: "312", status: "DIRTY", floor: 3, openNotesCount: 0 }, reportedBy: { name: "Testgast", role: "guest" } },
  ...over,
});

const noop = () => {};
const render = (el: ReturnType<typeof h>) => renderToStaticMarkup(h(LocaleProvider, null, el));
const engProps = (orders: WorkOrderView[], selectedId: string | null = null) => ({
  orders,
  selectedId,
  onSelect: noop,
  onAdvance: noop,
  busyId: null,
  actionError: null,
  loading: false,
  loadError: null,
  onRetry: noop,
  onPauseChanged: noop,
  onOpenRoom: noop,
  detailMode: "wide" as const,
});

describe("Techniker: Aufträge defensiv lesen", () => {
  it("ohne id kein Auftrag, sonst Ersatzwerte statt Absturz", () => {
    expect(normalizeWorkOrder(null)).toBeNull();
    expect(normalizeWorkOrder({})).toBeNull();
    expect(normalizeWorkOrder("x")).toBeNull();
    const v = normalizeWorkOrder({ id: "a" })!;
    expect(v.status).toBe("OPEN");
    expect(v.room).toEqual({ id: null, number: null, openNotesCount: 0 });
    expect(v.reporter).toEqual({ name: null, role: null });
    expect(v.category).toBeNull();
    expect(normalizeWorkOrder({ id: "b", status: "KAPUTT", defect: { reportedBy: null, room: null } })!.status).toBe("OPEN");
  });
  it("Teil-Update überschreibt nur, was dabei ist", () => {
    const prev = normalizeWorkOrder(wo())!;
    const next = mergeWorkOrder(prev, { id: "wo1", status: "ACK" });
    expect(next.status).toBe("ACK");
    expect(next.room.number).toBe("312");
    expect(next.reporter.role).toBe("guest");
  });
  it("Herkunft, nächster Schritt, Bestätigung nur vor „Erledigt“", () => {
    expect(sourceOf(normalizeWorkOrder(wo())!)).toBe("guest");
    expect(sourceOf(normalizeWorkOrder(wo({ defect: { reportedBy: { role: "room_attendant" } } }))!)).toBe("housekeeping");
    expect(NEXT_STEP.OPEN?.to).toBe("ACK");
    expect(NEXT_STEP.IN_PROGRESS?.to).toBe("RESOLVED");
    expect(NEXT_STEP.RESOLVED).toBeNull();
    expect(needsConfirm("RESOLVED")).toBe(true);
    expect(needsConfirm("ACK")).toBe(false);
  });
  it("Kennzahlen, Filter, Reihenfolge", () => {
    const list = [
      normalizeWorkOrder(wo({ id: "a", status: "RESOLVED", resolvedAt: "2026-11-03T09:00:00Z" }))!,
      normalizeWorkOrder(wo({ id: "b", status: "IN_PROGRESS" }))!,
      normalizeWorkOrder(wo({ id: "c", status: "RESOLVED", resolvedAt: "2026-11-01T09:00:00Z" }))!,
      normalizeWorkOrder(wo({ id: "d", defect: { reportedBy: { role: "supervisor" } } }))!,
    ];
    expect(engKpis(list, NOW)).toEqual({ open: 1, inProgress: 1, doneToday: 1, guestOpen: 1 });
    expect(engFilterCounts(list)).toEqual([
      { filter: "all", count: 4 },
      { filter: "guest", count: 1 },
      { filter: "housekeeping", count: 1 },
      { filter: "done", count: 2 },
    ]);
    expect(sortWorkOrders(list).map((v) => v.id)).toEqual(["b", "d", "a", "c"]);
  });
});

describe("Techniker-Ansicht stürzt mit unvollständigen Daten nicht ab", () => {
  const broken = [
    { id: "x1" },
    { id: "x2", defect: null },
    { id: "x3", defect: { room: null, reportedBy: null } },
    { id: "x4", status: "IN_PROGRESS", defect: { category: "PLUMBING", room: { number: "205" } }, pause: { since: "2026-11-03T08:00:00Z" } },
    { id: "x5", createdAt: "kein-datum", defect: { reportedBy: { role: "guest" }, photoPath: "/api/uploads/test.jpg" } },
  ]
    .map(normalizeWorkOrder)
    .filter((x): x is WorkOrderView => !!x);

  it("Liste rendert, fehlende Angaben als „Unbekannt“", () => {
    const html = render(h(EngineeringHub, engProps(broken)));
    expect(html).toContain('data-testid="engineering-hub"');
    expect(html).toContain("Unbekannt");
    expect(html).toContain("Zi. 205");
  });
  for (const v of broken) {
    it(`Detail für ${v.id} rendert`, () => {
      const html = render(h(EngineeringHub, engProps(broken, v.id)));
      expect(html).toContain('data-testid="eng-detail"');
    });
  }
  it("Laden, Fehler und leer haben eigene Zustände", () => {
    expect(render(h(EngineeringHub, { ...engProps([]), loading: true }))).toContain('data-testid="role-loading"');
    expect(render(h(EngineeringHub, { ...engProps([]), loadError: "x" }))).toContain('data-testid="role-error"');
    expect(render(h(EngineeringHub, engProps([])))).toContain('data-testid="role-empty"');
  });
  it("Hauptknopf zeigt den nächsten Schritt, erledigte Aufträge haben keinen", () => {
    const open = normalizeWorkOrder(wo({ status: "IN_PROGRESS" }))!;
    expect(render(h(EngineeringHub, engProps([open], open.id)))).toContain("Als erledigt markieren");
    const done = normalizeWorkOrder(wo({ status: "RESOLVED" }))!;
    const doneHtml = render(h(EngineeringHub, engProps([done], done.id)));
    expect(doneHtml).not.toContain("Als erledigt markieren");
    expect(doneHtml).not.toContain("Bestätigen");
  });
});

describe("Hausmann: eine Liste aus Traces und Aufgaben", () => {
  const traces = [
    { id: "t1", roomId: "r7", roomNumber: "207", floor: 2, text: "Twinbett aufbauen", times: ["10:00"], status: "OPEN", doneAt: null, roomTaskId: "k1", guest: "Herr Dr. Test", waitsForDeparture: false },
    { id: "t2", roomNumber: "208", floor: 2, text: "Twin zurück", times: [], status: "DONE", doneAt: "2026-11-03T08:00:00Z", roomTaskId: null, guest: null, waitsForDeparture: true },
    { id: null, roomNumber: "999" },
  ];
  const tasks = [
    { id: "k1", type: "TWIN_SETUP", status: "OPEN", room: { id: "r7", number: "207", floor: 2 }, createdBy: { name: "Supervisor Test" } },
    { id: "k2", type: "SONSTIGES", note: "Kissen tauschen", status: "OPEN", createdAt: "2026-11-03T07:00:00Z", room: { id: "r5", number: "305", floor: 3 }, createdBy: null },
    { id: "k3", type: "TWIN_REVERT", status: "DONE", doneAt: "2026-10-30T08:00:00Z", room: { number: "410", floor: 4 } },
    { id: "k4", type: "TWIN_REVERT", status: "OPEN" },
  ];
  const items = mergeHousemanItems(traces, tasks, NOW);

  it("verknüpfte Aufgaben nicht doppelt, alte erledigte nicht, kaputte Zeilen weg, offene zuerst", () => {
    expect(items.map((i) => i.key)).toEqual(["trace:t1", "task:k2", "trace:t2"]);
  });
  it("Kennzahlen, Filter (auch Etage), Pillen", () => {
    expect(hmKpis(items)).toEqual({ total: 3, done: 1, open: 2, waits: 0 });
    expect(hmFilterCounts(items)).toEqual([
      { filter: "all", count: 3 },
      { filter: "open", count: 2 },
      { filter: "traces", count: 2 },
      { filter: "done", count: 1 },
    ]);
    expect(items.filter((i) => matchesHmFilter(i, "all", 3)).map((i) => i.roomNumber)).toEqual(["305"]);
    expect(hmPill(items[0]).labelKey).toBe("roleHub.trace");
    expect(hmPill(items[2]).tone).toBe("success");
  });
  it("Ansicht rendert Liste und Detail", () => {
    const props = { items, floors: [2, 3], selectedKey: "trace:t1", onSelect: noop, onToggle: noop, busyKey: null, actionError: null, loading: false, loadError: null, onRetry: noop, onPauseChanged: noop, detailMode: "wide" as const };
    const html = render(h(HousemanHub, props));
    expect(html).toContain('data-testid="houseman-hub"');
    expect(html).toContain('data-testid="hm-detail"');
    expect(html).toContain("Herr Dr. Test");
    expect(html).toContain("Kissen tauschen · Zi. 305");
  });
});
