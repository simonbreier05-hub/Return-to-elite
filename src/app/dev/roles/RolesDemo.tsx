"use client";

import { useState } from "react";
import { EngineeringHub } from "@/components/roles/EngineeringHub";
import { HousemanHub } from "@/components/roles/HousemanHub";
import { normalizeWorkOrder, type WorkOrderView } from "@/lib/ui/engineeringHub";
import { mergeHousemanItems } from "@/lib/ui/housemanHub";
import { berlinDate, berlinToUtc } from "@/lib/dayplan/time";

export type DemoRole = "engineering" | "houseman";

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

const noop = () => {};

export default function RolesDemo({ role, detail, state, confirm }: { role: DemoRole; detail: boolean; state: string | null; confirm: boolean }) {
  const empty = state === "empty";
  const common = { loading: state === "loading", loadError: state === "error" ? "Verbindung unterbrochen (Demo)" : null, onRetry: noop, actionError: null };
  const [engSel, setEngSel] = useState<string | null>(detail ? "w312" : null);
  const [hmSel, setHmSel] = useState<string | null>(detail ? "trace:t207" : null);
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
