import AppShell from "@/components/AppShell";
import { requirePage } from "@/lib/pageGuard";
import HousemanView from "./view";

export default async function HousemanPage() {
  const session = await requirePage(["houseman"]);
  return (
    <AppShell title="roleHub.hmSubtitle" userName={session.name} role={session.role} legacy={false}>
      <HousemanView />
    </AppShell>
  );
}
