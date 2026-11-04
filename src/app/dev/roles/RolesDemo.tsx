"use client";

import { useState } from "react";
import { EngineeringHub } from "@/components/roles/EngineeringHub";
import { HousemanHub } from "@/components/roles/HousemanHub";
import { FrontOfficeHub } from "@/components/roles/FrontOfficeHub";
import { ConciergeHub } from "@/components/roles/ConciergeHub";
import { normalizeArrival, type ArrivalView } from "@/lib/ui/frontOfficeHub";
import { normalizeExcursion, type ExcursionView } from "@/lib/ui/conciergeHub";
import { normalizeWorkOrder, type WorkOrderView } from "@/lib/ui/engineeringHub";
import { mergeHousemanItems } from "@/lib/ui/housemanHub";
import { berlinDate, berlinToUtc } from "@/lib/dayplan/time";
import { hhmm } from "@/lib/i18n/format";

export type DemoRole = "engineering" | "houseman" | "front_office" | "concierge";

/** Erfundene Testdaten wie im Figma-Entwurf (keine echten Gäste/Mitarbeiter, kein Alter). Uhrzeiten = heute. */
const today = (hhmm: string) => berlinToUtc(berlinDate(new Date()), hhmm).toISOString();
const room = (n: string) => ({ id: `demo-${n}`, number: n, status: "DIRTY", floor: Number(n[0]), openNotesCount: 0 });

const ORDERS = [
  { id: "w312", status: "IN_PROGRESS", createdAt: today("08:12"), defect: { category: "ELECTRICAL", note: "Licht im Bad defekt", room: room("312"), reportedBy: { name: "Gast", role: "guest" } } },
  { id: "w214", status: "OPEN", createdAt: today("07:48"), defect: { category: "HVAC", note: "Klimaanlage laut", room: room("214"), reportedBy: { name: "Ana Lima", role: "room_attendant" } } },
  { id: "w318", status: "ACK", createdAt: today("07:20"), defect: { category: "IT_TV", note: "Fernseher ohne Ton", room: room("318"), reportedBy: { name: "Gast", role: "guest" } } },
  { id: "w107", status: "OPEN", createdAt: today("06:55"), defect: { category: "PLUMBING", note: "Wasserhahn tropft", room: room("107"), reportedBy: { name: "Mia Roth", role: "supervisor" } } },
  { id: "w410", status: "RESOLVED", createdAt: today("06:10"), resolvedAt: today("07:30"), defect: { category: "FURNITURE", note: "Schranktür klemmt", room: room("410"), reportedBy: null } },
]
  .map(normalizeWorkOrder)
  .filter((x): x is WorkOrderView => !!x);

const TRACES = [
  { id: "t207", roomId: "demo-207", roomNumber: "207", floor: 2, text: "Twinbett", times: ["10:00"], status: "OPEN", doneAt: null, roomTaskId: null, guest: "Herr Dr. Krüger", waitsForDeparture: false },
  { id: "t208", roomId: "demo-208", roomNumber: "208", floor: 2, text: "Twin zurück", times: ["11:30"], status: "OPEN", doneAt: null, roomTaskId: null, guest: "Frau Dubois", waitsForDeparture: true },
  { id: "t412", roomId: "demo-412", roomNumber: "412", floor: 4, text: "Zusatzbett", times: ["15:00"], status: "OPEN", doneAt: null, roomTaskId: null, guest: "Herr Tan", waitsForDeparture: false },
  { id: "t316", roomId: "demo-316", roomNumber: "316", floor: 3, text: "Babybett", times: [], status: "DONE", doneAt: today("08:40"), roomTaskId: null, guest: null, waitsForDeparture: false },
];
const TASKS = [
  { id: "k305", type: "SONSTIGES", note: "Kissen tauschen", status: "OPEN", createdAt: today("12:00"), room: { id: "demo-305", number: "305", floor: 3 }, createdBy: { name: "Mia Roth" } },
  { id: "k110", type: "TWIN_SETUP", status: "OPEN", createdAt: today("09:10"), room: { id: "demo-110", number: "110", floor: 1 }, createdBy: { name: "Mia Roth" } },
  { id: "k402", type: "TWIN_REVERT", status: "DONE", createdAt: today("07:00"), doneAt: today("08:05"), room: { id: "demo-402", number: "402", floor: 4 }, createdBy: { name: "Mia Roth" } },
];

const fo = (id: string, n: string, guestName: string, eta: string, over: Record<string, unknown> = {}) => ({ id, guestName, source: "IMPORT", eta: today(eta), status: "EXPECTED", room: { id: `demo-${n}`, number: n, status: "DIRTY", openNotesCount: 0 }, ...over });
const ARRIVALS = [
  fo("a305", "305", "Herr Carter", "14:00", { earlyCheckIn: true, room: { id: "demo-305", number: "305", status: "INSPECTED" } }),
  fo("a312", "312", "Frau Dubois", "13:30", { earlyCheckIn: true }),
  fo("a310", "310", "Frau Müller", "15:00", { vip: true, room: { id: "demo-310", number: "310", status: "CLEAN" } }),
  fo("a412", "412", "Herr Dr. Krüger", "16:00", { vip: true }),
  fo("a208", "208", "Frau Okafor", "11:00", { status: "CHECKED_IN", room: { id: "demo-208", number: "208", status: "INSPECTED" } }),
]
  .map(normalizeArrival)
  .filter((x): x is ArrivalView => !!x);
const ex = (id: string, n: string, guestName: string, from: string, to: string, note?: string) => ({ id, guestName, startsAt: today(from), endsAt: today(to), note, room: { id: `demo-${n}`, number: n, openNotesCount: 0 } });
const EXCURSIONS = [
  ex("e305", "305", "Herr Carter", "10:00", "13:00", "Stadtführung"),
  ex("e307", "307", "Frau Dubois", "14:30", "17:00", "Spreefahrt"),
  ex("e308", "308", "Herr Tan", "19:30", "22:30", "Konzert"),
  ex("e412", "412", "Herr Dr. Krüger", "20:00", "23:00", "Dinner"),
]
  .map(normalizeExcursion)
  .filter((x): x is ExcursionView => !!x);

const noop = () => {};

export default function RolesDemo({ role, detail, state, confirm, newOpen }: { role: DemoRole; detail: boolean; state: string | null; confirm: boolean; newOpen?: boolean }) {
  const empty = state === "empty";
  const common = { loading: state === "loading", loadError: state === "error" ? "Verbindung unterbrochen (Demo)" : null, onRetry: noop, actionError: null };
  const [engSel, setEngSel] = useState<string | null>(detail ? "w312" : null);
  const [hmSel, setHmSel] = useState<string | null>(detail ? "trace:t207" : null);
  const [foSel, setFoSel] = useState<string | null>(detail ? "a305" : null);
  const [ccSel, setCcSel] = useState<string | null>(detail ? "e305" : null);
  const loadState = { loading: common.loading, loadError: common.loadError, onRetry: noop };
  if (role === "front_office") {
    return (
      <FrontOfficeHub {...common} {...loadState} arrivals={state ? [] : ARRIVALS} selectedId={foSel} onSelect={setFoSel} onSave={async () => true} onCreate={async () => null} onOpenRoom={noop} busyId={null} etaInput={(iso) => (iso ? hhmm(iso) : "")} newOpen={newOpen} />
    );
  }
  if (role === "concierge") {
    return <ConciergeHub {...loadState} excursions={state ? [] : EXCURSIONS} selectedId={ccSel} onSelect={setCcSel} onCreate={async () => null} onOpenRoom={noop} newOpen={newOpen} />;
  }
  if (role === "houseman") {
    const items = empty || state ? [] : mergeHousemanItems(TRACES, TASKS);
    return <HousemanHub {...common} items={items} floors={[1, 2, 3, 4]} selectedKey={hmSel} onSelect={setHmSel} onToggle={noop} busyKey={null} onPauseChanged={noop} />;
  }
  return (
    <EngineeringHub
      {...common}
      orders={empty || state ? [] : ORDERS}
      selectedId={engSel}
      onSelect={setEngSel}
      onAdvance={noop}
      busyId={null}
      onPauseChanged={noop}
      onOpenRoom={noop}
      confirmPreviewId={confirm ? "w312" : undefined}
    />
  );
}
