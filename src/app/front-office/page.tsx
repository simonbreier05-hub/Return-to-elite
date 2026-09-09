import AppShell from "@/components/AppShell";
import { requirePage } from "@/lib/pageGuard";
import FrontOfficeView from "./view";

export default async function FrontOfficePage() {
  const session = await requirePage(["front_office"]);
  return (
    <AppShell title="role.front_office" userName={session.name} role={session.role}>
      <FrontOfficeView />
    </AppShell>
  );
}
