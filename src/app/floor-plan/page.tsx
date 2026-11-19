import AppShell from "@/components/AppShell";
import { requirePage } from "@/lib/pageGuard";
import { roleHome } from "@/lib/domain";
import FloorPlanView from "./view";
import FrontOfficeFloorPlan from "@/components/roles/FrontOfficeFloorPlan";

/** Reference page for every role — wayfinding, HSK/SVC-lift locations, and room flags. */
export default async function FloorPlanPage() {
  const session = await requirePage([
    "room_attendant",
    "supervisor",
    "duty_manager",
    "front_office",
    "concierge",
    "engineering",
  ]);
  const canAssign = session.role === "supervisor" || session.role === "duty_manager";
  // Simon-Feedback 19.11.: Front Office bekommt einen eigenen, vereinfachten Zimmer-Hub (Glas) statt des Orientierungs-Grundrisses
  if (session.role === "front_office") {
    return (
      <AppShell title="nav.rooms" userName={session.name} role={session.role} legacy={false}>
        <FrontOfficeFloorPlan />
      </AppShell>
    );
  }
  // Simon-Feedback 19.11.2026: auch der Orientierungs-Grundriss der übrigen Rollen im Glas-Design
  return (
    <AppShell title="appShell.floorPlan" userName={session.name} role={session.role} backHref={roleHome(session.role)} legacy={false}>
      <FloorPlanView canAssign={canAssign} />
    </AppShell>
  );
}
