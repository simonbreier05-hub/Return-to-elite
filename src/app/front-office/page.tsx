import AppShell from "@/components/AppShell";
import { requirePage } from "@/lib/pageGuard";
import FrontOfficeView from "./view";

export default async function FrontOfficePage() {
  const session = await requirePage(["front_office"]);
  return (
    <AppShell title="Front Office" userName={session.name} role={session.role}>
      <FrontOfficeView />
    </AppShell>
  );
}
