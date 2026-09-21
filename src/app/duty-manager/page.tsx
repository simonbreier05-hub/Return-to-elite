import AppShell from "@/components/AppShell";
import { requirePage } from "@/lib/pageGuard";
import DutyManagerView from "./view";

export default async function DutyManagerPage() {
  // duty_manager passes every role check, so this is the admin-only page —
  // same pattern as /settings.
  const session = await requirePage(["duty_manager"]);
  return (
    <AppShell title="nav.dutyManager" userName={session.name} role={session.role}>
      <DutyManagerView />
    </AppShell>
  );
}
