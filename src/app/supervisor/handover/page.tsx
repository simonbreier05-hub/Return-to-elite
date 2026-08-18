import AppShell from "@/components/AppShell";
import { requirePage } from "@/lib/pageGuard";
import HandoverView from "./view";

export default async function HandoverPage() {
  const session = await requirePage(["supervisor"]);
  return (
    <AppShell title="Shift Handover" userName={session.name} role={session.role}>
      <HandoverView />
    </AppShell>
  );
}
