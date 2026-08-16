import AppShell from "@/components/AppShell";
import { requirePage } from "@/lib/pageGuard";
import PlanningView from "./view";

export default async function PlanningPage() {
  const session = await requirePage(["supervisor"]);
  return (
    <AppShell title="Morning Planning" userName={session.name} role={session.role}>
      <PlanningView />
    </AppShell>
  );
}
