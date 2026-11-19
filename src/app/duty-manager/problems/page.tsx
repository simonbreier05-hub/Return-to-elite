import AppShell from "@/components/AppShell";
import { requirePage } from "@/lib/pageGuard";
import SupervisorView from "@/app/supervisor/view";

/**
 * Simon-Feedback 19.11.2026: „Probleme“ als eigener Punkt für den Duty Manager — gesperrte Zimmer (Grund/Ende ändern),
 * Zimmer-Aktionen und alle Zimmer mit Problemen im ganzen Haus. Dieselbe Ansicht wie beim Supervisor, ohne Etagen-Filter.
 */
export default async function DutyManagerProblemsPage() {
  const session = await requirePage(["duty_manager"]);
  return (
    <AppShell title="nav.problems" userName={session.name} role={session.role} legacy={false}>
      <SupervisorView isDutyManager mode="problems" />
    </AppShell>
  );
}
