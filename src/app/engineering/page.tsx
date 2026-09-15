import AppShell from "@/components/AppShell";
import { requirePage } from "@/lib/pageGuard";
import EngineeringView from "./view";

export default async function EngineeringPage() {
  const session = await requirePage(["engineering"]);
  return (
    <AppShell title="role.engineering" userName={session.name} role={session.role}>
      <EngineeringView />
    </AppShell>
  );
}
