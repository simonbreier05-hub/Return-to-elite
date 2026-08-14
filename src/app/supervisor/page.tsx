import AppShell from "@/components/AppShell";
import { requirePage } from "@/lib/pageGuard";
import SupervisorView from "./view";

export default async function SupervisorPage() {
  const session = await requirePage(["supervisor"]);
  return (
    <AppShell title="Live Board" userName={session.name} role={session.role}>
      <SupervisorView isDutyManager={session.role === "duty_manager"} />
    </AppShell>
  );
}
