import AppShell from "@/components/AppShell";
import { requirePage } from "@/lib/pageGuard";
import { roleHome } from "@/lib/domain";
import FloorPlanView from "./view";

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
  // Zuteilungsansicht ist im Design „Glas & Premium“ (D3); der reine Orientierungs-Grundriss der übrigen Rollen noch nicht.
  return (
    <AppShell title="appShell.floorPlan" userName={session.name} role={session.role} backHref={roleHome(session.role)} legacy={!canAssign}>
      <FloorPlanView canAssign={canAssign} />
    </AppShell>
  );
}
