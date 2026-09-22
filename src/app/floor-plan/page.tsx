import AppShell from "@/components/AppShell";
import { requirePage } from "@/lib/pageGuard";
import { roleHome } from "@/lib/domain";
import FloorPlanView from "./view";

/** Reference page for every role — wayfinding, HSK/SVC-lift locations, and room flags. */
export default async function FloorPlanPage() {
  const session = await requirePage([
    "room_attendant",
    "supervisor",
    "front_office",
    "concierge",
    "engineering",
  ]);
  return (
    <AppShell title="appShell.floorPlan" userName={session.name} role={session.role} backHref={roleHome(session.role)}>
      <FloorPlanView />
    </AppShell>
  );
}
