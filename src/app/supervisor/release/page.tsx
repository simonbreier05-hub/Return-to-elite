import AppShell from "@/components/AppShell";
import { requirePage } from "@/lib/pageGuard";
import SupervisorView from "../view";

/** Freigabe-Warteschlange als eigener Menüpunkt (Simon-Feedback 18.11.2026). */
export default async function SupervisorReleasePage() {
  const session = await requirePage(["supervisor"]);
  return (
    <AppShell title="nav.release" userName={session.name} role={session.role} legacy={false}>
      <SupervisorView isDutyManager={false} mode="release" />
    </AppShell>
  );
}
