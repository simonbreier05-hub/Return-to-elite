import AppShell from "@/components/AppShell";
import { requirePage } from "@/lib/pageGuard";
import SupervisorView from "../view";

/** Zimmer mit Problemen (gesperrt, blockiert, DND, Mangel) als eigener Menüpunkt (Simon-Feedback 18.11.2026). */
export default async function SupervisorProblemsPage() {
  const session = await requirePage(["supervisor"]);
  return (
    <AppShell title="nav.problems" userName={session.name} role={session.role} legacy={false}>
      <SupervisorView isDutyManager={false} mode="problems" />
    </AppShell>
  );
}
