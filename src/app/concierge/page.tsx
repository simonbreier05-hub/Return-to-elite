import AppShell from "@/components/AppShell";
import { requirePage } from "@/lib/pageGuard";
import ConciergeView from "./view";

export default async function ConciergePage() {
  const session = await requirePage(["concierge"]);
  return (
    <AppShell title="role.concierge" userName={session.name} role={session.role}>
      <ConciergeView />
    </AppShell>
  );
}
